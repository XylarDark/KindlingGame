# Phase 6 — contract scans (plan closure)

**Plan:** [2026-09-15-size-speed-readability.md](../plans/2026-09-15-size-speed-readability.md)  
**Baseline:** [perf-baseline-phase0.md](./perf-baseline-phase0.md)

Phase 6 adds source-scan guards for contracts touched in Phases 1–5. No new gameplay, type, bake, or boot features — scans + docs only.

---

## Guard tests

| Contract | Test |
|----------|------|
| No `snapshot(` on `pointerdown` | `src/ui/phase6Guards.test.ts` — balanced-brace scan of `src/scenes/**` + `src/ui/**` |
| No `rawDelta` in sim | same file — comment-stripped `src/sim/**`; Hud uses `frameMs = delta` |
| No mid-session `scale.resize` on coarse | same file — `sessionTierLocked` gates `tickRenderBudget`; single `scale.resize` site; mid **0.85** (no 0.45/0.32) |
| No `throw` in `layoutPlaque` | same file + `src/ui/signText.test.ts` |
| Pages main + `/embed/` | same file — `.github/workflows/pages.yml` + `vite.config.ts` embed outDir |

Run: `npm test -- src/ui/phase6Guards.test.ts`

---

## Shipped phases (ShiftGame)

| Phase | PR | Focus |
|-------|-----|--------|
| **0** | [#112](https://github.com/XylarDark/ShiftGame/pull/112) | Meter checklist, bake/Text inventory, gate confirm |
| **1** | [#113](https://github.com/XylarDark/ShiftGame/pull/113) | Title/HUD leak, dropoff skip, start-click guards |
| **2** | [#114](https://github.com/XylarDark/ShiftGame/pull/114) | Role-token setText — no clamp-fit on interaction |
| **3** | [#115](https://github.com/XylarDark/ShiftGame/pull/115) | Scene bakes at render tier (VRAM) |
| **4** | [#116](https://github.com/XylarDark/ShiftGame/pull/116) | Boot residency, title HTML pass-through |
| **5** | [#117](https://github.com/XylarDark/ShiftGame/pull/117) | Phone type atlas (coarse HUD roles) |
| **6** | *(this PR)* | Contract scans + plan closure docs |

---

## Meter checklist (still the proof tool for perf regressions)

Enable with `?meter=1` or `localStorage kindlingMeter=1`. Record before/after when changing runtime cost:

| # | Scenario | Notes |
|---|----------|-------|
| A | Idle Shop | fps, p95, tier, scale, **`resize× === 0`** on coarse after boot |
| B | Tap strain | TV jar click — `kindlingPerfProbe.sample().setTextCount` / `textUploadCount` |
| C | Hit the road | Depart frame p95 |
| D | First door | Door prompt + HUD readout column |
| E | How-to / Title | HUD hidden under title |

Full procedure: [perf-baseline-phase0.md §1](./perf-baseline-phase0.md#1-meter-checklist-meter1).
