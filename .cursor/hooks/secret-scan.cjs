#!/usr/bin/env node
/**
 * Fail-closed secret scanner for agent hooks.
 *
 * Wired to `beforeReadFile` and `beforeShellExecution` in `.cursor/hooks.json`. Cursor imports
 * Claude Code's hook format, so the same script serves both tools.
 *
 * This is the cheapest real mitigation for agent-driven credential exfiltration: an agent that
 * reads a `.env` and then curls it somewhere is the documented attack, and blocking the read is
 * more reliable than hoping the model declines.
 *
 * Protocol (see https://cursor.com/docs/hooks):
 *   stdin  - JSON payload including `hook_event_name` and the event's own fields.
 *   stdout - `{"permission": "allow" | "deny" | "ask", "user_message": ..., "agent_message": ...}`
 *            The message keys are snake_case; camelCase variants are silently discarded.
 *
 * Three implementation constraints, all learned the hard way. With `failClosed` set, each of
 * these failure modes blocks every operation in the editor, so they matter more than usual:
 *
 * 1. Write the decision with `fs.writeSync(1, ...)`, not `process.stdout.write`. On a Windows
 *    pipe the latter is asynchronous and its callback fires when the data is queued rather than
 *    delivered, so the payload can be lost whether you exit from the callback or let the process
 *    end on its own. The audit log recorded complete writes on invocations Cursor reported as
 *    returning no output. `writeSync` blocks until the OS accepts the bytes.
 *
 * 2. Destroy stdin before exiting. Left open, the process lingers until Cursor kills it at the
 *    configured timeout.
 *
 * 3. Cursor prefixes the payload with a UTF-8 BOM, which `JSON.parse` rejects.
 *
 * Cursor fails *open* on crash, timeout, or unparsable output, so `failClosed: true` in
 * `.cursor/hooks.json` is what actually closes that hole.
 */

const fs = require('fs');
const path = require('path');

/** Rotate the audit log past this size, keeping one previous generation. */
const AUDIT_MAX_BYTES = 2 * 1024 * 1024;

/**
 * Appends one line per invocation to a gitignored audit log: what was requested, what was
 * decided, and how long it took. A security control that blocks silently is impossible to
 * operate, and this log is also the only way to tell a hook that denied something from a hook
 * that never ran at all.
 *
 * Best-effort by design. Logging must never be the reason a decision fails to reach Cursor.
 */
function audit(fields) {
  try {
    const logDir = path.join(__dirname, '..', '..', '.devenv');
    fs.mkdirSync(logDir, { recursive: true });

    const logPath = path.join(logDir, 'hook-audit.log');

    // This hook runs on every file read and every shell command, so an append-only log grows
    // without limit. Keep one previous generation and start fresh past the cap.
    try {
      if (fs.statSync(logPath).size > AUDIT_MAX_BYTES) {
        fs.renameSync(logPath, `${logPath}.1`);
      }
    } catch {
      // No log yet, or it cannot be rotated. Either way, fall through and append.
    }

    const line =
      JSON.stringify({
        at: new Date().toISOString(),
        elapsedMs: Math.round(process.uptime() * 1000),
        ...fields,
      }) + '\n';

    fs.appendFileSync(logPath, line);
  } catch {
    // Ignored deliberately: see above.
  }
}

/** Files whose contents are secrets by definition. Reading them into context is the leak. */
const BLOCKED_FILE_PATTERNS = [
  /(^|[\\/])\.env$/i,
  /(^|[\\/])\.env\.(?!.*\.(example|sample|template)$)[^\\/]+$/i,
  /(^|[\\/])(id_rsa|id_dsa|id_ecdsa|id_ed25519)$/i,
  /\.(pem|pfx|p12|keystore|jks)$/i,
  /(^|[\\/])\.npmrc$/i,
  /(^|[\\/])\.netrc$/i,
  /(^|[\\/])credentials(\.json)?$/i,
  /(^|[\\/])service-account[^\\/]*\.json$/i,
  /(^|[\\/])\.aws[\\/]/i,
  /(^|[\\/])\.ssh[\\/]/i,
  /(^|[\\/])\.git-credentials$/i,
];

