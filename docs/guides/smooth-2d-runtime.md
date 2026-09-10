# Smooth 2D / WebGL runtime (Kindling)

**Purpose:** how Kindling keeps Drive/Door/Shop feeling smooth on phones after wall-clock sim — frame budget, adaptive `renderScale`, PostFX policy, Drive static-vs-dynamic draw split, warm/preload, measurement, and what **not** to do.

**Read with:** [KNOWN_ERRORS.md](../KNOWN_ERRORS.md) entry *Full-resolution DayNight PostFX looked like a "slow game" after wall-clock sim*.

---

## Frame budget (what we are buying)

| Budget piece | Desktop (fine pointer) | Phone (coarse) |
|--------------|------------------------|----------------|
| Target FPS | 60 (`fps.target`) | **30** (`fps.limit` + `target`) — sustained smoothness over chasing 60 |
| Seed RenderBudget tier | `high` | `mid` (never auto-promote to `high` on coarse) |
| `renderScale` | 1.0 | **0.55** mid / **0.4** low |
| DayNight PostFX | on (≤8 lights) | **off** on mid/low — Graphics glow still paints |
| Sim clock | `game.loop.rawDelta` (capped) | same — never smoothed `delta` |

Design layout stays **1920×1080** (`GAME_*`). CSS shell presents 16:9. Only the WebGL backbuffer + camera zoom shrink.

---

## Adaptive `renderScale` doctrine

1. **Prefer fewer GPU pixels on phones** over fixed 1080p forever. Mid **0.55** and low **0.4** exist because fill-rate (fullscreen PostFX + city overdraw) was the hitch after sim time went wall-clock.
2. **Always** pair `scale.resize` with `syncSceneRenderCamera` on every scene `create` (READY can race late scenes).
3. Pointer / CSS fit must use **live** `gameSize`, not a frozen 1920×1080 assumption (`applyCanvasDisplayScale`).
4. Coarse + Drive/Door: demote earlier; **never linger on high** (fullscreen DayNight) even if FPS briefly looks fine.
5. Measuring “sim clock matches wall” is **not** proof of smoothness — measure `actualFps` / p95 `rawDelta` at each tier with PostFX on/off.

Source of truth: `src/ui/renderBudget.ts`.

---

## PostFX policy

- Attach DayNight only to **shop / drive / door** cameras — never Hud/Title.
- Mid/low: `postFx: false`, `maxLights: 0`; grade still via Graphics where needed.
- Uniform uploads throttled by `uploadMinMs` per tier.
- First-use shader compile belongs in **Boot warm** under `#loading-gate`, not the first shop/door frame.

---

## Drive map cost — static vs dynamic draw split

The city is deterministic. Paying ~1100+ tile `Image` draw calls every frame is the wrong default.

**Static (bake once, then destroy/hide individuals):**

- Ground / road / parking / wall tile Images
- House roofs, street lamps (poles), curb props, access-path Graphics

After chunked row placement + overlays, `DriveScene.bakeStaticCityMap()` stamps those into a grid of **≤2048px `RenderTexture` cells** (map is 4800×3360 — over typical mobile max texture size as one sheet), scrolls each RT camera to the cell origin, `batchDraw`s depth-sorted statics, then **destroys** the per-tile Images. Camera cull drops off-screen cells for free.

**Dynamic (live sprites / Graphics every frame):**

- Vehicle, walker, traffic cars, destination pin + pulse + labels
- Interactive shop building (hit target) + captions / lot numbers (few Texts)
- Lot glow + night lamp-pool Graphics (animated lighting)
- Hud (other scene)

**Rule:** if it does not move or animate, it should not remain a per-instance draw after bake. If it moves, keep it a sprite and let camera + modest view padding cull it (`TRAFFIC_CULL_PAD`).

Preserve: dropoff gate, wall-clock `rawDelta`, chunked warm build, `#loading-gate`, `syncSceneRenderCamera`.

---

## Warm / preload

Under `#loading-gate`: flush textures a full frame; launch shop/hud; warm DayNight; `launch` drive then door for ≥2 rendered frames each; wait for `isCityBuildComplete()` (includes bake) before sleep. Mid-shift must **wake**, not first-create, Drive/Door.

---

## How to measure

1. Phone Chrome (or AVD): note `game.loop.actualFps` and p95 `rawDelta` on Drive with PostFX forced on vs off and at mid/low scales.
2. Dev harness: `kindlingRenderBudget.force('mid'|'low'|'high')` then `apply()`.
3. Compare draw cost mentally: after bake, Drive display list should be **movers + a handful of RT cells + glow**, not a thousand tiles.
4. Do **not** use “clock matches wall” alone — that only proves sim stepping.

---

## What NOT to do

| Don’t | Why |
|-------|-----|
| Re-enable `fps.smoothStep` | Caps delta when unfocused / after blur → whole sim in slow-mo on phones |
| Tick sim from scene `delta` | Same class of bug — use `rawDelta` |
| Fix “choppy” by locking 1920×1080 forever | Fill-rate is the cost; scales exist on purpose |
| Attach DayNight to Hud/Title | Wasted fullscreen passes |
| Leave per-tile city Images alive after bake | Defeats the static/dynamic split |
| First-create Drive/Door mid-delivery | Hitch on city draw + shader compile |
| Treat IDE-pane FPS as phone truth | Use coarse seed + real device / emulator |

---

## Related

- `src/ui/renderBudget.ts` — tiers and camera sync
- `src/scenes/DriveScene.ts` — chunked build + `bakeStaticCityMap`
- `src/config.ts` / `src/main.ts` — `smoothStep: false`, `autoMobilePipeline`, coarse 30fps limit
- [KNOWN_ERRORS.md](../KNOWN_ERRORS.md) — DayNight / wall-clock hitch history
