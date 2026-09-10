#!/usr/bin/env node

/**
 * Kindling's hardening gate: the one-time check run when features and taste are locked and a
 * change large enough to move the game's shape is about to ship.
 *
 * This game is already live on GitHub Pages on every push to `master`, so the gate is a
 * re-hardening rather than a first release. It is short on purpose: there is no backend, no
 * credentials, and no user data. See docs/operational/automation-gaps.md.
 *
 * `verify.mjs` already type-checks, tests, and builds (Pages serves that build). Preflight adds
 * the dependency audit, registry signatures, and a secret scan that live nowhere in CI — the
 * security workflow was deliberately not re-added because failures email the owner.
 *
 * Usage:
 *   npm run preflight            run every stage, report evidence
 *   npm run preflight -- --json  machine-readable evidence
 */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { runStage, summarize } from './pipeline.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EVIDENCE_PATH = path.join(REPO_ROOT, '.devenv', 'preflight-report.json');

/** True when `gitleaks` is on PATH. Absence makes the secret scan `not run`, never a pass. */
function hasGitleaks() {
  const probe = spawnSync('gitleaks', ['version'], {
    encoding: 'utf8',
    shell: process.platform === 'win32',
  });

  return !probe.error && probe.status === 0;
}

const STAGES = [
  {
    id: 'verify',
    title: 'Verify pipeline',
    proves: 'Types, the Vitest suite, and the Vite production build are all sound.',
    command: 'node',
    args: ['scripts/verify.mjs', '--json'],
    evidence: ({ stdout }) => {
      const report = parseJsonReport(stdout);
      if (!report?.summary) return null;

      return report.verified
        ? `${report.summary.passed} of ${report.summary.total} verify stages passed with evidence`
        : null;
    },
  },
  {
    id: 'audit',
    title: 'Dependency audit',
    proves: 'No known vulnerability at high severity or above in the dependency tree.',
    command: 'npm',
    args: ['audit', '--audit-level=high'],
    evidence: ({ stdout, stderr }) => {
      const found = `${stdout}\n${stderr}`.match(/found (\d+) vulnerabilit/i);
      return found ? `${found[1]} vulnerabilities at high or above` : null;
    },
  },
  {
    id: 'signatures',
    title: 'Registry signatures',
    proves: 'Installed packages match what the registry signed, so the supply chain is intact.',
    command: 'npm',
    args: ['audit', 'signatures'],
    evidence: ({ stdout, stderr }) => {
      const verified = `${stdout}\n${stderr}`.match(
        /(\d+) packages? have verified registry signatures/i
      );
      return verified ? `${verified[1]} packages have verified registry signatures` : null;
    },
  },
  {
    id: 'secrets',
    title: 'Secret scan',
    proves: 'No credential is committed anywhere in the history gitleaks scanned.',
    command: 'gitleaks',
    args: ['detect', '--no-banner', '--redact'],
    available: hasGitleaks,
    unavailableDetail:
      'gitleaks is not installed, so no secret scan ran. This is NOT a pass: nothing else in ' +
      'this project scans for committed credentials (CI deliberately has no security job). ' +
      'Install it (winget install gitleaks, brew install gitleaks) and run preflight again.',
    evidence: ({ stdout, stderr }) => {
      const combined = `${stdout}\n${stderr}`;
      const leaks = combined.match(/(\d+) leaks? found/i);
      if (leaks) return `${leaks[1]} leaks found`;

      return /no leaks found/i.test(combined) ? '0 leaks found' : null;
    },
  },
];

/**
 * Pull a pretty-printed JSON report out of mixed output.
 *
 * @param {string} stdout Captured output.
 * @returns {object|null} The parsed report, or null when there is none.
 */
function parseJsonReport(stdout) {
  const lines = stdout.split('\n').map(line => line.trimEnd());
  const starts = lines.flatMap((line, i) => (line === '{' ? [i] : []));
  const ends = lines.flatMap((line, i) => (line === '}' ? [i] : [])).reverse();

  for (const start of starts) {
    for (const end of ends) {
      if (end <= start) continue;

      try {
        return JSON.parse(lines.slice(start, end + 1).join('\n'));
      } catch {
        // Not the report's extent. Keep looking.
      }
    }
  }

  return null;
}

/**
 * Controls a release depends on that no command in this repository can observe.
 */
const REQUIRES_SIGN_OFF = [
  'Who can push to master (and therefore deploy to GitHub Pages), and whether that is intentional',
  'Whether the Pages environment has any protection at all',
  'Whether the live Pages artifact was built from this commit of this tree',
  'A capture of the deployed URL after the deploy finishes — pages.yml ships no capture, and ' +
    'tsc misses boot-time crashes',
];

function main() {
  const asJson = process.argv.slice(2).includes('--json');
  const results = [];

  if (!asJson) {
    console.log('\nHardening preflight. Every stage runs; none is skipped on an earlier failure,');
    console.log('because at release time you want the whole list, not the first item on it.\n');
  }

  for (const stage of STAGES) {
    if (!asJson) process.stdout.write(`  ${stage.title}... `);

    const result = runStage(stage, REPO_ROOT);
    results.push(result);

    if (!asJson) {
      const seconds = (result.durationMs / 1000).toFixed(1);
      console.log(
        result.status === 'passed'
          ? `passed  (${result.evidence}, ${seconds}s)`
          : `${result.status.toUpperCase()}  (${seconds}s)`
      );
    }
  }

  const { failed, notRun, passed, verified, counts } = summarize(results);

  const report = {
    generatedAt: new Date().toISOString(),
    node: process.version,
    platform: process.platform,
    cleared: verified,
    summary: counts,
    stages: results,
    requiresHumanSignOff: REQUIRES_SIGN_OFF.map(item => ({ item, status: 'requires sign-off' })),
  };

  try {
    fs.mkdirSync(path.dirname(EVIDENCE_PATH), { recursive: true });
    fs.writeFileSync(EVIDENCE_PATH, JSON.stringify(report, null, 2));
  } catch (error) {
    console.error(`Warning: could not write evidence to ${EVIDENCE_PATH}: ${error.message}`);
  }

  if (asJson) {
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.cleared ? 0 : 1;
    return;
  }

  console.log('');

  for (const result of [...failed, ...notRun]) {
    console.log(`${result.title} ${result.status.toUpperCase()}:`);
    console.log(`  command: ${result.command}`);
    if (result.detail) {
      console.log(
        result.detail
          .split('\n')
          .map(line => `  ${line}`)
          .join('\n')
      );
    }
    console.log('');
  }

  console.log('A human owns these. No run of this command can clear them:');
  for (const item of REQUIRES_SIGN_OFF) console.log(`  [ ] ${item}`);
  console.log('');
  console.log('Work them with the hardening pass in .agents/skills/secure-coding/SKILL.md.\n');

  if (report.cleared) {
    console.log(
      `Preflight cleared ${passed.length} of ${results.length} stages with evidence. ` +
        'The sign-off list above is still open.'
    );
  } else {
    console.log(
      `Preflight did not clear: ${passed.length} of ${results.length} stages passed. ` +
        `Evidence in ${path.relative(REPO_ROOT, EVIDENCE_PATH)}.`
    );
  }

  process.exitCode = report.cleared ? 0 : 1;
}

main();
