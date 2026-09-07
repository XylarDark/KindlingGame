# Kindling — aesthetics & gameplay-loop audit

**Date:** 2026-09-06  
**Scope:** One-shift retail loop (shop → drive → door → results). No redesign; findings only.  
**Methods:** Static code matrix · `scripts/audit-loops.ts` (16/17 checks) · Vitest green (155) · live preview `http://127.0.0.1:4173` with `?howto=1` / `?howto=0&hour=` · stills in [`docs/promo/`](promo/)

---

## 1. Executive verdict

**Playable as a one-shift product, not yet retail-tight.** The three sales loops and door order work in sim and in browser; shift-end results appear and read clearly. Biggest gaps:

1. **Next-tap honesty is broken when bags are packed and a walk-in is active** — hints point at the walk-in, but the seated driver still pulses (`ShopScene` uses `canHitTheRoad`, not `hitTheRoad` hint).
2. **Dead / misleading affordances** — on-screen drive pad is always hidden; `packBag` / receipt sprites forced invisible; `counterBag` and `gpsPin` hint kinds never drive unique flash; README still advertises pad movement.
3. **Juice is toast-heavy** — score pops exist for completes/fails; only photo has SFX; pack/sell/deny/wrong-TV are silent beyond toast.

Not P0 softlocks found for the main path: mid-door at 23:00 clears dropoff and shows results (sim + `?hour=23` live).

---

## 2. Loop health

| Loop | Health | Notes |
|------|--------|--------|
| In-store | **Good** | Toast + TV highlight + customer flash; +10 score pop. Wrong handoff blocks completion. |
| Pickup | **Good** | Tablet → strain → bag → wait → tap customer; +10. |
| Delivery | **Good / fragile** | Door order correct in howto + code. Cooldown reduces skip-through. Multi-stop and late/on-time copy work in sim. |
| Shift end | **Good** | Results card hierarchy clear ([`docs/promo/results.png`](promo/results.png)). New day / Title present. |
| First-run | **Mixed** | Howto matches ASK→CHECK→HAND→PHOTO. Welcome + Music·Settings cog visible. Dual-flash and toast/prompt stacking hurt clarity. |

---

## 3. Interaction matrix (inventory)

Legend: **Pass** / **Fail** / **N/A** · severity P0–P2 when Fail.

### Meta / session

| ID | Interaction | Handler | Verdict | Evidence |
|----|-------------|---------|---------|----------|
| M1 | Welcome card | `TitleScene.drawWelcome` | **Pass** | Live still; copy names key-lead→driver |
| M2 | 3-step howto | `TitleScene.STEPS` | **Pass** | Door order correct in card 03 ([`shop-howto.png`](promo/shop-howto.png)) |
| M3 | Pause strip (dev) | `TitleScene` `paused` | **Pass** | `?howto=0` shows “Paused — tap to start” |
| M4 | Music unlock | `unlockAudio` on advance | **Pass** | Wired on title input |
| M5 | Settings cog | `HudScene.makeSettings` | **Pass** | Label “Music · Settings”; music default **off** (`prefs.ts`) |
| M6 | End shift early | `endShiftEarly` | **Pass** | Sim: requires ≥1 scored action |
| M7 | Reset day 9:00 | `resetToMorning` | **Pass** | Soft reset; after shift end delegates to `startNewDay` |
| M8 | Results New day / Title | `HudScene.onNewDay` / `onTitle` | **Pass** | Live results card; buttons readable |
| M9 | Safe-area / viewFit | `layoutHud` + `viewFit.ts` | **Pass*** | Code targets 44 CSS px; **phone device not physically tested** (desktop preview only) |

\*Mark phone as unverified in live matrix — shell/orientation covered by tests, not by this session’s device.

### Shop

| ID | Tap | Handler | Verdict | Evidence |
|----|-----|---------|---------|----------|
| S1 | Tablet | `shopClick tablet` + `syncTablet` flash | **Pass** | Hint `tablet` flashes green screen |
| S2 | Strain TVs | `shopClick strain` + lime stroke | **Pass** | Highlight via `highlightSkuId` |
| S3 | Bag rack | `shopClick bagRack` | **Pass** | Hint tint + “Tap to pack” |
| S4 | Counter bag (`packBag`) | `shopClick counterBag` | **Fail P2** | `packBag.setVisible(false)` every frame — dead hotspot; packing only via rack |
| S5 | Walk-in customer | `shopClick customer` | **Pass** | +10 flash; lime bubble when focused |
| S6 | Pickup customer | same | **Pass** | Sim pass 2 |
| S7 | Hit the road (driver) | `departNow` → `hitTheRoad` | **Fail P1** | Flashes whenever `canHitTheRoad`, ignoring exclusive `tutorialHints` |
| S8 | Key-lead tap | `shopClick keyLead` | **Pass** | Info toast only |
| S9 | Receipt | `shopClick receipt` | **Pass** (hidden) | Forced invisible; stub toast if forced |

