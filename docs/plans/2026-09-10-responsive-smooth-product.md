# Kindling responsive + smooth product plan (2026-09-10)

**Goal:** the installed phone PWA feels **responsive and smooth end-to-end** — taps acknowledge immediately, motion stays consistent, and there are no mid-session stalls. Input, frame budget, and measurement come first; wall-clock sim is an optional later tool, not the headline.

**Audience:** agents and humans shipping perf/responsiveness work without re-opening the slow-mo / hitch regressions documented in [KNOWN_ERRORS.md](../KNOWN_ERRORS.md).

**Read with:** [guides/smooth-2d-runtime.md](../guides/smooth-2d-runtime.md), [plans/2026-09-10-density-first-budget.md](2026-09-10-density-first-budget.md), [PR #29](https://github.com/XylarDark/KindlingGame/pull/29) (session scale lock / click-lag root cause).

---

## Product rule (non-negotiable until gates pass)

**Smoothed Phaser delta remains the committed product clock until every prerequisite gate in this doc passes.**

- Do **not** treat “rawDelta enabled” or “sim clock matches wall time” as success.
- Do **not** expand reliance on `game.loop.rawDelta` or `fps.smoothStep: false` while stalls, input lag, or frame-budget misses remain open.
- Phase 5 is the only place rawDelta / wall-clock becomes a deliberate product choice again — with A/B, telemetry, and a runtime fallback flag.

Current tree may already tick from `rawDelta` ([`HudScene.ts`](../../src/scenes/HudScene.ts)); this plan does not require reverting that in docs-only work, but **no new PR should cite rawDelta as the fix for “feels laggy”** until Phases 0–4 are green on an installed device.

---

## Success criteria

| Criterion | How we know |
|-----------|-------------|
| **Snappy input** | Tap/hold on shop tablet, drive pad, door confirm, and HUD buttons produces visible/audio ack within the **same frame** on coarse pointer; no 100–300 ms post-click freeze. |
| **No mid-session stalls** | No `scale.resize` storm, full-scene typekit sweep, or static rebake after ordinary gameplay clicks. |
| **Stable motion feel** | Drive scroll, walk-in movement, and HUD clock advance at a **consistent** perceptual rate — not alternating slow-mo and catch-up. |
| **Honest phone frame budget** | Installed PWA on a representative phone: p95 frame time within tier budget (see Phase 2) on Drive, Shop, and Door without IDE-pane-only proof. |
| **Observable, not narrated** | Regression triage uses overlay/telemetry (Phase 3), not “felt laggy on my phone” alone. |

**Not success:** green Vitest, green `tsc`, or a capture that only proves boot — necessary but insufficient ([AGENTS.md](../../AGENTS.md) definition of done still applies to code changes).

---

## Non-goals

- Restoring `fps.smoothStep: true` as a “smoothness hack” (causes whole-sim slow-mo on phones — [KNOWN_ERRORS](../KNOWN_ERRORS.md)).
- New speculative FX systems, phone PostFX, or soft full-frame scales (0.45 / 0.32 superseded — [density-first budget](2026-09-10-density-first-budget.md)).
- ASTC/ETC texture packs or new atlas authoring in this arc.
- Feel-pack polish (camera juice, haptics, juice tweens) before stalls and input path are closed.
- Changing gameplay rules, dropoff logic, or sim outcomes — only presentation timing and perf plumbing unless a doc-only pointer is needed.

---

## Prerequisites gate checklist

All must pass before Phase 5 (rawDelta product decision) or before declaring the responsive/smooth arc complete:

- [ ] **Phase 0** — session scale lock landed; no resize / typekit / bake on click path remains.
- [ ] **Phase 1 design** — fixed timestep + render interpolation spec written and reviewed (implementation may trail if smoothed delta is still the runtime default).
- [ ] **Phase 2** — phone p95 frame budget met at mid **0.85** (PostFX off) on Drive, Shop, Door on **installed** PWA.
- [ ] **Phase 3** — measurement overlay or equivalent telemetry captures p95 `rawDelta`, tier, resize events, and pointer-to-ack latency in one session export.
- [ ] **Phase 4** — pointer handlers audited; dropoff confirm gate preserved ([`dropoffConfirm.ts`](../../src/sim/dropoffConfirm.ts)); no heavy work on `pointerdown`.
- [ ] **Regression guards** — existing source guards stay green: [`hudTick.test.ts`](../../src/scenes/hudTick.test.ts) (clock wiring), bake boot-only tests ([`driveScene.test.ts`](../../src/scenes/driveScene.test.ts)), render-budget unit tests ([`renderBudget.test.ts`](../../src/ui/renderBudget.test.ts)).
- [ ] **Physical device** — at least one coarse-pointer phone session recorded with overlay data, not emulator-only.

---

## Kindling file map (quick reference)

| Concern | Primary files |
|---------|----------------|
| FPS / smoothStep config | [`src/main.ts`](../../src/main.ts) (`fps.target`/`limit` 30 coarse, `smoothStep: false`), [`src/config.ts`](../../src/config.ts) |
| Sim tick / input sampling | [`src/scenes/HudScene.ts`](../../src/scenes/HudScene.ts) `update()` — `readInput()` → `setPlayerInput` → `sim.tick` |
| Render budget / resize | [`src/ui/renderBudget.ts`](../../src/ui/renderBudget.ts) — tiers, `applyRenderScale`, `tickRenderBudget`, hitch demote |
| CSS ↔ buffer pointer map | [`src/shell.ts`](../../src/shell.ts) `applyCanvasDisplayScale`, [`src/ui/viewFit.ts`](../../src/ui/viewFit.ts) |
| Typekit on resize | [`src/ui/typekit.ts`](../../src/ui/typekit.ts) `installTypekit` → `refreshTypekit` on `Scale.Events.RESIZE` + `VIEWFIT_EVENT` |
| Hud relayout on resize | [`src/scenes/HudScene.ts`](../../src/scenes/HudScene.ts) `layoutHud` on `RESIZE` / `VIEWFIT_EVENT` |
| Static bakes (boot-only) | [`DriveScene.bakeStaticCityMap`](../../src/scenes/DriveScene.ts), [`ShopScene` bake](../../src/scenes/ShopScene.ts), [`DoorScene.bakeDoorFacade`](../../src/scenes/DoorScene.ts) |
| Dropoff input gate | [`src/sim/dropoffConfirm.ts`](../../src/sim/dropoffConfirm.ts), [`gameSim.ts`](../../src/sim/gameSim.ts) `dropoffConfirmHeld` |
| Boot warm (no mid-game bake) | [`BootScene.ts`](../../src/scenes/BootScene.ts), [`#loading-gate`](../../src/ui/loadingGate.ts) |

---

## Phase 0 — Stop self-inflicted stalls

**Problem:** the game can hitch **after** a click even when GPU budget is otherwise fine. PR [#29](https://github.com/XylarDark/KindlingGame/pull/29) traced the chain: sim state change → RenderBudget demotion → `game.scale.resize` → `Scale.Events.RESIZE` → **`refreshTypekit()` on every Text in every scene** → multi-frame stall; optional FX tier flips forced glow/sky rebuilds.

### Requirements

1. **Session scale lock (PR #29).** On coarse pointer, seed mid **0.85** at boot and **do not** call `applyRenderScale` / `game.scale.resize` mid-session. Desktop may still demote with hysteresis; phones stay fixed tier for the session.
   - Implement via `sessionTierLocked` (or equivalent) in [`renderBudget.ts`](../../src/ui/renderBudget.ts); `tickRenderBudget` becomes promote-only or no-op on coarse when locked.
2. **Ban resize on click.** Tier evaluation must not run synchronously inside pointer handlers. [`HudScene.ts`](../../src/scenes/HudScene.ts) must not double-apply budget (local apply + `onRenderBudgetChange` listener) on the same tier flip.
3. **Ban typekit sweep on gameplay resize.** If resize still happens (desktop demotion, rare viewport change), defer `refreshTypekit` or scope it to HUD texts whose CSS floor depends on `viewFit` — never full-scene sweep on a tier flip triggered by a 48 ms hitch.
   - Today: [`installTypekit`](../../src/ui/typekit.ts) hooks `RESIZE` → `refreshTypekit(game)` walks **all** scenes.
4. **Ban bake on click.** Static bakes are **boot-only** ([`BootScene`](../../src/scenes/BootScene.ts) warm under `#loading-gate`). Verify Drive city bake, Shop interior RTs, and Door facade RT are not invoked from `update`, pointer handlers, or scene wake paths.
5. **Remove speculative demotion triggers** that reintroduce the storm: coarse one-strike + `rawDelta ≥ 48 ms` hitch demote, `setRenderStressContext` heavy-scene bands, and `phoneFxQuality()` tier invalidation that rebuilds glow on every flip — per PR #29 postmortem.

### Exit gate

- Installed phone: ten consecutive shop taps (tablet, bags, hit the road) with **no** visible freeze and overlay shows **zero** `scale.resize` events mid-session.
- Source: no `bakeStatic*` calls outside boot/warm paths; coarse session lock covered by test or guard.

---

## Phase 1 — Fixed timestep + render interpolation (Gaffer-style)

**When:** design and optionally implement **before** committing to wall-clock sim as the long-term clock (Phase 5). This is the recommended path **if** we revisit wall-clock after Phase 0–4.

### Model

1. **Fixed sim step** — e.g. `SIM_DT = 1000/30` ms on coarse, `1000/60` on fine; sim always advances in fixed steps.
2. **Accumulator** — add real elapsed ms (`performance.now()` delta or guarded raw delta) to accumulator; consume whole steps in a `while (acc >= SIM_DT)` loop with a max steps-per-frame cap (avoid spiral of death).
3. **Render interpolation** — store previous and current sim state (or per-entity positions); render at `alpha = acc / SIM_DT` between ticks so sprites move smoothly even when sim steps 30 Hz.
4. **Input sampling** — sample pointer/keyboard at start of frame into a buffer; apply to sim on the **next** fixed step (same frame if step runs this frame). Preserves “same-frame ack” for UI chrome while keeping sim deterministic.

### Kindling touchpoints

- **Sim:** [`GameSim.tick`](../../src/sim/gameSim.ts) stays pure; add snapshot ring or entity prev/current in settled `src/sim/**` with tests.
- **Scenes:** Drive walker/vehicle/traffic sprites interpolate in `update` before camera follow; Shop/Door mostly static bakes — fewer movers.
- **Hud:** clock display reads sim time, not wall time; score pops may stay event-driven.
- **Do not** drive fixed steps from Phaser smoothed `delta` — that reintroduces slow-mo ([KNOWN_ERRORS](../KNOWN_ERRORS.md)).

### Exit gate

- Desktop: sim tests unchanged; new interpolation tests for one mover (vehicle or walker).
- Phone: visual scroll on Drive at 30 fps sim + 30 fps render feels smoother than variable-step rawDelta at same p95 budget (A/B in Phase 3).

---

## Phase 2 — Honest phone frame budget

**Problem:** wall-clock sim ([`HudScene`](../../src/scenes/HudScene.ts) `game.loop.rawDelta` capped at [`MAX_SIM_STEP_MS`](../../src/scenes/HudScene.ts)) **exposed** GPU fill-rate debt ([KNOWN_ERRORS](../KNOWN_ERRORS.md) DayNight entry). Smoothness requires an honest budget per frame, not chasing 60 Hz on phones.

### Targets (coarse / installed PWA)

| Scene | Tier | p95 frame time | Notes |
|-------|------|----------------|-------|
| Shop | mid 0.85 | ≤ 33 ms (~30 fps) | PostFX **off**; two static RTs + live actors |
| Drive | mid 0.85 | ≤ 33 ms | PostFX **off**; baked city cells + movers + lite glow |
| Door | mid 0.85 | ≤ 33 ms | Facade RT + live sky/glow on dirty key |

Demotion to low **0.65** is a **session-start or boot** choice on phones once Phase 0 lock exists — not mid-click. Desktop high may use PostFX at `postFxScale: 0.5` ([`renderBudget.ts`](../../src/ui/renderBudget.ts)).

### Density-first doctrine (already landed — hold the line)

- Prefer sharp pixels + cheap FX over soft scale — mid **0.85** / low **0.65** ([density-first budget](2026-09-10-density-first-budget.md)).
- PostFX off on phone mid/low; mood via Graphics ([`dayNightPipeline.ts`](../../src/art/dayNightPipeline.ts) detach on tier).
- Static bakes + atlases ([`cityTileAtlas.ts`](../../src/art/cityTileAtlas.ts), [`peopleAtlas.ts`](../../src/art/peopleAtlas.ts)) — no per-tile city Images after bake.
- **No speculative FX systems** — no new fullscreen passes, no tier-driven glow rebuild storms ([coarse-overdraw cuts](2026-09-10-coarse-overdraw-cuts.md) landed demotion cuts; Phase 0 removes counterproductive ones).

### FPS config

- [`main.ts`](../../src/main.ts): coarse `fps.target` + `fps.limit` **30**; fine 60.
- [`config.ts`](../../src/config.ts): `autoMobilePipeline: true`; design 1920×1080 with adaptive backbuffer via `scale.resize`.

### Exit gate

- Phase 3 overlay: p95 ≤ 33 ms on all three scenes, mid tier, installed PWA, 60 s session each.

---

## Phase 3 — Measurement overlay / telemetry

**Problem:** “felt laggy” without numbers caused thrash (rawDelta ↔ smoothStep ↔ resize tiers). Replace black-box narration with **session-exportable** metrics.

### Minimum overlay (dev + optional beta flag)

| Field | Source |
|-------|--------|
| `actualFps` / p95 `rawDelta` | `game.loop` |
| Active tier / `renderScale` | `getRenderBudget()` |
| `scale.resize` count | hook in [`applyRenderScale`](../../src/ui/renderBudget.ts) |
| `refreshTypekit` duration / call count | wrap [`refreshTypekit`](../../src/ui/typekit.ts) |
| Pointer → first paint ack ms | mark on `pointerdown`, clear on next `PRE_RENDER` or dom feedback |
| Scene stress context | shop / drive / door |
| Bake invocations | assert zero after boot |

Expose via dev handle (extend `kindlingRenderBudget` in [`main.ts`](../../src/main.ts)) or a Hud debug chip toggled with `?perf=1`.

### Exit gate

- One attached JSON/log from a phone session sufficient to diagnose a reported stall without asking the user to narrate timing.

---

## Phase 4 — Input path: same-frame ack; light handlers

**Problem:** even with GPU budget fixed, heavy `pointerdown` work delays ack and queues sim work behind stalls.

### Requirements

1. **Same-frame ack** — button/chip/pad toggles set visual state (tint, scale pulse, SFX) **synchronously** in the handler before any await or scene sleep/wake.
2. **No heavy work on pointer handlers** — forbid in handlers: `scale.resize`, `refreshTypekit`, `layoutHud` full pass, static bake, city rebuild, atlas regen, settings panel rebuild.
3. **Defer sim mutations that wake scenes** — where possible, queue `shopClick` / scene transitions to start of next `HudScene.update` (still same frame if handler is sync before render).
4. **Keep dropoff gate** — [`dropoffConfirm.ts`](../../src/sim/dropoffConfirm.ts) edge-triggered confirm stays; do not bypass for “responsiveness.” [`dropoffGateAccepts`](../../src/sim/dropoffConfirm.ts) prevents double-advance; swallow queued confirms during cooldown.
5. **Pointer map** — after any budget change, [`applyCanvasDisplayScale`](../../src/shell.ts) must run so hit targets align ([KNOWN_ERRORS](../KNOWN_ERRORS.md) canvas resize entry).

### Kindling hotspots to audit

- [`HudScene.onPointerDown`](../../src/scenes/HudScene.ts) / pad / tablet routing
- Shop [`ShopScene`](../../src/scenes/ShopScene.ts) interactive tablet — dirty-guard `setText` / typekit ([comments at line ~315])
- Drive [`DriveScene`](../../src/scenes/DriveScene.ts) — dirty-guard plaque typekit (~270)
- Door [`DoorScene`](../../src/scenes/DoorScene.ts) — instruction `setText` refit only on change (~301)

### Exit gate

- Overlay: p95 pointer-to-ack < 16 ms on coarse for shop tablet tap and drive pad touch.
- QA harness [`scripts/qa-glitches.ts`](../../scripts/qa-glitches.ts) still green; dropoff gate tests unchanged.

---

## Phase 5 — RawDelta readiness (optional wall-clock tool)

**Only after Phases 0–4 gates pass.** This subsection is **not** the product title — it gates whether wall-clock sim remains appropriate.

### Decision

Re-enable or **keep** `game.loop.rawDelta` + `fps.smoothStep: false` as the product clock **only if**:

- Fixed-step + interpolation (Phase 1) is **not** chosen as the long-term model, **and**
- A/B on installed phones shows rawDelta ≥ fixed-step for p95 smoothness **and** input ack, **and**
- Fallback flag exists: `kindlingClock=smoothed|raw|fixed` (localStorage or query) defaulting to **smoothed** until user opts in or gates auto-flip.

### A/B protocol

1. Cohort A: smoothed delta (or fixed-step if implemented).
2. Cohort B: rawDelta capped at [`MAX_SIM_STEP_MS`](../../src/scenes/HudScene.ts) (1000 ms — do not tighten to 100 ms; reintroduces slow-mo on low FPS).
3. Measure via Phase 3 overlay: p95 frame time, input ack, sim clock drift vs wall, subjective stall count.
4. Ship winner; keep fallback one release.

### Guards

- [`hudTick.test.ts`](../../src/scenes/hudTick.test.ts) — document which clock mode is product default.
- Never tick sim from scene `delta` alone.
- Do not re-enable `smoothStep` as a substitute for GPU budget work.

### Exit gate

- Product owner sign-off with overlay evidence from both cohorts.
- [smooth-2d-runtime.md](../guides/smooth-2d-runtime.md) updated to state committed clock mode.

---

## Execution order

```mermaid
flowchart LR
  P0[Phase 0: no stalls] --> P2[Phase 2: frame budget]
  P0 --> P4[Phase 4: input path]
  P2 --> P3[Phase 3: telemetry]
  P4 --> P3
  P3 --> P1[Phase 1: fixed-step design]
  P1 --> P5[Phase 5: rawDelta decision]
  P3 --> P5
```

Phases 0 and 4 can land in parallel; Phase 3 should land before declaring any perf fix done. Phase 1 can proceed as design doc + sim tests while smoothed delta remains runtime default. Phase 5 is last.

---

## Related plans and history

| Doc | Role |
|-----|------|
| [2026-09-10-density-first-budget.md](2026-09-10-density-first-budget.md) | Phone scale / PostFX doctrine |
| [2026-09-10-coarse-overdraw-cuts.md](2026-09-10-coarse-overdraw-cuts.md) | Overdraw demotion (Phase 0 trims harmful parts) |
| [2026-09-10-drawing-board-perf.md](2026-09-10-drawing-board-perf.md) | Prior ranked perf items (bakes landed) |
| [PR #29](https://github.com/XylarDark/KindlingGame/pull/29) | Session scale lock + click-lag root cause |
| [KNOWN_ERRORS.md](../KNOWN_ERRORS.md) | smoothed delta slow-mo, DayNight hitch, SW fetch, typekit audit |

---

## Open questions

1. **Fixed-step vs rawDelta long-term** — Phase 1 vs Phase 5 outcome; default stays smoothed until decided.
2. **Session-locked low tier** — if mid 0.85 still misses p95 on oldest supported phone, boot at low 0.65 without mid-session demotion?
3. **Overlay in production** — dev-only vs beta flag on installed PWA for Luke field sessions.
