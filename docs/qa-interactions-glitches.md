# Kindling — QA pass: interactions & glitches

**Date:** 2026-09-06  
**Scope:** Softlocks, double-advances, scene/state leaks, adversarial input. Aesthetics covered separately in [`audit-aesthetics-gameplay.md`](audit-aesthetics-gameplay.md).  
**Methods:** `npm test` (165 pass) · [`scripts/qa-glitches.ts`](../scripts/qa-glitches.ts) (28/28) · preview · stills in [`docs/promo/`](promo/)

**Status:** Full audit fix queue shipped. Phone 844×390 fill verified (`fills=true`, [`qa-phone-drive.png`](promo/qa-phone-drive.png)). Remaining: physical-device notch/safe-area smoke if you care.

---

## 1. Summary (post-fix)

| Severity | Open | Notes |
|----------|-----:|-------|
| **P0** | **0** | — |
| **P1** | **0** | Walk-in depart, hand clear, hour=23, exclusive flash — fixed |
| **P2** | **0** | pendingDepart/packBag, hitch catch-up, pad, gpsPin, prompts, SFX, theme, promo stills, banner/pin — fixed |
| **Watch** | physical device | Emulated landscape fill OK; real notch not tested |

---

## 2. Originally filed bugs (all addressed)

| ID | Sev | Title | Resolution |
|----|-----|-------|------------|
| QA-G6a/b | P1 | Depart mid–walk-in orphan | `hitTheRoad` blocked while walk-in at register |
| QA-G8h | P1 | Hand SKU after walkout | `failOrder` clears hand/fetch/keyLead |
| QA-L23 | P1 | `?hour=23` frozen | `startSession` / `beginPlay` call `endShift` |
| S7 | P1 | Dual driver flash | Exclusive `hitTheRoad` hint |
| D2 | P1/P2 | Pad hidden / README | Pad during auto-drive; README nudge copy |
| QA-G7 | P2 | Dead `pendingDepart` | Removed from sim |
| QA-G8t | P2 | KeyLead hitch | Multi-slice catch-up in `tickKeyLead` |
| S4 | P2 | Dead `packBag` | Removed invisible sprites |
| D3 | P2 | gpsPin flash | Pin pulses on `gpsPin` hint |
| D7 | P2 | Van banner vs pin | Banner hides within 260px of pin |
| QA-PHONE | P2 | Letterbox | CSS fill + `scripts/phone-capture.ts` asserts fill |

---

## 3. Harness

`npx tsx scripts/qa-glitches.ts` → **28/28**.

Promo helpers: `?shot=drive|door`, `scripts/promo-capture.ts`, `scripts/phone-capture.ts`.

### Runtime perf probe (`kindlingPerfProbe`)

Measure one shop second (or any window) from an isolated capture lane — not vibes, counters:

| Field | Source |
|-------|--------|
| `actualFps` | `game.loop.actualFps` |
| `p95RawDeltaMs` | rolling p95 of `game.loop.rawDelta` (120 frames) |
| `plaquePumpCount` | sign plaque `PRE_RENDER` relayouts (`signText` pump) |
| `setTextCount` | hooked `Text.setText` on sign plaques |
| `windowMs` | ms since last `reset()` |
| `sceneKey` | first active, non-sleeping scene |

Dev handle (after boot): `window.kindlingPerfProbe.reset()` then `window.kindlingPerfProbe.sample()`.

Example one-second shop window via agent-shot:

```text
npx tsx scripts/agent-shot.ts --lane 3 --start-clicks 2 --ready-scene shop \
  --step 'eval:window.kindlingPerfProbe.reset()' \
  --step 'wait:1000' \
  --step 'eval:JSON.stringify(window.kindlingPerfProbe.sample())'
```

Pair with `?meter=1` when you also want scene Δ, fixed-step backlog, and tier from `kindlingClock.stats()` / the feel overlay.

---

## 4. Evidence index

| Artifact | Path |
|----------|------|
| This report | `docs/qa-interactions-glitches.md` |
| Aesthetics audit | `docs/audit-aesthetics-gameplay.md` |
| Promo | `docs/promo.md` + `docs/promo/*.png` |
| Phone fill | `docs/promo/qa-phone-drive.png` |
