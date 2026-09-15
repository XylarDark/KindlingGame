# Phase 5 — optional type atlas

**Plan:** [2026-09-15-size-speed-readability.md](../plans/2026-09-15-size-speed-readability.md)  
**Baseline:** [perf-baseline-phase0.md](./perf-baseline-phase0.md)

---

## Decision

| Platform | Path | Rationale |
|----------|------|-----------|
| **Desktop** | Canvas Text (Phase 2) | Role tokens already skip clamp-fit on `setText`; upload cost is acceptable at high tier. No atlas registration. |
| **Phone (coarse)** | Runtime Inter **BitmapText** atlas for `hudTitle` / `hudBody` / `hudSmall` | One GPU texture per role×weight instead of N canvas backing stores. |
| **Speech** | Canvas Text always | Wrap + variable copy; atlas stays on HUD + prompts only. |
| **Stroked readouts** | Canvas Text (SCORE / clock) | BitmapText cannot carry ink outline; ~6 objects vs ~30+ atlas-eligible chips. |

Boot calls `registerTypeAtlas()` after `waitForFonts()`, before art flush (`BootScene.runBootWarm`).

---

## Meter hooks

After boot with `?meter=1`:

```js
kindlingPerfProbe.reset()
// … idle shop, tap strain, door prompt …
kindlingPerfProbe.sample()
// → setTextCount, textUploadCount, canvasTextCount, atlasTextCount
```

| Field | Meaning |
|-------|---------|
| `setTextCount` | All ink `setText` calls (canvas + atlas) |
| `textUploadCount` | Canvas `polishText` raster uploads only |
| `canvasTextCount` | Live typekit Text objects in scene tree |
| `atlasTextCount` | Live role atlas BitmapText objects (phone) |

**Expected phone shop idle (coarse emulated):** `atlasTextCount` > 0 for door/toast/cover chips; `canvasTextCount` holds SCORE/clock/speech; `textUploadCount` stays flat after boot on atlas-only `setText`.

---

## Capture checklist (exit criteria)

Same visual shots as Phase 0 baseline:

| Shot | Query / steps |
|------|----------------|
| Shop speech | `?howto=0&meter=1` — walk-in bubble visible |
| Door prompt | `?shot=door&meter=1` |
| HUD readouts | shop idle — SCORE + clock + toast chrome |

```bash
npx tsx scripts/agent-shot.ts --lane 7 --query "?howto=0&meter=1" --wait 3000 --name phase5-shop-hud.png
npx tsx scripts/agent-shot.ts --lane 7 --query "?shot=door&meter=1" --wait 3000 --name phase5-door-prompt.png
```

Paste `kindlingPerfProbe.sample()` before/after when comparing PRs.
