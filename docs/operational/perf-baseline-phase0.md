# Phase 0 — perf / readability baseline

**Purpose:** record how to measure Kindling before size/speed/readability changes, what static bakes and live Text objects exist, and whether correctness gates from PR **#60** (type tokens), PR **#42** (dropoff gate), and Title start-click still hold.

**Plan:** [2026-09-15-size-speed-readability.md](../plans/2026-09-15-size-speed-readability.md)

---

## 1. Meter checklist (`?meter=1`)

### Enable

| Method | How |
|--------|-----|
| Query | `?meter=1` or `?meter=true` |
| Persist | `localStorage.setItem("kindlingMeter", "1")` |
| Disable | `?meter=0` or remove storage key |

Overlay: `src/ui/feelMeter.ts` — fixed top-left, updated from `HudScene` each frame.

**Lines shown:** `fps`, `rawΔ`, `sceneΔ`, rolling `p95` frame ms, `clock` mode, `smoothStep`, fixed-step `steps` / `backlog`, `tier`, `renderScale`, **`resize×`** (mid-session `scale.resize` count — **must stay 0** on coarse after boot).

### Dev console hooks (`main.ts`)

```js
kindlingClock.stats()           // mode, p95FrameMs, fixedSteps, backlogMs, …
kindlingRenderBudget.get()      // tier, renderScale, postFx
kindlingRenderBudget.resizeCount()
kindlingPerfProbe.reset()       // zero setText / plaquePump window
kindlingPerfProbe.sample()      // { actualFps, p95RawDeltaMs, setTextCount, plaquePumpCount, sceneKey }
```

`perfProbe` (`src/ui/perfProbe.ts`) counts `setText` and plaque-pump work per window — useful for **tap strain** vs idle.

### Scenarios to record (desktop lane capture or phone PWA)

Run at **`--size 1920x1080`** so clicks match design coords. Append **`&meter=1`** to every URL.

| # | Scenario | URL / steps | What to note |
|---|----------|-------------|--------------|
| A | **Idle Shop** | `?howto=0&meter=1` → lane shot after 1 start click, ~3 s settle | fps, p95, `resize×`, tier, scale |
| B | **Tap strain** | Same + `--plan` with `click:` on a TV jar (design coords from shop layout) | p95 spike frame; `kindlingPerfProbe.sample().setTextCount` vs idle |
| C | **Hit the road** | Play to driver bubble / tap Hit the road, or `?shot=drive&meter=1` promo seed | p95 on depart frame (A* cache should absorb repeat) |
| D | **First door** | First delivery doorstep, or `?shot=door&meter=1` | Door RT + live prompt; HUD readout column visible |
| E | **How-to / Title** | `?howto=1&meter=1` — `--start-clicks 1 --ready-scene title` | HUD hidden (`scene.setVisible(false, "hud")`); only Title `addUiText` |

**Example capture (idle shop):**

```bash
npx tsx scripts/agent-shot.ts --lane 5 --query "?howto=0&meter=1" --wait 3000 --name shop-idle-meter.png
```

**Example tap-strain plan file** (`/tmp/strain.plan`):

```
wait:2000
click:960,420
wait:500
eval:JSON.stringify(kindlingPerfProbe.sample())
shot:shop-strain-meter.png
```

```bash
npx tsx scripts/agent-shot.ts --lane 5 --query "?howto=0&meter=1" --plan /tmp/strain.plan
```

Paste overlay numbers into PR comments when comparing phases. If capture is unavailable, the hooks above are sufficient — **a green `npm run verify` does not replace meter evidence** for perf work (see AGENTS.md definition of done).

### Baseline numbers (Phase 0)

Desktop lane captures were **not** re-run in the Phase 0 PR (no dev-server session in doc-only pass). Treat the checklist as the baseline procedure; Phase 1+ PRs should paste before/after meter rows.

---

## 2. Bake size inventory

### Design vs backbuffer

| Constant | Value | Source |
|----------|-------|--------|
| `GAME_WIDTH` × `GAME_HEIGHT` | **1920 × 1080** | `src/sim/constants.ts` |
| WebGL backbuffer (high) | 1920 × 1080 | `renderScale` 1.0 |
| WebGL backbuffer (mid, phone) | **1632 × 918** | `round(1920×0.85)` × `round(1080×0.85)` |
| WebGL backbuffer (low) | 1248 × 702 | `round(1920×0.65)` × `round(1080×0.65)` |

RenderTextures for Shop/Door bakes are allocated at **full design** 1920×1080; `syncSceneRenderCamera` zooms world cameras by `renderScale`. HUD camera stays zoom **1** in live backbuffer space (`renderBudget.ts`).

### Where RTs are created

| Scene | RT size | Count | Depth / notes |
|-------|---------|-------|----------------|
| **Shop** | 1920 × 1080 | **2** | Background `0`, midground `7` — `ShopScene.bakeStaticShop` |
| **Door** | 1920 × 1080 | **1** per house style | Facade + yard statics — `DoorScene.bakeDoorFacade` |
| **Drive** | ≤ **2048 × 2048** per cell | **6 cells** (2×3 grid) | Map **4800 × 3360** (`40×120` × `28×120`); `CITY_BAKE_CELL = 2048` |

Drive cells: 2048×2048 + 2048×2048 + 704×2048 on X; full 3360 height on Y (two rows 2048 + 1312).

