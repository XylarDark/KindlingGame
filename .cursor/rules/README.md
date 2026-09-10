# Cursor rules

Every rule here is **glob-scoped**: it enters the context window only when the agent touches a
matching file. Nothing in this directory is always applied, and that is deliberate.

Always-loaded context belongs in one of two other places:

- **[`AGENTS.md`](../../AGENTS.md)** (repository root) — facts about Kindling that are true on every
  turn: the stack, the commands, the layout, the shared dev server, and the definition of done.
  Cursor loads it automatically, as do Claude Code, Codex, and Gemini CLI, so one file serves every
  tool.
- **`.agents/skills/<name>/SKILL.md`** — procedural knowledge. A skill costs only its `description`
  until that description matches the task, then the agent reads the body. `game-capture` is the
  project-specific one: screenshot lanes, step plans, and the Cursor browser's tab-creation race.
  Optional / dormant skills belong in `.agents/skills-extras/`; see
  [`.agents/README.md`](../../.agents/README.md). Kindling currently keeps template extras
  **active** under `.agents/skills/` on purpose.

Every skill `description` is always-loaded with `AGENTS.md`. That bill is tracked in `AGENTS.md`;
adding a skill is a permanent charge against it.

## Why nothing here is always-applied

This directory used to carry 10 always-applied rules totalling 949 lines, loaded on every single
turn regardless of the task. Long context evaluations consistently find that irrelevant
always-loaded context *lowers* accuracy, so the cost was not merely wasted, it was harmful.

Counting `AGENTS.md`, per-turn context went from 1,046 lines to 139. `npm run doctor` reports the
always-apply budget, so re-adding one is a visible decision rather than a quiet regression.

Where the retired rules went:

| Was | Now |
| --- | --- |
| `00-core-principles` | `AGENTS.md`, working agreements |
| `01-code-quality` | `.agents/skills/code-structure` |
| `02-security` | `.agents/skills/secure-coding` |
| `03-testing` | `.agents/skills/testing-standards` |
| `04-git-workflow` | `AGENTS.md`, definition of done |
| `05-error-handling` | `.agents/skills/defensive-programming` |
| `06-documentation`, `19-docs-directory-structure` | `.agents/skills/documentation` |
| `07-ai-agent-behavior` | `.agents/skills/agent-workflow` |
| `08-project-context` | `AGENTS.md` — stack, commands, layout, local conventions |
| `16-feature-debug-instrumentation` | `.agents/skills/debug-instrumentation` |
| `17-plan-first` | `.agents/skills/plan-first` |
| `18-content-and-data-pipelines` | `.agents/skills/data-pipeline-safety` |
| `automation-standards` | `.agents/skills/automation-standards` |

## The rules

| Rule | Applies to |
| --- | --- |
| `10-typescript.mdc` | `**/*.ts`, `**/*.tsx` |
| `11-javascript.mdc` | `**/*.js`, `**/*.jsx` |
| `13-markdown.mdc` | `**/*.md` |
| `14-json-yaml.mdc` | `**/*.json`, `**/*.yaml`, `**/*.yml` |
| `15-shell-scripts.mdc` | `**/*.sh`, `**/*.ps1`, `**/*.bat` |
| `20-frontend-frameworks.mdc` | `**/components/**`, `**/pages/**`, `**/app/**` |

The leading numbers group related rules for humans. Cursor ignores them, and it ignores any
frontmatter key outside `description`, `globs`, and `alwaysApply`.

## File format

```yaml
---
description: What this rule covers, shown in the rule picker
globs: '**/*.ts'
alwaysApply: false
---
```

Write `globs`, plural. A singular `glob:` key is silently ignored, which produces a rule that looks
scoped but never loads.

## Keeping these in sync with the template

These rules come from [DevEnvTemplate](https://github.com/XylarDark/DevEnvTemplate), embedded at
`.devenv/`. Prefer the layer-aware sync (dry-run first):

```powershell
npm run sync
npm run sync '--' --apply
```

Or integrate via the doctor:

```powershell
npm run doctor '--' --integrate-cursor-rules
```

Existing files are never overwritten, so local edits survive. Compare against
`.devenv/.cursor/rules/` if you want the newer version of a rule you have changed.
