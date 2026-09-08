---
name: agent-workflow
description: Use when carrying out any coding task in this repo end-to-end - covers context gathering, PowerShell and npm command patterns, research-before-implement policy, error recording in docs/KNOWN_ERRORS.md, and the mandatory temp-file cleanup before reporting results.
---

# Agent workflow

Baseline behavior for agents working in DevEnvTemplate: how to gather context, run
commands, generate code, record errors, and finish cleanly.

## Project facts

- Node.js **24+** is required. TypeScript is strict, ES2020, CommonJS.
- `AGENTS.md` at the repo root (plus any nested `AGENTS.md`) is the canonical
  always-loaded project context. Treat it as always true.
- Documentation lives under `docs/` per `docs/DOCS_LAYOUT.md`. The docs root holds
  only entry points; topic docs belong in `docs/guides/`, `docs/architecture/`,
  `docs/best-practices/`, `docs/operational/`, or `docs/archive/`.

## Commands

```
npm run doctor            # health check
npm run doctor:fix        # health check with auto-fix
npm run build             # tsc --build
npm test                  # build, then run tests/**/*.test.js
npm run lint              # eslint
npm run format            # prettier --write
npm run clean             # remove build output
npm run check:doc-links   # validate documentation links
```

**Always use the `--` separator when passing a flag through an npm script.** npm
consumes flags that appear before it, so the script never sees them:

```
npm run doctor -- --fix     # correct: --fix reaches the CLI
npm run doctor --fix        # wrong: npm swallows --fix
```

## Conversation and context

- Prefer a new chat for each new unit of work so the agent stays focused. Bring in
  only the prior context you need (a file reference, a short summary) rather than
  dragging a very long thread forward.
- If a thread becomes noisy or self-contradictory, summarize progress and start a
  fresh chat with that summary as the first message.

## Context window awareness

- **Read targeted, not everything.** Read specific line ranges or search
  semantically instead of dumping entire large files.
- **Pick the right search tool.** Use `Grep` for an exact symbol or string, semantic
  search for exploratory "how does X work" questions, and `Glob` to find files by
  name pattern.
- **Decompose.** Break large tasks into subtasks; complete and report each one
  before starting the next.
- **Avoid context pollution.** Do not read files you do not need, and do not re-read
  files whose content you already have.

## Tool usage

- Read a file before editing it. Never assume its structure.
- Batch related operations when they are independent.
- Verify changes with the linter and tests.
- Never limit terminal output with `Select-Object -First N`; it triggers VPN and
  network issues. Accept full output, or use the command's own output flags.

## Terminal patterns (PowerShell)

- Chain with `;`, never `&&`. Example: `cd project; npm install`.
- Split complex chains into separate commands.
- Check a path before navigating to it: `if (Test-Path "path") { Set-Location "path" }`.
- Build paths with `Join-Path`; prefer absolute paths from the workspace root.

## Code generation

- Generate complete, working code. No `TODO` placeholders left behind.
- Include error handling and validate inputs at boundaries.
- Comment complex logic only; follow existing project patterns.
- Verify the code compiles and runs.
- **Verifiable goals:** for feature work, define or run tests as the success
  criterion and iterate until they pass, or state explicitly why tests are deferred.

## File management

- Read before editing; preserve existing structure where possible.
- Update related files (tests, docs) in the same change.
- Do not create files the task does not need.

### When a file is blocked by globalignore

If creating or editing a file is blocked (for example `.env.example`):

1. Confirm whether the file exists and is gitignored.
2. Run `git update-index --no-assume-unchanged <file>` to temporarily unignore it.
3. Make the change.
4. Run `git update-index --assume-unchanged <file>` to re-ignore it if needed.

Alternatively, create the file programmatically with a Node script instead of
editing it directly.

## Feature development: research, then tutorials, then build

When developing a new feature (new system, new integration, or a significant new
capability), follow this order as policy:

1. **Research** using official docs and project docs, including
   `docs/KNOWN_ERRORS.md` and the relevant guides under `docs/`.
2. **Follow tutorials** — official or version-specific — before customizing.
3. **Implement**, then **expand or adapt** only where this project explicitly needs
   something different.

## Validation schemas

Verify that request or input types match the validation schema's actual shape. If
the code uses a flat structure (`depth_min`, `depth_max`) but the schema expects a
nested one (`depth_range.min`), adapt the schema to match reality, test it against
real request objects, and document any deliberate structural difference.

## Adding test infrastructure

Add every testing dependency to `package.json` — framework, utilities, type
definitions, coverage tools — and install them *before* writing tests. Document
required devDependencies in the setup instructions.

## Error recurrence prevention

- **When an error occurs** (build, lint, test, or runtime), state clearly what
  failed (command, file, or step), the likely cause, and the fix applied. Do not
  continue as if the error were unimportant.
- **Record it** in `docs/KNOWN_ERRORS.md` as a short entry: symptom, cause, fix,
  date.
- **Before making similar changes**, read `docs/KNOWN_ERRORS.md` so a previously
  documented failure is not repeated.
- If the failure stems from a tool that cannot be scripted, also record it in
  `docs/operational/automation-gaps.md`.

## Hard-to-reproduce bugs

For regressions, race conditions, and performance problems, suggest the IDE's debug
mode: the user reproduces the bug while the agent collects runtime data, adds
logging, forms hypotheses, and applies evidence-based fixes. Do not guess — use
instrumentation.

## When to ask for confirmation

- Breaking changes.
- Large refactorings (more than ~10 files).
- Security-sensitive changes.
- Changes to core architecture.
- Any time the user's intent is unclear.

## Communication

- Explain the approach before implementing it, and show the reasoning behind
  non-obvious decisions.
- Flag uncertainties and offer alternatives when blocked.
- Stay professional; do not apologize.

## Session cleanup (mandatory before ending a task)

Delete temporary files created during the session before the task is considered
complete:

1. Diagnostic or result files in the project root (one-off `*.json` dumps, ad-hoc
   reports) that are not project artifacts.
2. One-off scripts written for debugging or a single fix. Keep only reusable,
   idempotent scripts referenced by an orchestrator or the docs.
3. Temporary log or dump files created for intermediate inspection.

Clean up after the objectives are verified and before reporting results. Do not
defer cleanup to a future session.

## Checklist

- [ ] Context gathered before making changes
- [ ] Changes are complete, with no stray TODOs
- [ ] Related files (tests, docs) updated
- [ ] Code follows existing project patterns
- [ ] User informed of the approach
- [ ] Errors recorded; known errors checked before repeating similar work
- [ ] Scripts that create resources are idempotent (check before create, no
      duplicates on re-run)
- [ ] Session cleanup done — temporary scripts, result files, and diagnostic
      artifacts deleted
