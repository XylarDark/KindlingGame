---
name: documentation
description: Use when writing or updating code comments, README or API docs, or adding any file under docs/ - covers comment intent, the canonical docs/ layout from DOCS_LAYOUT.md, and checking relative links by hand after a move or rename.
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

Read `docs/DOCS_LAYOUT.md` for the current inventory rather than trusting a copy here;
`DOCS_LAYOUT.md` and `KNOWN_ERRORS.md` are the two entry points this skill depends on.

Everything else goes in a topic subdirectory:

| Directory | Contents |
| --- | --- |
| `guides/` | How-to and long-form guides |
| `operational/` | Automation gaps, recurring maintenance |
| `promo/` | Curated promotional stills |

Create a subdirectory only once you have a document to put in it, and add its row to
`DOCS_LAYOUT.md` in the same change.

Rules for new docs:

1. Put the file in the subdirectory that fits. Do not add it to the docs root unless
   `DOCS_LAYOUT.md` lists it as an entry point.
2. If no folder fits, add the folder and a one-line purpose to `DOCS_LAYOUT.md` **first**,
   then write the document.
3. If you add an `archive/` folder, treat it as read-only by convention. Do not update
   archived documents to match current behavior — their value is recording what was decided
   at the time. Anything still true belongs in a live document.

## Links

- Write paths from the repo root (`docs/guides/usage.md`) or use a correct relative path
  from the current file.
- Use descriptive link text, never "click here".
- Use relative paths for internal links and absolute URLs for external ones.
- This repo has no automated link checker. After moving or renaming a document, grep for
  the old filename and fix every hit by hand:

  ```powershell
  git grep -n "old-name.md"
  ```

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
- [ ] Relative links still resolve after any move or rename
- [ ] No outdated documentation left behind
