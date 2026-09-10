# Density-first frame budget (2026-09-10)

**Supersedes:** soft mid **0.45** / low **0.32** from the drawing-board pass — rejected for killing phone pixel sharpness.

**Goal:** keep wall-clock sim and sharp pixels; cut cost *per* pixel (FX/overdraw), not by blurring the whole game.

Preserve: dropoff gate, install coach BIP, Drive/Shop/Door bake, people atlases + PWA boot fix (`showLoading` before Phaser.Game), `syncSceneRenderCamera`, coarse 30fps target/limit.

## Product decisions

| Topic | Decision |
|-------|----------|
| Sim clock | `rawDelta` / `smoothStep: false` — no smoothed delta |
| Phone default tier | `mid` @ **0.85** renderScale, PostFX **off** |
| Phone demotion | `low` @ **0.65** — honest 30fps beats blurry almost-60 |
| Desktop high | **1.0** renderScale, PostFX **on**, `postFxScale` **0.5** (half-res OK) |
| Phone PostFX | **Never** on shop/drive/door mid/low — mood via Graphics sky/lamp/window only |
| Coarse pointer | Seeds mid; never auto-promotes to high in Drive/Door |
| Texture packs | No ASTC/ETC or new atlases in this PR |

## RenderBudget tiers (source: `src/ui/renderBudget.ts`)

| tier | renderScale | postFx | postFxScale | maxLights |
|------|-------------|--------|-------------|-----------|
| high | 1.0 | on | 0.5 | 8 |
| mid | **0.85** | off | 0.5 | 0 |
| low | **0.65** | off | 0.5 | 0 |

## Phone FX audit

- `attachDayNight` / `applyDayNight` gate on `getRenderBudget().postFx` — mid/low never attach pipeline.
- Drive/Door/Shop `paint*DayNight` early-return when `postFx` is false; Graphics glow paths remain for night mood.
- Coarse + heavy scenes force off high even when FPS looks fine (`pickRenderTier`).

**Residual (optional follow-up):** Drive lot glow and shop/door translucent FX overdraw — review on device if mid @ 0.85 still misses 30fps sustained; cut only without look regression.

## Success gate

Installed-phone Drive/Door feel after clean reinstall. Suite green is necessary but not sufficient.

## Related

- [guides/smooth-2d-runtime.md](../guides/smooth-2d-runtime.md) — doctrine
- [plans/2026-09-10-drawing-board-perf.md](2026-09-10-drawing-board-perf.md) — prior ranked plan (item 1 superseded)
- [KNOWN_ERRORS.md](../KNOWN_ERRORS.md) — DayNight / wall-clock history
