---
name: documentation
description: Use when writing or updating code comments, README or API docs, or adding any file under docs/ - covers comment intent, the canonical docs/ layout from DOCS_LAYOUT.md, and verifying links with npm run check:doc-links.
---

# Documentation

## Code comments

- Explain **why**, not **what**; the code should already say what it does.
- Comment complex business logic and non-obvious decisions.
- Update comments when the code they describe changes.
- Delete commented-out code instead of leaving it as history.

## Function and API documentation

- Document public APIs: parameters, return values, and thrown errors.
- Include a usage example for anything with non-obvious inputs.
- Document side effects, and performance characteristics where they matter.
- For HTTP APIs, document every public endpoint with request and response examples, error
  responses, and authentication requirements.

Optional file headers on complex files: a one-line purpose and the key exports.

## README standards

A README covers: what the project is, how to install it, how to use it (with examples),
what can be configured, how to contribute, and the license.

## Where documentation goes

All documentation lives under `docs/`, laid out per `docs/DOCS_LAYOUT.md`, which is the
semantic source of truth for what belongs where.

**The docs root is an exhaustive list of entry points.** Only these files belong at
`docs/`:

| File | Purpose |
| --- | --- |
| `README.md` | Docs index |
| `DOCS_LAYOUT.md` | The canonical structure itself |
| `BEST-PRACTICES.md` | Cross-cutting practices |
| `TROUBLESHOOTING.md` | Common failures and fixes |
| `KNOWN_ERRORS.md` | Recurring errors and fixes (append-only) |
| `SETUP-GUIDE.md` | Getting started with this template |
| `SYNC.md` | Syncing from the template |
| `DevEnvTemplate_RULES_SYNC.md` | Append-only log of template rule changes |

Everything else goes in a topic subdirectory:

| Directory | Contents |
| --- | --- |
| `guides/` | How-to and long-form guides |
| `architecture/` | System design, diagrams, ADR supplements |
| `best-practices/` | Per-stack practice guides (`python.md`, `fastapi.md`) |
| `operational/` | Automation gaps, recurring maintenance |
| `templates/` | Fork-specific stubs (`templates/unity/`, `templates/unreal/`) |
| `archive/` | Superseded plans, RFCs, and release notes |

`DOCS_LAYOUT.md` lists further optional folders (`adr/`, `runbooks/`, `setup/`,
`security/`, `deployment/`, `api/`). Create a subdirectory only once you have a document to
put in it, and add its row to `DOCS_LAYOUT.md` in the same change.

Rules for new docs:

1. Put the file in the subdirectory that fits. Do not add it to the docs root unless it is
   one of the entry points above.
2. If no folder fits, add the folder and a one-line purpose to `DOCS_LAYOUT.md` **first**,
   then write the document.
3. `docs/archive/` is read-only by convention. Do not update archived documents to match
   current behavior — their value is recording what was decided at the time. Anything still
   true belongs in a live document.
4. `config/docs-organization.yaml` drives pattern-based moves (see
   `docs/guides/docs-organization.md`). Automation may relocate a misplaced file, but author
   it in the right folder anyway.

## Links

- Write paths from the repo root (`docs/guides/usage.md`) or use a correct relative path
  from the current file.
- Use descriptive link text, never "click here".
- Use relative paths for internal links and absolute URLs for external ones.
- Verify links before committing:

  ```bash
  npm run check:doc-links
  ```

  This resolves every relative markdown link in the repo and fails on any that is broken.
  Run it after moving or renaming a document.

## Maintenance

- Update docs in the same change as the code they describe.
- Delete outdated documentation rather than leaving it to mislead.
- Keep examples working; test them before committing.

## Checklist

- [ ] Public APIs documented
- [ ] README current
- [ ] Complex logic explained by a comment that gives the reason
- [ ] Examples run as written
- [ ] New docs placed per `DOCS_LAYOUT.md`
- [ ] `npm run check:doc-links` passes
- [ ] No outdated documentation left behind