/** Templates are safe: they carry placeholders, and contributors need to read them. */
const ALLOWED_FILE_PATTERNS = [/\.example$/i, /\.sample$/i, /\.template$/i];

/**
 * Paths exempt from the *content* scan, though still subject to the path checks above.
 *
 * Some files discuss credential formats as their subject matter: this scanner, its test corpus of
 * deliberately fake keys, and security documentation. Scanning their contents denies reading them,
 * which is both useless and actively obstructive - the hook blocked reads of its own test file,
 * so the tests could not be edited while the hook was enabled.
 *
 * This weakens nothing that the path rules already cover. A real secret in a file named
 * `secret-scan.test.js` is a problem, but it is not a problem this hook was ever going to catch,
 * and the alternative is a scanner nobody can work alongside.
 */
const CONTENT_SCAN_EXEMPT_PATTERNS = [
  // This scanner and its tests.
  /(^|[\\/])secret-scan[^\\/]*$/i,
  // Any test or fixture file. Fake credentials are the point of a scanner's test corpus.
  /(^|[\\/])(tests?|__tests__|fixtures?)[\\/]/i,
  /\.(test|spec)\.[cm]?[jt]sx?$/i,
  // Documentation about secret handling quotes the formats it warns about.
  /(^|[\\/])docs[\\/]/i,
  /\.mdc?$/i,
  // Vendored code is not ours to fix, and lockfiles carry high-entropy strings by design.
  /(^|[\\/])node_modules[\\/]/i,
  /(^|[\\/])(package-lock\.json|pnpm-lock\.yaml|yarn\.lock)$/i,
];

/**
 * Live credential material, matched against file *contents* rather than names. A token pasted
 * into an innocuously named config file is the case a path allowlist cannot catch.
 *
 * These are deliberately anchored to vendor-specific prefixes. Generic entropy heuristics
 * produce false positives on minified assets and lockfiles, and a scanner that cries wolf
 * gets switched off.
 */
