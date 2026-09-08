# Cursor rules for Kindling

These rules come from [DevEnvTemplate](https://github.com/XylarDark/DevEnvTemplate). Its `AGENTS.md` says that game/engine repos should copy the **Cursor/docs layer** — rules, a host-written `AGENTS.md`, `docs/DOCS_LAYOUT.md`, `docs/KNOWN_ERRORS.md` and `docs/operational/automation-gaps.md` — rather than embedding the Node `doctor` tool as `.devenv/`. That is what this directory is.

Cursor also loads the root [AGENTS.md](../../AGENTS.md) automatically. Keep both it and the always-on rules short; the goal is a small always-on set plus rules that load only when relevant.

Official frontmatter fields are `description`, `globs` and `alwaysApply`. Do not add a sibling `.cursorrules` or `.projectrules` file.

## Always applied

- **00-core-principles.mdc** — reasoning transparency, idempotency, pre-flight checklist
- **01-code-quality.mdc** — naming, structure, design, performance awareness
- **02-security.mdc** — secrets and OWASP baseline
- **03-testing.mdc** — test philosophy and structure
- **04-git-workflow.mdc** — conventional commits, branch naming
- **05-error-handling.mdc** — defensive programming, recording errors
- **07-ai-agent-behavior.mdc** — tool use, context management, session cleanup
- **08-project-context.mdc** — **Kindling-specific**: stack, commands, layout, definition of done
- **17-plan-first.mdc** — plan before complex or multi-file work
- **automation-standards.mdc** — prefer API over script over UI automation; record gaps

`08-project-context.mdc` is written for this project. The template ships its own copy describing DevEnvTemplate itself, and that copy is deliberately **not** used here — hosts write their own.

## Applied intelligently (no globs; the agent decides from the task)

- **06-documentation.mdc** — comment and documentation standards
- **16-feature-debug-instrumentation.mdc** — log-driven validation for new features
- **18-content-and-data-pipelines.mdc** — preserve authored state; destructive work behind explicit flags

## Applied to matching files

- **10-typescript.mdc** — `**/*.ts`, `**/*.tsx`
- **11-javascript.mdc** — `**/*.js`, `**/*.jsx`
- **13-markdown.mdc** — `**/*.md`
- **14-json-yaml.mdc** — `**/*.json`, `**/*.yaml`, `**/*.yml`
- **19-docs-directory-structure.mdc** — `docs/**` and `.cursor/rules/*.mdc`; place docs per [docs/DOCS_LAYOUT.md](../../docs/DOCS_LAYOUT.md)

## Deliberately not copied

Kindling is a TypeScript browser game, so several template rules would only add noise:

| Rule | Why not |
|------|---------|
| `08-project-context.mdc` (template's own) | Template-only by design; replaced by the Kindling version above |
| `12-python.mdc` | No Python in this repo |
| `15-shell-scripts.mdc` | No `.sh`, `.ps1` or `.bat` files; tooling is `npx tsx` TypeScript |
| `20-frontend-frameworks.mdc` | Scoped to `components/`, `pages/`, `app/`; Phaser scenes use none of these |
| `21-unreal-engine.mdc`, `22-unreal-editor-ui.mdc` | No `.uproject` |
| `23-unity-csharp.mdc` | No `ProjectSettings/ProjectVersion.txt` |

## Updating from the template

The template treats the core rules (`00`–`07`, `17`, `automation-standards`) as its own and overwrites them on sync, while host files are preserved. So keep project-specific truth in `08-project-context.mdc`, `AGENTS.md` and `docs/`, and avoid editing the copied core files — an edit there will be silently lost the next time the rules are refreshed.

Copies here were taken byte-for-byte and verified by hash against DevEnvTemplate commit `f0b7454` (branch `feat/cursor-2026-unity`), which is the snapshot that carries the template's `AGENTS.md` and the modern small-always-on rule design.

Three links inside the copied rules point at files this project does not have. All three are conditional in their source text, so they are expected rather than broken:

- `05-error-handling.mdc` → `docs/LESSONS_LEARNED.md` — the rule offers it as an alternative name and tells forks to pick one. This project's canonical log is [docs/KNOWN_ERRORS.md](../../docs/KNOWN_ERRORS.md), which exists.
- `18-content-and-data-pipelines.mdc` → `21-unreal-engine.mdc` — only applies to Unreal projects.
- `19-docs-directory-structure.mdc` → `docs/guides/docs-organization.md` — only applies if the repo adopts the pattern-based docs organizer, which it has not.