---

## 3. Live Text / signText inventory (code, create-time)

Counts are **static create** + documented pools — not runtime peak strings.

### Title (`TitleScene`)

| Kind | Count | Notes |
|------|-------|-------|
| `addUiText` | **1 + 2 + 9** | pause hint; welcome title+hint; how-to 3×(step#, title, body) |
| `addSignText` | **0** | how-to uses plain `addUiText` + `addHudButton` |
| `addHudButton` | **1** | OPEN THE SHOP |

### Shop (`ShopScene` + `shopInterior`)

| Kind | Count | Notes |
|------|-------|-------|
| `addSignText` | **4 + 8** | queueBadge, targetCallout, keyLeadBubble, driverBubble; customer pool **4×** (bubble+feedback) |
| `addUiText` | **1 + 6 + 2 + 9** | ORDERS label; receipt rail **6** rows; ready/pickup bag counts; **9** jar strain labels (`CATALOG_SIZE`) |
| `addUiText` (interior) | **1** | window hours plaque |
| Baked into RT | interior labels / decor | not live Text after bake |

### Drive (`DriveScene`)

| Kind | Count | Notes |
|------|-------|-------|
| `addUiText` | **≤ 14** | one house number label per lot (`MAX_HOUSES`) |
| `addSignText` | **0** | drive callouts live on **Hud** |

### Door (`DoorScene`)

| Kind | Count | Notes |
|------|-------|-------|
| `addSignText` | **1** | doorstep prompt (`hudTitle` role) |

### Hud (`HudScene` + modules)

| Module | `addSignText` | `addUiText` | Notes |
|--------|---------------|-------------|-------|
| HudScene | 5 | 6 | toast, drive pin/van/shop, pad label; results panel |
| readouts | 3 + pool **3** | 6 | cover, doorTitle; score pop pool; + shop-scene duplicates (score×2, clock) |
| phone | 1 | 1 | status chip + app title |
| idCard | 0 | **10** | header, fields, hint, signature |
| settings | 0 | **11** | panel copy + values |
| chrome / buttons | 0 | **4×2** | results NEW DAY + TITLE (2 buttons × label+caption) |
| settings buttons | 0 | **4×2** | End shift + Reset (via `addHudButton`) |

**Hud signText subtotal:** ~**11** live chips + **3** pooled score pops.  
**Hud uiText subtotal:** ~**35** (including button captions).

---

## 4. Gate confirm (Phases 0–6 — plan closed)

Status as of Phase 6 closure: **all gates hold** via tests and source scans. Shipped PRs [#112](https://github.com/XylarDark/ShiftGame/pull/112)–[#117](https://github.com/XylarDark/ShiftGame/pull/117); Phase 6 adds [perf-phase6-scans.md](./perf-phase6-scans.md) contract guards.

### PR #60 — four type role tokens

| Check | Evidence |
|-------|----------|
| Four roles | `TYPE_ROLE_COUNT === 4` in `typeScale.test.ts` |
| No legacy scalers in scenes | `typeScale.test.ts` forbids `scaleMsgPx` in scene files |
| Title intro baked | `titleIntro.test.ts` — `TYPE_INTRO`, no `TITLE_INTRO_SCALE` |
| Fixed roles skip clamp-fit | `signText.test.ts` — `typeRole` path |
| No layout throw | `signText.test.ts` — ink failure skips layout |

### PR #42 — dropoff step gate

| Check | Evidence |
|-------|----------|
| Gate latch / cooldown | `dropoffConfirm.test.ts` |
| Held/repeat cannot skip bag/photo | `gameSim.test.ts` — “requires a fresh press after CHECK ID”, edge-triggered tests |
| `releaseDropoffConfirm` on CHECK close | `gameSim.test.ts` — “clears dropoffConfirmHeld when CHECK ID closes without pointerup” |
| Delivery completion needs bag+photo | `gameSim.ts` `complete()` guard (exercised in sim tests) |
| QA harness | `scripts/qa-glitches.ts` dropoff spam paths |

### Title start click

| Check | Evidence |
|-------|----------|
| Only OPEN THE SHOP starts shift | `titleIntro.test.ts` — dim `disableInteractive`, `void this.begin()` on button |
| How-to blocks dim/any-key start | `advanceAsync` / key handler `if (phase === "howto") return` |
| No `setTopOnly(true)` | source guard |
| Deferred warm capped | `Promise.race` + `TITLE_BEGIN_WARM_MS` |
| HUD hidden under title/how-to | `scene.setVisible(false, "hud")` guards |

### HUD / scene leak (drive → door)

| Check | Evidence |
|-------|----------|
| Shop hidden while driving | `hudTick.test.ts` — `syncShopVisibility` |
| ORDERS cannot show on Door | same |
| HUD above door for porch | `bringToTop("door")` then `bringToTop()` order |
| Cover only in shop keyLead role | `readouts.paintCover` guard |

**Regression trigger:** if a capture or QA script shows Title overlay leaking into Shop, HUD chrome visible during how-to, dropoff skipping HAND BAG/PHOTO, or shop tablet visible on Door — fix under the Phase 1 correctness guards before unrelated work.

---

## 5. Verification commands

```bash
npm run typecheck
npm test
npm run verify    # typecheck + tests + production build
```

No code changes expected in Phase 0; these confirm the repo stays green after doc edits.
