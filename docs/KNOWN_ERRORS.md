# Known errors and fixes

**Purpose:** record failures that were **expensive** or **non-obvious**, so nobody pays for them twice. Append new entries; do not delete history — mark an entry addressed instead.

**When to add an entry:** after you debug a non-obvious failure and have a verified fix. **Read this file before** touching audits, source-scanning tests, or Phaser input wiring.

**The theme of every entry below:** each of these bugs **passed its own check by doing nothing**. A green check is not evidence unless you know what it measured.

---

## Failures that verified nothing

### Source-scanning test defeated by CRLF, then failed open

- **Date:** 2026-09-07
- **Symptom:** `src/art/shopInterior.test.ts` passed while asserting almost nothing. It reads its own sibling source, `shopInterior.ts`, to check what a function paints.
- **Cause:** two faults compounding. The scan searched for a newline-anchored closing `}` to find the end of a function, but `core.autocrlf` is `true` in this repo, so a checkout delivers **CRLF** and the LF-anchored search never matched. On a miss the helper *failed open* — `return end < 0 ? rest : rest.slice(0, end)` handed back the entire rest of the file, so every later function's code counted toward the assertions.
- **Fix:** normalise the text on read, `readFileSync(..., "utf8").replace(/\r\n/g, "\n")`, and **throw** on a miss instead of returning the remainder: `if (end < 0) throw new Error(...)`. Commit `7a5ec79`.
- **Prevention:** if you scan source text, always normalise line endings **and** throw when a marker is missing. A fail-open fallback in a test is worse than no test, because it reports success. Remember `core.autocrlf` is `true` here — the bytes on disk are not the bytes in the commit.

### Layout audit read a Phaser data value as a plain property

- **Date:** 2026-09-07
- **Symptom:** the text-overflow layout audit reported clean while overflowing text was plainly visible on screen.
- **Cause:** the audit read `text.typekitBox` as an object property. That value does not live on the object — it is stored in **Phaser's data manager** under the key `typekitBox` (see `TYPEKIT_BOX` in `src/ui/typekit.ts`), so it must be read with `text.getData("typekitBox")`. The property was `undefined` for every text object, so every overflow check hit its skip branch and the audit examined nothing.
- **Fix:** read the box through the data manager, and run the audit at **camera zoom 1** so measured bounds are comparable.
- **Prevention:** an audit that finds **zero** items to inspect is a failed audit, not a passing one. Assert that it found a plausible non-zero number of boxed texts before trusting a pass. When reading Phaser state, check whether the value is a property or a data-manager entry.

### Non-null assertion hid an uninitialised Phaser input and crashed the HUD

- **Date:** 2026-09-07
- **Symptom:** `npx tsc --noEmit` was clean, tests were green, and the HUD crashed on boot.
- **Cause:** `settingsDim.input!.enabled` asserted away a nullable. A Phaser game object's `input` is **null until `setInteractive()` has been called**, so the assertion silenced the one warning that would have caught it. `tsc` cannot see the runtime lifecycle. The same dim also swallowed clicks meant for objects behind it.
- **Fix:** drive interactivity through the real API — `setInteractive({ useHandCursor: false })` when the overlay is on, `disableInteractive()` when it is off — instead of reading and asserting `input`. Commit `e90c0b1`, in `src/scenes/HudScene.ts`.
- **Prevention:** prefer the real API over asserting a nullable away; `!` deletes exactly the signal you need. And because `tsc` demonstrably misses boot-time crashes, the definition of done requires **a capture proving the game still renders** — see [AGENTS.md](../AGENTS.md).

---

## Environment traps

### `npm run dev -- --port 5174` silently targets the wrong host

- **Date:** 2026-09-07
- **Symptom:** Chrome fails to resolve a hostname of `5174`.
- **Cause:** the `dev` script is `vite --host`. npm appends forwarded arguments, so the port folds into the `--host` value rather than becoming its own flag.
- **Fix:** invoke Vite directly: `npx vite --host --port 5174 --strictPort`.
- **Prevention:** recorded in [operational/automation-gaps.md](operational/automation-gaps.md); see [AGENTS.md](../AGENTS.md) for the shared dev-server protocol. One server serves everything on port **5174** — do not start a second.

### Concurrent agents deadlocked on the shared browser tab

- **Date:** 2026-09-07
- **Symptom:** three agents hung for 46 minutes with no error output and no screenshots.
- **Cause:** the `cursor-ide-browser` tools drive a **single shared tab**. Concurrent agents contend for it and block; the failure is completely silent, so no agent is told it happened.
- **Fix:** capture through a per-agent Chrome instance — `npx tsx scripts/agent-shot.ts --lane N`, where the lane picks a dedicated debug port (`9400 + lane`) and its own Chrome profile.
- **Prevention:** full protocol in [AGENTS.md](../AGENTS.md); the underlying limitation is logged in [operational/automation-gaps.md](operational/automation-gaps.md).

---

## Related

- [AGENTS.md](../AGENTS.md) — operational protocol and definition of done
- [operational/automation-gaps.md](operational/automation-gaps.md) — what automation cannot do reliably
- [.cursor/rules/05-error-handling.mdc](../.cursor/rules/05-error-handling.mdc) — defensive coding and where to record errors
