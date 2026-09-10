# Lag regression hunt (2026-09-10)

Luke: clicks feel unresponsive; optimization arc added overhead. Mandate: **delete speculative machinery**, keep only proven sim/FPS/input wins.

## Root cause (click lag)

**Causal chain:** shop click → role/scene change → `syncRenderStress` + coarse demotion tick → `scale.resize(0.85↔0.65)` → Phaser `RESIZE` → `refreshTypekit()` walks **every** Text in **every** scene → multi-frame hitch that feels like the game is loading after each tap.

Secondary: `phoneFxQuality` tier flips forced full Drive/Door glow rebuilds; `syncDoorScene` called `bringToTop` every frame.

## Confirmed / rejected

| Suspect | Verdict |
|---------|---------|
| RenderBudget mid-session `scale.resize` thrash | **CONFIRMED — removed on coarse** |
| Double `applyRenderBudget` (Hud + listener) | **CONFIRMED — removed** |
| `phoneFxQuality` lite/minimal tier invalidation | **CONFIRMED — deleted** |
| Hitch demotion / stress-context demotion | **CONFIRMED — deleted** |
| Per-frame `bringToTop` in syncDoorScene | **CONFIRMED — edge-only now** |
| Re-bake city/shop/door on click | **REJECTED** — create/house-change only |
| People atlas repack mid-shift | **REJECTED** — boot only |
| SW refetch loop | **REJECTED** |
| smoothStep restore | **NOT DONE** — wall-clock rawDelta kept |

## Shipped deletions

1. **Coarse session tier lock** — phones seed mid 0.85, `tickRenderBudget` no-op for session.
2. **Removed** `phoneFxQuality`, `trafficVisualMax`, `setRenderStressContext`, hitch demotion, coarse one-strike demotion, heavy-scene demotion bands.
3. **Fixed** Drive/Door Graphics FX to single lite path (no tier keys).
4. **Fixed** Hud `doorTopMode` — `bringToTop` only on stack change.
5. **Fixed** traffic cap → constant `TRAFFIC_SPRITE_CAP = 12`.

## Kept

- Wall-clock rawDelta, smoothStep false
- Density-first scales mid 0.85 / low 0.65 (desktop demotion only)
- PostFX off on phone mid
- Static bakes + atlases at boot
- PWA showLoading, dropoff confirm gate
