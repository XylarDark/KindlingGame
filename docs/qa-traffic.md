# Kindling — QA: traffic system

**Date:** 2026-09-06 (pace + follow-gap pass 2026-09-07)  
**Scope:** Ambient loop traffic + auto/manual drive speed coupling only.  
**Methods:** `npm test` (194) · [`scripts/qa-traffic.ts`](../scripts/qa-traffic.ts) (9/9) · unit cases in [`src/maps/traffic.test.ts`](../src/maps/traffic.test.ts)

**Status:** Findings fixed in-repo. Traffic remains decorative soft-braking (not a teachable driving lesson).

---

## 1. Summary

| Severity | Open | Notes |
|----------|-----:|-------|
| **P0** | **0** | — |
| **P1** | **0** | Mutual crawl + zero-speed softlock fixed |
| **P2** | **0** | Manual speed gate + hitch slicing + comment hygiene |

---

## 2. Bugs filed → resolved

| ID | Sev | Title | Fix |
|----|-----|-------|-----|
| T-crawl | P1 | Van behind a car zeroed that car’s speed → auto matched 0 → mutual crawl | Hold/`speed=0` only when van is **ahead** in-lane ([`traffic.ts`](../src/maps/traffic.ts)) |
| T-freeze | P1 | `driveSpeedForTraffic` could return 0 | Floor at `cruise * 0.2` |
| T-manual | P2 | Pad/WASD used full cruise, ignoring lead | Same traffic gate in `tickManualDrive` |
| T-hitch | P2 | Large `dt` could tunnel through gaps | Slice `tickDrive` ≤50ms |
| T-comment | P2 | “Go around” comment vs in-lane hold | Comments aligned; dead `approxLoopLen` removed |
| T-corner | P1 | At the quicker pace, one separation shove mid-corner could leave a car still inside the van | Re-measure separation until it genuinely clears |

---

## 2a. Pace and follow gap (2026-09-07)

Ambient cars run **15% faster** and the van settles **10% further back** from the car it queues behind — following rather than tailgating. Both trims stay inside the van's look-ahead, so it still reacts to the car it holds behind.

Cars meeting the van mid-corner is the case the speed-up exposed: shoving a car back along its lane opens less straight-line gap on a curve than on a straight, so separation is now re-measured in a loop instead of corrected once. Pinned by a dense time sweep in the traffic unit test; the end-to-end drive test covers two traffic phases at the auto-drive's own 50ms slice.

---

## 3. Harness results

| ID | Result |
|----|--------|
| T-sep | PASS — car↔car gap |
| T-van-sep | PASS — van obstacle gap |
| T-oncoming | PASS — opposing lanes |
| T-yield-ahead | PASS — hold when van ahead |
| T-no-crawl | PASS — behind approach keeps speed |
| T-lead-speed | PASS — clear / soft / hard / stopped floor |
| T-manual | PASS — nudge moves under traffic gate |
| T-hitch | PASS — large tick progresses |
| T-park | PASS — auto parks at curb with traffic |

Run: `npx tsx scripts/qa-traffic.ts`

---

## 4. Live smoke

`?howto=0&shot=drive` — van auto-drives with ambient cars; corners stay in-lane; approach from behind does not freeze; park still reaches phone call.

---

## 5. Explicitly not changed

Parametric rematerialization / brief snap-after-yield · intersection right-of-way AI · night headlights · traffic rewrite.