const CONTENT_SECRET_PATTERNS = [
  { pattern: /\bAKIA[0-9A-Z]{16}\b/, label: 'an AWS access key ID' },
  { pattern: /\bghp_[A-Za-z0-9]{36}\b/, label: 'a GitHub personal access token' },
  { pattern: /\bgithub_pat_[A-Za-z0-9_]{60,}\b/, label: 'a GitHub fine-grained token' },
  { pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/, label: 'a Slack token' },
  { pattern: /\bsk-[A-Za-z0-9]{32,}\b/, label: 'an OpenAI-style secret key' },
  { pattern: /\bsk-ant-[A-Za-z0-9_-]{20,}\b/, label: 'an Anthropic API key' },
  { pattern: /-----BEGIN (RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/, label: 'a private key' },
  { pattern: /\bAIza[0-9A-Za-z_-]{35}\b/, label: 'a Google API key' },
  { pattern: /\bnpm_[A-Za-z0-9]{36}\b/, label: 'an npm access token' },
];

/**
 * Shell commands that would move credentials off the machine or print them into context.
 *
 * Each pattern requires both a sensitive target and an action, so ordinary development commands
 * pass. Blocking too broadly is its own failure: a hook that stops `npm test` gets removed, and
 * then nothing is protected. `tests/unit/secret-scan-hook.test.js` holds a corpus of routine
 * commands that must keep passing.
 *
 * Every gap between an action and its target is written `[^|;&\r\n]{0,120}`: bounded, and
 * newline-free. An earlier `[^|;&]*` spanned newlines and unlimited text, so an action verb
 * anywhere in a long script paired with any sensitive target far below it. That blocked a
 * `git commit` whose message happened to contain `"type": "module"` and, fifteen lines later,
 * `.env`. A real invocation keeps its target on the same line, close by.
 */
const BLOCKED_COMMANDS = [
  {
    pattern:
      /\b(curl|wget|nc|ncat|netcat|scp|rsync|ftp|Invoke-WebRequest|Invoke-RestMethod)\b[^|;&\r\n]{0,120}\$\{?[A-Za-z_]*(TOKEN|SECRET|API_?KEY|PASSWORD|CREDENTIAL)/i,
    reason: 'sends an environment secret to a remote host',
  },
  {
    // The `.example`/`.sample`/`.template` exclusion keeps template files readable; those
    // carry placeholders and contributors legitimately cat them.
    pattern:
      /\b(cat|head|tail|less|more|bat|Get-Content|type)\b[^|;&\r\n]{0,120}\.env(?!\.(?:example|sample|template)\b)(\.[A-Za-z0-9_-]+)?(?=\s|$|["'])/i,
    reason: 'prints a .env file into the transcript',
  },
  {
    pattern:
      /\b(curl|wget|Invoke-WebRequest|Invoke-RestMethod)\b[^|;&\r\n]{0,120}(--data|--data-binary|--upload-file|--form|-T|-F|-Body)\s*[^|;&\r\n]{0,120}\.env\b/i,
    reason: 'uploads a .env file',
  },
  {
    pattern: /\b(env|printenv)\b\s*\|\s*(curl|wget|nc|ncat|netcat|base64|xxd)/i,
    reason: 'pipes the environment to a network or encoding tool',
  },
  {
    pattern: /\bgit\s+config\s+[^|;&\r\n]{0,120}(user\.password|credential\.helper)\s*=/i,
    reason: 'rewrites stored git credentials',
  },
  {
    pattern: /\bnpm\s+(config\s+set\s+(_auth|_authToken)|token\s+create)/i,
    reason: 'creates or writes an npm auth token',
  },
  {
    // MCP config rewrites were the vector in CVE-2025-54135; changing them is a reviewed act.
    pattern:
      /(>>?|Set-Content|Out-File|\btee\b)\s*[^|;&\r\n]{0,120}(\.cursor[\\/]mcp\.json|(^|[\s"'/\\])\.mcp\.json)\b/i,
    reason: 'rewrites MCP server configuration outside of review',
  },
  {
    pattern: /\b(cat|Get-Content|type)\s+[^|;&\r\n]{0,120}(id_rsa|id_ed25519|\.pem)\b/i,
    reason: 'prints a private key into the transcript',
  },
];

const ALLOW = { permission: 'allow', user_message: '', agent_message: '' };

function deny(message) {
  return { permission: 'deny', user_message: message, agent_message: message };
}

function ask(userMessage, agentMessage) {
  return { permission: 'ask', user_message: userMessage, agent_message: agentMessage };
}

/** Set when the stdin safety timeout fires, meaning the payload read may be incomplete. */
let stdinTimedOut = false;

function readStdin() {
  return new Promise(resolve => {
    let data = '';
    let settled = false;

    // A safety net only, sized well below the `timeout` in hooks.json so this script produces a
    // decision rather than being killed, which Cursor treats as a hook failure.
    //
    // It must not fire in normal operation. `beforeReadFile` carries the entire file being read,
    // which for a large file arrives in many chunks; resolving on a 1500ms timer meant deciding
    // on a partial payload and then writing while Cursor was still sending. The wait is now long
    // enough that `end` always wins, and the payload is always complete when it is parsed.
    const timer = setTimeout(() => finish(true), 5000);

    function finish(viaTimeout) {
      if (settled) return;
      settled = true;
      // Recorded because a payload cut short here is almost certainly incomplete JSON, and the
      // resulting denial would otherwise look like a policy decision rather than a truncation.
      if (viaTimeout) stdinTimedOut = true;
      // Clearing the timer matters: an outstanding timer keeps the process alive for its full
      // duration, which would add seconds of latency to every hook invocation.
      clearTimeout(timer);
      resolve(data);
    }

    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => {
      data += chunk;
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
  });
}

/** Returns a denial reason for a path, or null when the path is safe to read. */
function checkFilePath(filePath) {
  const normalized = String(filePath).replace(/\\/g, '/');
  const base = path.posix.basename(normalized);

  if (ALLOWED_FILE_PATTERNS.some(pattern => pattern.test(base))) {
    return null;
  }

  const blocked = BLOCKED_FILE_PATTERNS.some(
    pattern => pattern.test(normalized) || pattern.test(base)
  );

  if (blocked) {
    return (
      `Blocked reading ${base}: this file holds credentials. ` +
      'Read the matching .example template instead, or describe what you need from it.'
    );
  }

  return null;
}

/**
 * Returns a denial reason for file contents, or null when no live credential is present.
 *
 * @param {string} content File contents, as Cursor supplies them on `beforeReadFile`.
 * @param {string} [filePath] Path being read. Files whose subject is credential formats are
 *   exempt from the content scan; see `CONTENT_SCAN_EXEMPT_PATTERNS`.
 * @returns {string|null} Denial reason, or null.
 */
function checkFileContent(content, filePath) {
  if (typeof content !== 'string' || !content) {
    return null;
  }

  if (filePath) {
    const normalized = String(filePath).replace(/\\/g, '/');
    if (CONTENT_SCAN_EXEMPT_PATTERNS.some(pattern => pattern.test(normalized))) {
      return null;
    }
  }

  for (const { pattern, label } of CONTENT_SECRET_PATTERNS) {
    if (pattern.test(content)) {
      return (
        `Blocked reading this file: it contains what looks like ${label}. ` +
        'Move the value into an ignored .env file and reference it by variable name.'
      );
    }
  }

  return null;
}

function checkCommand(command) {
  const text = String(command);

  for (const { pattern, reason } of BLOCKED_COMMANDS) {
    if (pattern.test(text)) {
      return `Blocked command: it ${reason}. Review and run it manually if that is intended.`;
    }
  }

  return null;
}

function decideReadFile(input) {
  // Every path the read would pull into context, including context attachments. A .env arriving
  // as an attachment leaks exactly as thoroughly as one opened directly.
  const paths = [input.file_path, input.filePath, input.path].filter(Boolean);

  if (Array.isArray(input.attachments)) {
    for (const attachment of input.attachments) {
      if (attachment && attachment.file_path) {
        paths.push(attachment.file_path);
      }
    }
  }

  for (const candidate of paths) {
    const reason = checkFilePath(candidate);
    if (reason) return deny(reason);
  }

  const contentReason = checkFileContent(input.content, paths[0]);
  if (contentReason) return deny(contentReason);

  return ALLOW;
}

function decideShellExecution(input) {
  const command = input.command || input.shell_command || input.commandLine;

  if (!command) {
    // Nothing to inspect on a shell event means the payload shape changed. Denying every
    // command would make the agent unusable, so surface it as an explicit approval instead.
    return ask(
      'Secret scanner could not read the command from this hook payload. Approve only if you recognize it.',
      'The secret scanner could not parse the command field. Ask the user to confirm.'
    );
  }

  const reason = checkCommand(command);
  if (reason) return deny(reason);

  return ALLOW;
}

/** Maps a hook payload to exactly one decision. */
function decide(raw) {
  // Cursor prefixes the payload with a UTF-8 BOM, which JSON.parse rejects outright. Without
  // stripping it every operation is denied for "unparsable payload".
  const text = String(raw).replace(/^\uFEFF/, '').trim();

  if (!text) {
    return deny('Secret scanner received no hook input; denying by default.');
  }

  let input;
  try {
    input = JSON.parse(text);
  } catch {
    return deny('Secret scanner could not parse the hook payload; denying by default.');
  }

  // Dispatch on the event name. `beforeMCPExecution` also carries a `command` field, so
  // sniffing which fields are present would conflate two different events.
  switch (input.hook_event_name) {
    case 'beforeReadFile':
    case 'beforeTabFileRead':
      return decideReadFile(input);
    case 'beforeShellExecution':
      return decideShellExecution(input);
    default:
      break;
  }

  // No event name (older payloads, or direct invocation in tests): fall back to whichever
  // fields are present rather than refusing to evaluate.
  if (input.file_path || input.filePath || input.path || input.content) {
    return decideReadFile(input);
  }

  if (input.command || input.shell_command || input.commandLine) {
    return decideShellExecution(input);
  }

  return deny('Secret scanner could not identify the requested operation; denying by default.');
}

/**
 * Extract the event name and target from a raw payload, for the audit log only.
 *
 * Deliberately tolerant: this runs after a decision is already made, so a malformed payload must
 * degrade to a partial log entry rather than throwing and losing the decision.
 *
 * @param {string} raw The stdin payload.
 * @returns {{event: string, target?: string}} Fields to merge into the log line.
 */
function describeInput(raw) {
  try {
    const input = JSON.parse(String(raw).replace(/^\uFEFF/, '').trim());
    return {
      event: input.hook_event_name || 'unknown',
      target: input.file_path || input.command || undefined,
    };
  } catch {
    return { event: 'unparsable' };
  }
}

async function main() {
  let decision;
  let raw = '';

  try {
    raw = await readStdin();
    decision = decide(raw);
  } catch (error) {
    decision = deny(`Secret scanner failed: ${error.message}. Denying by default.`);
  }

  // The trailing newline is required, not cosmetic. Cursor's reader is line-delimited, so a
  // response without one can sit in its buffer as an incomplete line and be discarded when the
  // process exits - reported as `returned no output`, which under `failClosed` blocks the
  // operation. The audit log recorded complete 59-byte writes for invocations Cursor called
  // empty; 59 is this payload with no newline. Cursor's own documented example emits one.
  const payload = `${JSON.stringify(decision)}\n`;

  audit({
    // The event and target make a denial traceable to the operation it blocked. Without them, a
    // log of bare permissions cannot answer "which read did this stop?" - which is what made the
    // hook's own test file being denied take so long to spot.
    ...describeInput(raw),
    permission: decision.permission,
    inputBytes: raw.length,
    stdinTimedOut: stdinTimedOut || undefined,
    reason: decision.user_message || undefined,
  });

  // Write the decision, then let the process end on its own.
  //
  // Getting this wrong is expensive: under `failClosed`, output that does not arrive blocks the
  // operation, so a delivery bug is indistinguishable from a denial. Three separate ways to lose
  // it, all of which were observed:
  //
  // 1. `process.stdout.write()` is asynchronous on a Windows pipe and its callback fires when the
  //    data is queued rather than delivered, so exiting after it can truncate the payload.
  //    `fs.writeSync` blocks until the OS accepts the bytes.
  // 2. A single `writeSync` can accept fewer bytes than it was given, or throw `EAGAIN` when the
  //    pipe is non-blocking. Both are normal, and both silently produced no usable output.
  //    `writeAllSync` loops until every byte is accepted.
  // 3. `process.stdin.destroy()` closed the read end while Cursor was still writing the payload.
  //    Small payloads had already arrived so it looked harmless, but `beforeReadFile` carries the
  //    entire file, and breaking the pipe mid-write cost the response. Nothing is destroyed now;
  //    `unref` is enough to stop stdin holding the event loop open.
  try {
    writeAllSync(1, payload);
    audit({ wrote: payload.length });
  } catch (error) {
    // EPIPE means Cursor stopped reading, so there is nothing left to report to.
    audit({ writeFailed: error.message });
  }

  if (typeof process.stdin.unref === 'function') {
    process.stdin.unref();
  }

  // Deliberately not `process.exit()`. An explicit exit is what truncated the payload in the
  // first place; a natural exit cannot run before the write above has completed.
  process.exitCode = 0;
}

/**
 * Write a complete string to a file descriptor, tolerating partial writes and a non-blocking pipe.
 *
 * @param {number} fd Descriptor to write to.
 * @param {string} text Payload to deliver in full.
 * @throws {Error} If the descriptor reports an error other than a full buffer.
 */
function writeAllSync(fd, text) {
  const buffer = Buffer.from(text, 'utf8');
  let offset = 0;

  while (offset < buffer.length) {
    try {
      offset += fs.writeSync(fd, buffer, offset, buffer.length - offset);
    } catch (error) {
      // EAGAIN means the pipe is full and non-blocking, not that the write failed. Retrying is
      // the documented handling; treating it as an error threw away the whole decision.
      if (error.code === 'EAGAIN') continue;
      throw error;
    }
  }
}

// Only read stdin when run as a hook; requiring this file (in tests) must not block on input.
if (require.main === module) {
  main();
}

module.exports = { decide, checkCommand, checkFilePath, checkFileContent };