**Also:** Walk-in priority in `nextShopHint` is correct; NPC backroom fetch toasts OK; walkout/no-show fail with −5 + score pop.

### Drive

| ID | Interaction | Verdict | Evidence |
|----|-------------|---------|----------|
| D1 | Auto-drive | **Pass** | Covered by existing route/heading tests + prior polish |
| D2 | Manual pad / WASD | **Fail P1** | Pad forced `setVisible(false)` in `paintHud`; WASD still feeds input when not auto-driving — README oversells pad |
| D3 | GPS pin | **Fail P2** | Pin always drawn for next stop; `gpsPin` hint kind does **not** add extra flash |
| D4 | Park / curb | **Pass** | Phone appears at curb; sim door starts |
| D5 | Phone call | **Pass** | HUD phone flash on `phone` hint |
| D6 | Traffic | **Pass** | Soft braking + decoration; crawl/softlock fixed — see [`qa-traffic.md`](qa-traffic.md) |
| D7 | Van banner toast | **Pass** | Drive toasts over van only when returning (no GPS stop); hidden while a pin/label is up |
| D8 | Tap Kindling return | **Pass** | `shop` hint tints building when in radius |

### Door

| ID | Step | Verdict | Evidence |
|----|------|---------|----------|
| R1 | ASK ID | **Pass** | Customer pulse + prompt |
| R2 | CHECK ID | **Pass** | HUD ID modal; flash ring on `idCard` hint |
| R3 | Under-19 deny | **Pass** | Sim −5 + Denied toast; score flash |
| R4 | HAND BAG | **Pass** | Bag tint; cooldown armed |
| R5 | PHOTO | **Pass** | Flash + camera SFX; late/on-time toast |
| R6 | Multi-stop | **Pass** | Sim pass 5 (50 pts) |
| — | 23:00 mid-door | **Pass** | Sim pass 7; live `?hour=23` → results after unpause |

### Scoring / clock

| ID | Event | Verdict | Evidence |
|----|-------|---------|----------|
| C1 | Score pops | **Pass** | `scoreFlash` → `spawnScorePop` |
| C2 | SLA LATE labels | **Pass** | `formatSlaClock` / urgent color on pins & bags |
| C3 | 23:00 results | **Pass** | [`results.png`](promo/results.png) |
| C4 | Verdicts | **Pass** | Quiet / clean / licence risk strings in `shiftResults.ts` |

---

## 4. Aesthetic findings by scene

### Shop cutaway — T0 intentional, readable

- Strong Kindling brand density (mat, door hours, counter plaque, shirts, cap).
- TV boards color-code SKUs; ORDERS tablet readable.
- Night (`20:30`) window + ceiling pots read as dusk dispensary ([`shop-night.png`](promo/shop-night.png)).
- **Issues:** Lime floor prompt + bottom toast stack on walk-in; customer “KINDLING” cap can read as floating/mis-parented; score uses ink on cream wall — OK day, still OK under night grade.

### City map

- Not still-captured this session (drive loop verified in sim). Pin amber labels + house neon outline are the main wayfinding. Traffic is decorative density, not a teachable system.

### Door porch

- Code path flashes one of customer/bag at a time; ID modal on HUD. Depth flipping (`bringToTop`) is the historic skip-through risk — cooldown + `interactArmed` mitigate; treat residual double-tap as watch item, not open P0.

### HUD / results

- Results card is the strongest “finished product” surface: title, clock, big score, breakdown, verdict, two CTAs.
- Settings cream panel matches title/howto cards (`0xfffaf3` hardcoded, not `Color.wall`).
- Many one-off hexes: `#1c1612ee`, `#3d7a45`, `0xb8ffb0` flash tint, phone map greys — coherent enough, not tokenized.

### Audio

- BGM defaults **muted**; cog label now advertises Music — good for first-run.
- **Only** photo has SFX (`playCameraClick`). Pack / sell / deny / ticket / depart are silent.

### Shell / mobile

- Landscape PWA configured; `MIN_CSS_TOUCH_PX = 44`. This audit did not run on a physical phone.

---

## 5. Copy / hint truth matrix

| Surface | Door order | Match code? |
|---------|------------|-------------|
| README Controls / Loops | ASK ID → CHECK ID → HAND BAG → PHOTO | **Yes** |
| Title howto card 03 | same | **Yes** |
| `interactButtonCopy` | ASK / CHECK / HAND / PHOTO | **Yes** |
| Door prompts | same | **Yes** |
| README “on-screen pad” | advertises pad | **No** — pad hidden |
| `TutorialHint.counterBag` | — | **Dead type** — never emitted |
| `hitTheRoad` hint vs driver flash | exclusive hint | **No** — driver ignores hint exclusivity |
| `gpsPin` hint | — | Emitted; **no dedicated flash** |

---

## 6. Live pass log (scripted + browser)

