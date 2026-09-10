# Drawing-board perf ranked plan (2026-09-10)

Goal: fill-rate wins after wall-clock sim (KNOWN_ERRORS DayNight PostFX).

Preserve: dropoff gate, rawDelta, Drive bake, syncSceneRenderCamera, install coach.

## Ranked execution

| Rank | Item | Status |
|------|------|--------|
| 1 | Phone renderScale mid 0.45 / low 0.32 | Superseded → [density-first](2026-09-10-density-first-budget.md) mid **0.85** / low **0.65** |
| 2 | Half-res DayNight postFxScale 0.5 | Landed |
| 3 | Shop static bake bg+mid RTs | Landed |
| 4 | City tile atlas grass/road/parking | Landed |
| 5 | Overdraw cuts lot/night glow/plaques | Landed |
| 6 | Compressed textures ASTC/ETC | Deferred — canvas-baked RGBA; atlases cut binds/memory |
| 7 | People multi-frame atlas | Landed |
| 8 | Further no-alloc / sky cadence | Landed |
| 9 | Door static bake (facade RT) | Landed |

## Docs

- guides/smooth-2d-runtime.md checklist
- KNOWN_ERRORS drawing-board follow-up
