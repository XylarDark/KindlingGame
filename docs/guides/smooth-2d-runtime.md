# Smooth 2D / WebGL runtime (Kindling)

**Purpose:** how Kindling keeps Drive/Door/Shop feeling smooth on phones — fixed-step wall-clock sim + render interpolation (default), frame budget, adaptive `renderScale`, PostFX policy, static-vs-dynamic draw split, atlases, warm/preload, measurement, and what **not** to do.

**Read with:** [KNOWN_ERRORS.md](../KNOWN_ERRORS.md) entry *Full-resolution DayNight PostFX looked like a "slow game" after wall-clock sim*.

---

## Industry checklist (Done / Partial / Next)

Cite: KNOWN_ERRORS — *Full-resolution DayNight PostFX looked like a "slow game" after wall-clock sim* (wall-clock unmasked GPU fill-rate; PR #32 fixed-step + interpolation makes rawDelta viable; adaptive scale + PostFX off on phones; session tier lock at mid 0.85).

| Technique | Status | Kindling notes |
|-----------|--------|----------------|
| **Measure** (`actualFps` / p95 frame ms, PostFX on/off, each tier) | **Done** | `?meter=1` feel overlay; dev: `kindlingRenderBudget.force` + `apply()`. Do not treat “sim clock matches wall” as smoothness. |
| **Resolution** (adaptive backbuffer + camera zoom; GAME_* layout) | **Done** | high **1.0** / mid **0.85** / low **0.65** (density-first); `syncSceneRenderCamera` every scene `create`. |
| **PostFX** (attach only shop/drive/door; mid/low off) | **Done** | DayNight never on Hud/Title; coarse never lingers on high in Drive/Door. |
| **Half-res FX** (`postFxScale` 0.5 via Phaser `halfFrame`) | **Done** | Desktop high: downsample → DayNight → blit up. Coarse stays mid/low (PostFX off). |
| **Static bake** (non-movers → RenderTexture) | **Done** | Drive city ≤2048px cells; Shop interior + counter RTs; **Door facade/yard RT**; movers/interactive live. |
| **Atlases** (batch small tiles) | **Done** | City tiles (`atlas-city-tiles`); people standing (`atlas-people-standing`) + portraits (`atlas-people-faces`) after `generateTextures`. |
| **Pooling** | **Done** | Shop customer visuals; Hud score pops; traffic sprite cap. |
| **Cull** | **Done** | Drive camera cull on; traffic `TRAFFIC_CULL_PAD`; night-glow camera pad cull. |
| **Overdraw** | **Partial** | Phone tiers: `phoneFxQuality()` lite/minimal cuts Drive lamp-pool + window fills, Door porch/window halos, lot glow off on low; traffic cap 10/8. Shop window spill already cleared. Residual: shop `paintOutside` sky bands at night. |
| **FPS / thermal** | **Done** | Coarse: `fps.target`+`limit` **30**; prefer sustained smoothness over chasing 60. |
| **No alloc** (hot paths) | **Done** | DayNight reuses Float32 buffers; `skyVisualDirtyKey` throttles shop/door sky Graphics clears; avoid per-frame `lights.slice`. |
| **Warm** | **Done** | `#loading-gate`: textures, DayNight, launch Drive/Door ≥2 frames, city build+bake complete before sleep. |
| **Mobile pipeline** | **Done** | `autoMobilePipeline` in config; coarse seed mid. |
| **Texture format** | **Next** | Canvas-baked RGBA8888 at boot; atlases batch binds. ASTC/ETC asset packs need an offline pipeline — not in `generateTextures` today. |
| **Fixed-step + rawDelta** | **Done** | Default `fixedRaw`: 60 Hz steps from `rawDelta` via `kindlingClock`; Drive interpolation; `smoothStep: false`. Fallback: `?clock=smooth`. |

---

## Frame budget (what we are buying)

| Budget piece | Desktop (fine pointer) | Phone (coarse) |
|--------------|------------------------|----------------|
| Target FPS | 60 (`fps.target`) | **30** (`fps.limit` + `target`) — sustained smoothness over chasing 60 |
| Seed RenderBudget tier | `high` | `mid` (never auto-promote to `high` on coarse) |
| `renderScale` | 1.0 | **0.85** mid / **0.65** low |
| DayNight PostFX | on (≤8 lights), **`postFxScale` 0.5** | **off** on mid/low — Graphics glow still paints |
| Sim clock | `fixedRaw`: 60 Hz fixed steps from `rawDelta` | same; render may cap at 30 fps |

Design layout stays **1920×1080** (`GAME_*`). CSS shell presents 16:9. Only the WebGL backbuffer + camera zoom shrink (and PostFX may run on a halfFrame).

---

## Adaptive `renderScale` doctrine (density-first)

1. **Prefer sharp pixels + cheap FX** over soft full-frame scale. Mid **0.85** and low **0.65** keep phone art readable; cut fill-rate via PostFX off, static bakes, atlases, and overdraw — not by shrinking to **0.45 / 0.32** (superseded — that was a blunt hammer that killed the look).
2. **Always** pair `scale.resize` with `syncSceneRenderCamera` on every scene `create` (READY can race late scenes).
3. Pointer / CSS fit must use **live** `gameSize`, not a frozen 1920×1080 assumption (`applyCanvasDisplayScale`).
4. **Coarse phones:** tier locked at boot **mid 0.85** for the session — no mid-session `scale.resize` (PR #29). Desktop may still demote with hysteresis.
5. Honest **30fps** on coarse phones beats blurry almost-60 — `fps.target` + `limit` 30 unchanged.
6. Measuring “sim clock matches wall” is **not** proof of smoothness — measure `actualFps` / p95 frame time at each tier with PostFX on/off and `?meter=1`.
Source of truth: `src/ui/renderBudget.ts`, `src/sim/kindlingClock.ts`.

---

## PostFX policy

- Attach DayNight only to **shop / drive / door** cameras — never Hud/Title.
- Mid/low: `postFx: false`, `maxLights: 0`; grade still via Graphics where needed.
- High: `postFx: true` with **`postFxScale: 0.5`** — `DayNightPipeline.onDraw` copies the camera RT into Phaser `halfFrame1`, grades into `halfFrame2`, then `copyToGame` (fill-rate win without changing GAME_*).
- Uniform uploads throttled by `uploadMinMs` per tier.
- First-use shader compile belongs in **Boot warm** under `#loading-gate`, not the first shop/door frame.

---

## Drive + Shop — static vs dynamic draw split

### Drive

The city is deterministic. Paying ~1100+ tile `Image` draw calls every frame is the wrong default.

**Static (bake once, then destroy/hide individuals):**

- Ground / road / parking / wall tile Images (prefer `atlas-city-tiles` frames)
- House roofs, street lamps (poles), curb props, access-path Graphics

After chunked row placement + overlays, `DriveScene.bakeStaticCityMap()` stamps those into a grid of **≤2048px `RenderTexture` cells** (map is 4800×3360 — over typical mobile max texture size as one sheet), scrolls each RT camera to the cell origin, `batchDraw`s depth-sorted statics, then **destroys** the per-tile Images. Camera cull drops off-screen cells for free.

**Dynamic (live sprites / Graphics every frame):**

- Vehicle, walker, traffic cars, destination pin + pulse + labels
- Interactive shop building (hit target) + captions / lot numbers (few Texts)
- Lot glow (stroke-only) + night lamp-pool Graphics (camera-culled, coarse dirty key)
- Hud (other scene)

### Shop

Mirror Drive lightly: after create/warm art, bake non-moving interior Graphics/Text into **background (depth 0)** and **midground (depth 7)** RenderTextures. Keep customers / keylead / driver / bags / interactive tablet / sky / windowGlow / receipts live.

### Door

Facade + yard bake into one full-screen **RenderTexture (depth 0.5)** per house style. **Sky bands** and **night FX** (window/lamp glow) stay live Graphics, repainted only when `skyVisualDirtyKey` changes — same cadence as the shop window.

**Rule:** if it does not move or animate, it should not remain a per-instance draw after bake. If it moves, keep it a sprite and let camera + modest view padding cull it (`TRAFFIC_CULL_PAD`).

Preserve: dropoff gate, `fixedRaw` clock (or `?clock=smooth` fallback), session tier lock on coarse, chunked warm build, `#loading-gate`, `syncSceneRenderCamera`, install coach.

---

## Warm / preload

Under `#loading-gate`: flush textures a full frame; register city + people atlases; launch shop/hud; warm DayNight; `launch` drive then door for ≥2 rendered frames each; wait for `isCityBuildComplete()` (includes bake) before sleep. Mid-shift must **wake**, not first-create, Drive/Door.

---

## How to measure

1. **`?meter=1`** on phone PWA: fps, Δ ms, p95-ish rolling, fixed-step backlog, tier, `resize×`.
2. Phone Chrome (or AVD): compare Drive/Shop/Door with PostFX forced on vs off at mid/low scales.
3. Dev harness: `kindlingRenderBudget.force('mid'|'low'|'high')` then `apply()`; `kindlingClock.stats()` for clock telemetry.
4. A/B: default `fixedRaw` vs `?clock=smooth` on the same device session.
5. Do **not** use “clock matches wall” alone (KNOWN_ERRORS).

---

## What NOT to do

| Don’t | Why |
|-------|-----|
| Bare rawDelta flip without fixed-step + interpolation | Variable dt stutters; use `kindlingClock` `fixedRaw` or `?clock=smooth` fallback |
| Mid-session `scale.resize` on coarse phones | Triggers typekit refit on every Text — felt like click lag (PR #29 lock) |
| Fix “choppy” by locking 1920×1080 forever | Fill-rate is the cost; demotion tiers exist on purpose |
| Soft-scale phones to 0.45 / 0.32 | Superseded — kills pixel sharpness; use 0.85 / 0.65 + FX cuts instead |
| Attach DayNight to Hud/Title | Wasted fullscreen passes |
| Leave per-tile city Images alive after bake | Defeats the static/dynamic split |
| First-create Drive/Door mid-delivery | Hitch on city draw + shader compile |
| Treat IDE-pane FPS as phone truth | Use coarse seed + real device / emulator |
| Run full-res PostFX when `postFxScale` 0.5 is enough | Half-res path exists for desktop high |

---

## RawDelta readiness

Wall-clock sim is **not** the product goal by itself. Success is an installed phone PWA that feels **responsive and smooth** — snappy input, no mid-session stalls, honest frame budget — measured with overlay telemetry, not “sim clock matches wall” alone.

**Ship default (PR #32):** `kindlingClock` mode **`fixedRaw`** — accumulator from `game.loop.rawDelta`, **60 Hz** fixed sim steps (`FIXED_STEP_MS = 1000/60`), max **5 steps/frame**, Drive render interpolation between ticks, `fps.smoothStep: false`.

**Fallback:** `?clock=smooth` or `localStorage kindlingClock.mode=smooth` — PR #30 smoothed-delta feel without rebuild.

**Diagnose:** `?meter=1` — on-screen fps, last frame ms, p95-ish rolling, fixed-step backlog, clock mode, tier, `resize×`.

**Not interpolated yet:** Shop/Door movers (static bakes), Drive customer doorstep sprite, pin/chip text — snap to sim ticks.

**Canonical plan:** [plans/2026-09-10-responsive-smooth-product.md](../plans/2026-09-10-responsive-smooth-product.md). Stub: [plans/2026-09-10-rawdelta-readiness.md](../plans/2026-09-10-rawdelta-readiness.md).

---

## Related

- `src/ui/renderBudget.ts` — tiers, `postFxScale`, camera sync
- `src/art/dayNightPipeline.ts` — halfFrame PostFX path
- `src/scenes/DriveScene.ts` — chunked build + `bakeStaticCityMap`
- `src/scenes/ShopScene.ts` — `bakeStaticShop`
- `src/scenes/DoorScene.ts` — `bakeDoorFacade` + sky cadence
- `src/art/cityTileAtlas.ts` — grass/road/parking atlas
- `src/art/peopleAtlas.ts` — standing + portrait atlases
- `src/sim/kindlingClock.ts` — fixed-step accumulator, `fixedRaw` \| `smooth` modes
- `src/sim/simInterpolator.ts` — Drive mover lerp
- `src/ui/feelMeter.ts` — `?meter=1` overlay
- `src/config.ts` / `src/main.ts` — `wantsSmoothStep(clockMode)`, `autoMobilePipeline`, coarse 30fps limit
- `src/ui/renderBudget.ts` — `sessionTierLocked` on coarse (mid 0.85 for session)
- [plans/2026-09-10-responsive-smooth-product.md](../plans/2026-09-10-responsive-smooth-product.md) — responsive + smooth product plan (rawDelta = Phase 5)
- [plans/2026-09-10-density-first-budget.md](../plans/2026-09-10-density-first-budget.md) — current phone scale doctrine
- [plans/2026-09-10-drawing-board-perf.md](../plans/2026-09-10-drawing-board-perf.md) — prior ranked execution plan
- [KNOWN_ERRORS.md](../KNOWN_ERRORS.md) — DayNight / wall-clock hitch history
