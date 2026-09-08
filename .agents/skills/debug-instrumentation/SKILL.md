---
name: debug-instrumentation
description: Use when implementing a new feature, script, system, or API - adds minimal entry/exit, branch, and outcome logging so that whether the feature works can be answered from logs or test output without the user asking for extra logging.
---

# Feature debug instrumentation

When implementing new features — new scripts, systems, automation, or APIs — add
minimal debug instrumentation by default. When something goes wrong later, this
gets us straight to runtime evidence instead of re-instrumenting from scratch.

**Log-driven validation is mandatory.** Every feature implementation must include a
robust, log-driven way to confirm it works. The user must not have to prompt for
logging or extra steps. Add the logs — and, where applicable, tests or runnable
checks that produce logs — as part of the implementation, so "did it work?" is
answerable by inspecting logs or test results with no further action.

## What to add

- **Entry and exit.** Log the start and end of main flows (`main()`, key public
  functions) with a short message and, if useful, one to three key parameters or
  results.
- **Branches.** Log which path was taken at important conditionals — "using config
  A" versus "using config B", "cache hit" versus "cache miss".
- **Critical values.** Log the inputs and outputs that drive behavior (path,
  options, success or failure) as a message plus a data object.
- **User- or system-facing actions.** For anything triggered externally (an API
  call, a CLI invocation, a button click), log that the trigger was received and
  what the outcome was — success, failure, or skip, and why. This is the primary
  way to validate from logs alone that a feature is implemented.

Keep instrumentation minimal: a few well-placed logs per feature, not every line.
Prefer one consistent mechanism per codebase, such as a small `debugLog(msg, data)`
helper with a prefix.

## Format and hygiene

- Use a consistent prefix per script or module (`"Service: "`, `"CLI: "`) so logs
  are grep-able.
- Prefer structured data (`{ path, hasConfig }`) so logs are parseable.
- Never log secrets or PII.
- Wrap debug blocks in a findable region or comment (`// #region debug` /
  `// #endregion`, or `// DEBUG:`) so they can be located or stripped later.

## When to skip

- Trivial one-liners, or pure data transforms with no branching.
- Code paths that already log enough for operational debugging.
- Hot loops — instrument entry, exit, and key decisions instead.

## Outcome

New code ships with lightweight observability. The user can confirm a feature works
by checking logs or test output without asking for logging. When a bug appears, the
runtime evidence — which path ran, which values were used — is already there, so
hypotheses can be confirmed or rejected quickly.
