---
name: data-pipeline-safety
description: Use when automation reads or writes author-owned artifacts such as databases, CMS entries, infrastructure state, version-controlled binaries, design files, or game content - keeps the default path create-if-missing and update-in-place, and gates destructive operations behind an explicit flag or runbook step.
---

# Content and data pipeline safety

These principles apply whenever automation or an agent touches **author-owned
artifacts**: database content, CMS entries, infrastructure state, large binaries in
version control, design files, or game content such as levels and assets. They keep
pipelines iterative and non-destructive by default.

## 1. Preserve authored work

- Do not delete, overwrite, or bulk-recreate authored artifacts in a normal run
  unless the user or a runbook explicitly opted in.
- Version-controlled binaries and assets (Git LFS objects, for example) represent
  real work. Automation that replaces them without intent risks data loss and
  broken collaboration.

## 2. Create if missing, update in place

- **If the resource exists,** reuse it. Change only what is driven by config, a
  schema, or a narrowly scoped script.
- **If it is absent,** create it once, then reuse it on future runs.
- **Re-runs must be safe:** no duplicate resources, no silent wipes of manual
  edits. Log whether each resource was created, reused, or skipped, so a re-run
  does not look like it silently did nothing.

## 3. Destructive operations are explicit

- **Opt-in only.** Reset, drop, reimport-from-scratch, and "nuke" paths require a
  clear flag, a ticket, or a documented runbook step. Never the default.
- **Document the escape hatches.** State what each one destroys, when to use it,
  and that day-to-day iteration does not require it.

## 4. Config and code serve content decisions

Put values authors tune into config (JSON, YAML, env). Code applies that config; it
should not hardcode creative or environment-specific choices.

## Checklist for automation touching authored data

- [ ] The default path is non-destructive (create if missing, update in place).
- [ ] Any destructive behavior is named and gated behind a flag, approval, or
      runbook step.
- [ ] Re-runs do not duplicate rows, objects, or assets.
- [ ] Each create, reuse, or skip decision is logged.
- [ ] Gaps in automation are recorded rather than hidden — see the
      `automation-standards` skill.

## Editor projects

For engine-based projects, apply the same mindset to maps and assets: an agent
regenerating a level or asset destroys authored work exactly the way a database
reimport does. Consult the engine-specific rules for the project when they apply.