| Pass | Result | Notes |
|------|--------|-------|
| 1 Counter → End shift → New day | Pass | Score 10 → results → 09:00 / 0 |
| 2 Pickup | Pass | |
| 3 Delivery 19+ | Pass | On-time +25 toast |
| 4 Under-19 | Pass | Denied (−5) |
| 5 Multi-stop | Pass | Score 50 |
| 6 Late | Pass | Late (−10) toast |
| 7 Mid-door 23:00 | Pass | Door cleared; results |
| 8 Wrong TV | **Partial** | Handoff blocked; toast was “Tap the … TV…” not “Wrong TV” when wrong strain was fetched first — confusing but not a softlock |
| 9 Dual flash risk | **Confirmed** | `hint=strain` + `canHitTheRoad=true` |
| 10 Dead surfaces | Confirmed | receipt stub; packBag invisible |
| Howto / welcome / night / results stills | Captured | `docs/promo/*.png` |
| Phone landscape matrix | **Not run** | Desktop preview only |

Harness: `npx tsx scripts/audit-loops.ts`

---

## 7. Juice gap list

| Verb | Toast | Score pop | Flash/tint | SFX |
|------|-------|-----------|------------|-----|
| Correct strain / fetch done | Yes | No | TV highlight | No |
| Bag packed | Yes | No | Rack tint ends | No |
| In-store / pickup sold | Yes (+n) | Yes | Customer tint | No |
| Wrong strain / TV | Yes | No | — | No |
| Under-19 deny | Yes | Yes | ID danger stroke | No |
| On-time / late photo | Yes | Yes | White flash | Yes |
| Hit the road | Yes | No | Driver pulse (too eager) | No |
| Shift end | Overlay | — | Dim | No |

---

## 8. Recommended fix queue (&lt;8h each, priority order)

1. **P1 — Exclusive driver flash** (~1h)  
   In [`ShopScene.ts`](../src/scenes/ShopScene.ts), set `highlightGo = next?.kind === "hitTheRoad"` (not bare `canGo`). Keep input enabled only when `canGo`.

2. **P1 — Align drive controls copy** (~1h)  
   README + howto: state auto-drive is primary; WASD optional; remove “on-screen pad” or re-enable pad only when `!autoDriving`.

3. **P1 — `?hour=23` / start-at-end UX** (~2h)  
   If `gameMs >= SHIFT_MS` at session start, call `endShift()` once play begins (or on first HUD tick) so pause → play does not look frozen at 23:00 with no results.

4. **P2 — Remove or wire dead shop sprites** (~2h)  
   Drop `packBag`/`receipt` interactive leftovers, or show sealed bag interaction only via `outBags`. Remove unused `TutorialHint` `counterBag`.

5. **P2 — gpsPin flash** (~1h)  
   When `next?.kind === "gpsPin"`, pulse pin / pinLabel like shop tint.

6. **P2 — Wrong-TV toast consistency** (~1h)  
   Ensure picking a non-matching walk-in TV always toasts `Wrong TV…` and does not start a confusing fetch of the wrong SKU.

7. **P2 — Deduplicate walk-in prompts** (~2h)  
   Prefer one of: bottom toast **or** lime floor `counterPrompt`, not both stacked.

8. **P2 — Minimal SFX pack** (~3–4h)  
   Soft blip on pack, sell (+), deny (−), ticket claim — reuse WebAudio pattern from `sfx.ts`.

9. **P2 — Tokenize flash/panel colors** (~2h)  
   Move `0xb8ffb0`, `#1c1612ee`, results/settings `0xfffaf3` into `theme.ts` / palette.

10. **P2 — Capture map + door stills** (~1h)  
    Fill [`docs/promo.md`](promo.md) slots 2–3 (city map, door ID) — shop + results already captured.  
    **Done:** [`city-map.png`](promo/city-map.png), [`door-id.png`](promo/door-id.png) via `?shot=drive|door` + `scripts/promo-capture.ts`.

---

## 9. Out of scope (refused)

Traffic/pathfinding rewrite · new art pack · money register · multi-day career · LMS · expanding catalog · native packaging.  
_(Traffic glitches within the existing loop model are tracked in [`qa-traffic.md`](qa-traffic.md).)_

---

## 10. Evidence index

| Artifact | Path |
|----------|------|
| This report | `docs/audit-aesthetics-gameplay.md` |
| Loop harness | `scripts/audit-loops.ts` |
| Promo stills | `docs/promo/shop-welcome.png`, `shop-howto.png`, `shop-night.png`, `results.png` |
| Core sim | `src/sim/gameSim.ts`, `tutorialHints.ts`, `shiftResults.ts` |
| Scenes | `ShopScene.ts`, `DriveScene.ts`, `DoorScene.ts`, `HudScene.ts`, `TitleScene.ts` |
| Theme | `src/ui/theme.ts`, `src/art/palette.ts`, `src/pixelArt.ts` |
