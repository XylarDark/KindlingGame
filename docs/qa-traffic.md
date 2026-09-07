# Kindling — QA: traffic system

**Date:** 2026-09-06  
**Scope:** Ambient loop traffic + auto/manual drive speed coupling only.  
**Methods:** `npm test` (167) · [`scripts/qa-traffic.ts`](../scripts/qa-traffic.ts) (9/9) · unit cases in [`src/maps/traffic.test.ts`](../src/maps/traffic.test.ts)

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
