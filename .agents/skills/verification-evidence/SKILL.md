---
name: verification-evidence
description: Use when writing, reviewing, or relying on anything meant to prove that something works - an audit, a readiness gate, a guard test, a health check, or a CI stage - covers proving a check measured its subject, fail-open helpers, boundary values that hide off-by-half errors, requested versus effective values, and mutation-testing a guard test.
---

# Verification evidence

**A green check is not evidence unless you know what it measured.**

An exit code says "nothing threw". Evidence says "the suite ran 349 tests and 349
passed", "the audit inspected 41 elements", "the run ended on the state the caller
asked for". Only the second kind lets anyone else check the claim, and only the
second kind fails when the check quietly stops doing its job.

Everything below comes from checks that were green while measuring nothing. They
are grouped by how the failure hides, because that determines what you assert.

## Four ways a check passes without measuring anything

1. **It read its subject from the wrong place.** Every item hit the skip branch and
   the audit reported clean. Nothing was inspected, and nothing said so.
2. **It was satisfied by the wrong subject.** A readiness gate waited for "the app
   has rendered", and the app that rendered was the previous screen. The gate was
   honest; it just did not answer the question the caller asked.
3. **It could not find its subject and returned success.** The gate exited `0` on
   the path where it gave up. "Could not measure" was reported as "measured and
   passed".
4. **It obeyed a malformed input and applied none of it.** A request carrying two
   conflicting parameters was concatenated into one valid-but-meaningless value.
   Every downstream step succeeded and the result looked perfect, because the
   parameter had silently fallen back to its default.

### What to assert instead

- **A plausible non-zero count of things actually inspected.** An audit that finds
  zero items to check has failed, not passed. Print the count and assert a floor.
- **The end state the caller named.** When a caller specifies the state it expects
  to reach, a miss must fail loudly. Do not forgive it as slowness — that is the
  difference between "the machine was slow" and "you were looking at the wrong
  thing", and only one of those is recoverable by waiting.
- **A third outcome: inconclusive.** "Ran and passed", "ran and failed", and "could
  not measure" are three different results. Collapsing the third into the first is
  the single most common way a control disappears without anyone noticing.
- **Input validity before the expensive step.** Reconcile conflicting inputs rather
  than concatenating them, and throw when two sources disagree instead of picking
  one. A malformed request that is still _syntactically valid_ will be obeyed all
  the way to a clean, wrong answer.

This repository implements the pattern in `scripts/tools/verify.js`: a stage passes
only when it exits zero **and** the expected number could be extracted from its
output; a stage that exits zero without producing evidence is reported as
`inconclusive`; stages after a failure are reported as `NOT RUN` rather than left
silent; and the report ends with an explicit list of controls the pipeline cannot
see, so a clean run is never mistaken for a statement about them.

## Fail-open helpers are worse than missing ones

A helper that scans text for a marker and returns "everything after it" has two
behaviors on a miss: throw, or hand back the rest of the file. The second one turns
a targeted check into an untargeted one that passes for reasons unrelated to its
subject.

```js
// Wrong: a missed marker silently widens the scan to the whole remaining file.
return end < 0 ? rest : rest.slice(0, end);

// Right: a missed marker is a defect in the check itself.
if (end < 0) throw new Error(`end marker not found after ${startMarker}`);
return rest.slice(0, end);
```

**Normalize line endings before scanning text.** With `core.autocrlf` enabled — the
default on Windows — a checkout delivers CRLF, so a newline-anchored search never
matches and the fail-open branch runs on every machine that checked the code out
that way. Read with `.replace(/\r\n/g, '\n')`. The bytes on disk are not the bytes
in the commit.

A fail-open fallback inside a test is worse than having no test, because it reports
success.

## Checks that ran, measured something real, and still proved nothing

Distinct from the section above, and worth keeping apart from it: these checks did
execute and did measure. They passed because the one value they happened to probe
is the value at which a correct implementation and a broken one agree.

The illustration worth remembering: a hit region displaced by half its own size
passed every centre-point test for months. Half of an even dimension is a whole
number, so the centre landed _exactly_ on the displaced region's inclusive boundary
and the test passed. Changing the dimension to an odd number made the half
fractional, the centre fell outside, and a long-latent bug surfaced looking like a
brand-new regression.

- **Verify boundaries, not centres.** Probe just inside and just outside each edge,
  then the corners. A centre-only check passes on a region that is half off its
  target.
- **Treat an even-numbered dimension as a hazard** wherever geometry, ranges, or
  buffers get halved. It can place your single test point exactly on a boundary and
  hide an off-by-half indefinitely.
- **Read the outcome back from the system**, rather than inferring it from the fact
  that the call returned.

## The requested value is not the effective value

Any function that only ever clamps in one direction — a fit that shrinks, a cap
that truncates, a quota that caps — makes every request above the limit a silent
lie. The constant says 26; the result is 18; a test that pins the constant proves
nothing about what the user gets.

- Measure the **effective** value at runtime and assert on that.
- When a test structurally cannot observe the effective value, say so **in the
  test**. A comment naming what the test does not cover is worth more than a green
  assertion implying coverage it does not have.

## Mutation-test your guard tests

Scoped to **settled** areas. Where the host's `AGENTS.md` marks an area as **shaping**, there is
usually no guard test yet to mutate, and the proof is owed together with the test at promotion.
Everything above this section is unscoped: knowing what a check measured costs nothing extra, and
a check that measures nothing is worthless at any phase.

A test that exists to prevent a specific regression should be proven to catch it:

1. Deliberately reintroduce the regression.
2. Confirm the test fails, and that it fails for the stated reason.
3. Restore the code.
4. Note in the test's own comment that this was done.

An untested guard test is decoration. This costs a minute and is the only thing
separating "we have a test for that" from "we have a file named after that".

## Where to record what you find

When a check turns out to have been proving nothing, the fix is half the value; the
symptom is the other half. Append an entry to `docs/KNOWN_ERRORS.md` titled with the
symptom a future reader will actually search for, and record any limit that cannot
be automated away in `docs/operational/automation-gaps.md`.

## Checklist

- [ ] The check reports how many things it inspected, and asserts a non-zero floor
- [ ] A named expected end state is asserted, and a miss fails
- [ ] "Could not measure" is a distinct outcome from "measured and passed"
- [ ] Helpers throw on a missing marker instead of returning a partial
- [ ] Text scans normalize line endings before searching
- [ ] Boundaries are probed, not just centres
- [ ] Assertions are on effective runtime values, not requested constants
- [ ] Guard tests have been shown to fail when the regression is reintroduced
