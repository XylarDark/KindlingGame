# Documentation layout (canonical)

**Purpose:** the single place that says **where documentation belongs** in this repo, so agents and humans stop inventing new buckets at `docs/` root.

**Policy:** do not add a new top-level doc topic without adding a row here in the same change. This file is the semantic source of truth; [19-docs-directory-structure.mdc](../.cursor/rules/19-docs-directory-structure.mdc) points agents at it.

---

## Root (`docs/`) — entry points and standing logs

| File | Purpose |
|------|---------|
| **DOCS_LAYOUT.md** | This file — canonical structure. |
| [KNOWN_ERRORS.md](KNOWN_ERRORS.md) | Recurring or expensive failures and their fixes. Append-only; read before similar work. |
| [promo.md](promo.md) | How the promotional stills are produced and what each one shows. |

## Naming conventions at root

This project's docs are mostly **findings**, not manuals, and two prefixes carry meaning:

| Pattern | Purpose | Examples |
|---------|---------|----------|
| `qa-*.md` | A QA pass over one slice of the game, usually produced with a capture script | `qa-traffic.md`, `qa-typography.md`, `qa-interactions-glitches.md` |
| `audit-*.md` | A broader review with judgement calls and recommendations | `audit-aesthetics-gameplay.md` |

Keep new findings in that shape: one file per pass, prefix by kind, name the slice. A QA pass over the shop UI would be `qa-shop.md`.

## Subdirectories

| Directory | Purpose | Notes |
|-----------|---------|-------|
| **guides/** | How-to docs for local tooling humans run by hand | [`android-emulator.md`](guides/android-emulator.md) — AVD + Chrome for PWA/SW install checks (not FPS); [`smooth-2d-runtime.md`](guides/smooth-2d-runtime.md) — frame budget, adaptive renderScale, PostFX, Drive static bake |
| **operational/** | What automation cannot do reliably, and the manual step that covers it | [`automation-gaps.md`](operational/automation-gaps.md), per [automation-standards.mdc](../.cursor/rules/automation-standards.mdc) |
| **promo/** | Curated stills, committed deliberately | **Authored work** — capture scripts must not bulk-overwrite these. See [18-content-and-data-pipelines.mdc](../.cursor/rules/18-content-and-data-pipelines.mdc) |
| **qa-shots/** | Screenshot scratch from capture runs | **Gitignored.** Anything worth keeping gets curated into `promo/` |

Create a new subdirectory only when you have a document to put in it, then add a row above.

## Deliberately absent

The template offers `architecture/`, `adr/`, `runbooks/`, `setup/`, `security/`, `api/` and
`deployment/`. None are used here: Kindling is a static browser game with no services to run, no
API surface, and no deployment beyond the GitHub Pages workflow in `.github/workflows/pages.yml`.
Add one of these folders if the need actually arises — and add its row here — rather than
pre-creating empty scaffolding.

## Related

- [AGENTS.md](../AGENTS.md) — the operational protocol for working in this repo (capture lanes, dev server, definition of done)
- [.cursor/rules/README.md](../.cursor/rules/README.md) — the rule catalog and what was skipped
