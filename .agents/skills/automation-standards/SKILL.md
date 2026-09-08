---
name: automation-standards
description: Use when building automation that drives or configures external tools, APIs, IDEs, or CI - ranks the available approaches from official API down to fragile UI scripting and requires any setting automation cannot reach to be recorded in docs/operational/automation-gaps.md.
---

# Automation standards

Automation should stay transparent: the team knows what is automated, what is
brittle, and what remains manual by policy or technical limit. Upgrades should
trigger deliberate re-verification, not surprise breakage.

## Preference order

When automating a workflow — scripts, bots, MCP servers, CI, or UI-driven
automation — prefer these approaches in order:

1. **Official API or documented CLI.** Stable contracts, versioning, least
   surprise.
2. **Configuration-as-code.** Checked-in config files the tool reads
   deterministically.
3. **Scripts that wrap the above.** Idempotent, logged, testable.
4. **UI or GUI automation** (click and type, accessibility APIs, screenshot-driven
   tools). Use only when options 1–3 cannot achieve the outcome, and treat it as
   fragile — layout changes, themes, and multi-monitor setups all break it.
   Document the maintenance cost. Avoid it for security-critical or
   compliance-only paths unless there is no alternative.
5. **Explicit backlog.** If nothing above works reliably, record the gap (below).
   Do not assume someone will remember.

Third-party editor extensions are optional; when the team adopts one, follow that
extension's documented workflow.

## Settings automation cannot reach

When automation drives external tools, APIs, or product UIs, follow this procedure
so required-but-inaccessible settings stay visible and upgrade-safe.

1. **Identify the required settings.** Work from version-specific official docs, or
   the pinned release that runs in CI, and list every setting the feature needs. Do
   not rely on model training data alone for versioned products.

2. **Check access from automation.** For each setting, verify whether it can be set
   or read *reliably* from an API, CLI, config file, or stable automation hook.
   "Reliably" means documented, repeatable, and unlikely to break on a minor UI
   reskin.

3. **Document gaps and human steps.**
   - Record anything with no access or unreliable access in
     `docs/operational/automation-gaps.md`. Link it from `docs/KNOWN_ERRORS.md`
     when the gap has caused a recurring incident.
   - Include the date, the feature, what is needed, why automation cannot set it,
     and a suggested follow-up (API request, ticket, different tool).
   - In runbooks, call out steps only a human should perform — production secrets,
     legal approval. That is normal, and distinct from "we forgot to automate this."

4. **Re-check on upgrades.** When upgrading the tool, SDK, or browser baseline,
   re-run the access check and update the gaps doc so stale assumptions do not
   linger.
