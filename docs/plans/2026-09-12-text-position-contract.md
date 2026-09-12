# Text position contract — diagnosis (Luke offset / fine-tuning loop)

**Date:** 2026-09-12  
**Base:** `master` @ `32d6da3` (#63)  
**Question:** Why does all text seem offset from where Luke expects, and why do we keep fine-tuning?

## Executive summary

Text stopped meaning “put the words at `(x, y)`” when **#43** introduced a **host container** around every sign chip, and **#53** changed `Text.setPosition` so it moves the **host**, not the ink. Scenes still pass coordinates as if they were Phaser text-origin or box-center points; the API positions an opaque host origin while inner glyph and nine-slice layout happen in host-local space. **#61–#63** added collision dodging and per-site compensations (`plaqueMidX`, `headHang`, magic offsets like `kx - 168`), which reads as endless fine-tuning.

**Recommended product API (one sentence):** Scenes should pass **`setSignPosition` host coordinates derived from a named anchor** — plaque center, plaque edge, or ink origin — using `signPlaqueExtents` / `signYAbove` / `signYFloor` (and `plaqueMidX = (leftLocal + rightLocal) / 2` when centering on X); never mix raw box-center math with host placement, and never read inner `Text.x/y` after #53.

---

## What changed (commit / PR range)

| When | PR | What broke the old mental model |
|------|----|----------------------------------|
| Pre-#43 | — | `addSignText` returned `Text`; `setPosition` moved the text; a Graphics ring pump followed measured bounds. `(x,y)` = Phaser text origin in world space. |
| #43 `406dcac` | Type tokens + 9-slice | Host `Container` wraps `[plaque, text]`. `addSignText(x,y)` sets **host** position. Patched `Text.setPosition` → `host.setPosition`. Inner text at local `(0,0)` until layout runs. |
| #51 `1b83ddf` | Settings caption | `layoutPlaque` called patched `text.setPosition` for glyph locals → moved **host** off-screen. Fixed with `setTextLocal` (raw position). |
| #53 `9ac1def` | Ink contract | Patched `setPosition` **never** sets inner locals. Added `signPlaqueExtents`, `signYAbove`, `signYFloor`, `setSignPosition`. Scenes must stop treating `Text.setPosition` as placement. |
| #54 `fbb0a6e` | Ink module | `signTextInk.ts` extracts bounds math; contract frozen in tests. |
| #61 `3f42112` | Chip resolver | `placeChip` shifts preferred `(x,y)` up to four dodge offsets + safe-rect clamp; may hide chip if no slot fits. |
| #62 `c211afd` | Anchor fixes | Settings: `cogCaptionX = clampedCenterX - plaqueMidX`. Shop speech: `headHang` so resolver never pushes bubbles down onto faces. |
| #63 `32d6da3` | Luke tweaks | Settings caption uses `signYFloor`; queue badge re-pinned every `syncTablet`; score pop tweens `signContainer` host. |

The inflection point is **#43 + #53**: two coordinate spaces (host world + inner locals) with **no single documented anchor** for what host `(x,y)` represents.

---

## What `(x, y)` means now

### Plain `addUiText` — unchanged Phaser semantics

```9:16:src/ui/text.ts
export function addUiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: UiTextOptions = {},
): Phaser.GameObjects.Text {
  return addType(scene, x, y, content, options);
}
```

`(x,y)` is the **text origin** after `setOrigin`. Used for HUD score/clock (`readouts.ts`), tablet ORDERS label, TV strain names, settings panel copy.

### Sign chips (`addSignText` / `setSignPosition`) — host origin

```11:18:src/ui/signText.ts
/**
 * Sign text contract — standard UI: ink stays inside its panel.
 *
 * - {@link addSignText} returns inner `Text`; callers move the {@link signContainer} host only.
 * - Patched `Text.setPosition` never zeroes glyph locals (#53).
 * - {@link layoutPlaque} sizes the nine-slice from glyph bounds + pad variant.
 * - {@link inkInsidePlaque} skips layout when ink would clip — never throws on live frames.
 * - {@link syncChildScrollFactors} copies scroll from the host only.
 */
```

```177:182:src/ui/signText.ts
/** Move a sign chip — updates the host container when present. */
export function setSignPosition(text: Phaser.GameObjects.Text, x: number, y: number): void {
  const host = text.getData(SIGN_HOST) as Phaser.GameObjects.Container | undefined;
  if (host) host.setPosition(x, y);
  else text.setPosition(x, y);
}
```

**Host `(x,y)` is the container origin `(0,0)`**, not:

- the Phaser `Text` origin (inner text is laid out at `(-w·originX, -h·originY)` inside the host),
- the plaque center (plaque is centered separately in host-local space),
- nor the ink bounding-box center.

Inner layout (every pump / `syncSignPlaque`):

```297:304:src/ui/signText.ts
  const textX = -w * text.originX;
  const textY = -h * text.originY;
  const plaqueCenter = plaqueCenterFromGlyphs(text, w, h, panelW, panelH);
  // Always repair inner layout — patched setPosition must not leave glyphs orphaned at (0,0).
  entry.setTextLocal(textX, textY);
  plaque.setSize(panelW, panelH);
  plaque.setOrigin(0.5, 0.5);
  plaque.setPosition(plaqueCenter.x, plaqueCenter.y);
```

**Semantic helpers (Y only, today):**

```242:249:src/ui/signText.ts
/** Host Y so the plaque's lowest pixel sits `gap` px above `ceilingY` (smaller y = higher). */
export function signYAbove(text: Phaser.GameObjects.Text, ceilingY: number, gap: number): number {
  return ceilingY - gap - signPlaqueExtents(text).bottomLocal;
}

/** Host Y so the plaque's top pixel sits at least `gap` px below `floorY`. */
export function signYFloor(text: Phaser.GameObjects.Text, floorY: number, gap: number): number {
  return floorY + gap - signPlaqueExtents(text).topLocal;
}
```

**Plaque AABB in host-local space** (used by resolver + door dodge):

```213:239:src/ui/signText.ts
export function signPlaqueExtents(text: Phaser.GameObjects.Text): SignPlaqueExtents {
  syncSignPlaque(text);
  // ...
  return {
    panelW,
    panelH,
    leftLocal: center.x - panelW / 2,
    rightLocal: center.x + panelW / 2,
    topLocal: center.y - panelH / 2,
    bottomLocal: center.y + panelH / 2,
  };
}
```

There is **no exported `signXCenter` helper**; settings manually computes `plaqueMidX` (see below).

---

## Scene anchor audit — aiming at the wrong point

### Shop customer speech (`layoutCustomerSpeech` → host)

Layout returns a **box center** `(x, y)`:

```248:262:src/maps/shopT0.ts
export function layoutCustomerSpeech(
  customers: readonly { orderId: string; x: number }[],
  bubbleH: number = CUSTOMER_SPEECH_H,
): CustomerSpeechBox[] {
  // ...
      const x = chipCentreX(customer.x, side, w);
      const box: CustomerSpeechBox = { orderId: customer.orderId, x, y, w, h: bubbleH, side };
```

Bubble uses origin `(0.5, 0.5)` but sync places **host** at that center with no mid offset:

```741:750:src/scenes/ShopScene.ts
    const bubble = addSignText(this, -400, CUSTOMER_SPOT.y - PERSON_DISPLAY_H, "", {
      // ...
    })
      .setOrigin(0.5)
```

```842:845:src/scenes/ShopScene.ts
      if (layout && customer.bubble) {
        bubble.setAlpha(1).setVisible(true);
        if (bubble.text !== customer.bubble) bubble.setText(customer.bubble);
        setSignPosition(bubble, layout.x, layout.y);
```

Plaque visual center in world space ≈ `host.x + (leftLocal + rightLocal)/2`, not `host.x`. Then `placeChip` may shift again.

### Shop head bubbles — magic X + `signYAbove` Y

```126:128:src/scenes/ShopScene.ts
function hangAboveHead(chip: Phaser.GameObjects.Text, model: Phaser.GameObjects.Image, x: number): void {
  setSignPosition(chip, x, signYAbove(chip, modelHeadTop(model), CUSTOMER_SPEECH_GAP));
}
```

Y is plaque-aware; X is a tuned constant (`kx - 168`, `DRIVER.x - 24`) passed as **host X**, not head center minus `plaqueMidX`. #62 added `headBubbleAnchor` + `headHang` in `resolveShopChips`, but `sync()` still calls `hangAboveHead` first with the same host-X assumption.

Origins differ per bubble: key lead `(0.5, 1)` (`ShopScene.ts:277`), driver `(1, 1)` (`ShopScene.ts:295`).

### Door prompt — mixed plaque-edge X, plaque-edge Y, then resolver

```176:204:src/scenes/DoorScene.ts
  private placePrompt(): void {
    const plaque = signPlaqueExtents(this.prompt);
    const half = plaque.panelW / 2 + DOOR_CHIP_MARGIN;
    let x = Phaser.Math.Clamp(this.promptAnchorX, half, GAME_WIDTH - half);
    // ...
    const yAbove = headTop - DOOR_CHIP_GAP - plaque.bottomLocal;
    // ...
    placeChip(placer, "doorPrompt", this.prompt, preferredX, preferredY, chipPriority("doorPrompt"));
```

X math treats `preferredX` as **plaque center** (`half = panelW/2`), but `placeChip` treats `preferredX` as **host X** unless `leftLocal/rightLocal` happen to center the plaque on the host origin (they do not for `(0.5,1)` origin).

### HUD readouts — plain text, predictable

Score row uses `addUiText` with explicit origins — still Phaser-normal:

```170:172:src/ui/hud/readouts.ts
      this.scoreText.setOrigin(1, 0.5).setPosition(signLeft, y);
      this.scoreCaption.setOrigin(1, 0.5).setPosition(signLeft - valueW - gap, y);
      this.clockText.setOrigin(0, 0.5).setPosition(signRight, y);
```

Cover / door title sign chips use `(0,0)` and `(0, 0.5)` origins then `placeChip` — another mixed convention.

### Settings cog — the one site that compensates correctly (#62–#63)

```371:390:src/ui/hud/settings.ts
    syncSignPlaque(this.cogCaption);
    const cogCenterX = this.cog.x - this.cog.displayWidth / 2;
    const capExtents = signPlaqueExtents(this.cogCaption);
    const plaqueMidX = (capExtents.leftLocal + capExtents.rightLocal) / 2;
    // ...
    let cogCaptionX = clampedCenterX - plaqueMidX;
    // ...
    const cogCaptionY = Phaser.Math.Clamp(signYFloor(this.cogCaption, cogBottom, 8), minCenterY, maxCenterY);
    setSignPosition(this.cogCaption, cogCaptionX, cogCaptionY);
```

This is the **template** other sites need: derive host position from desired plaque anchor minus local offset.

### Drive projected callouts — anchor + clamp on host

```619:621:src/scenes/HudScene.ts
        const anchor = worldToScreen(cam, x, y - pinBob - DRIVE_PIN_TEX_H - DRIVE_CHIP_GAP);
        const pinPos = clampSignHost(this.drivePinLabel, anchor.x, anchor.y, viewW, viewH, inset);
        setSignPosition(this.drivePinLabel, pinPos.x, pinPos.y);
```

`clampSignHost` clamps using `plaque.panelW/2` and `topLocal/bottomLocal` — treating input as host position aligned so plaque fits, not as ink center.

---

## Chip resolver (#61) — second shift after scene math

```62:81:src/ui/hud/placeChips.ts
export function placeChip(
  placer: ChipPlacer,
  id: string,
  host: Phaser.GameObjects.Text,
  preferredX: number,
  preferredY: number,
  priority = chipPriority(id),
  headHang = false,
): boolean {
  // ...
  const slot = placer.findOpenSlot(preferredX, preferredY, plaque, priority, id, headHang);
  // ...
  setSignPosition(host, slot.x, slot.y);
```

Resolver steps:

1. `signPlaqueExtents` → plaque AABB offset from host (`chipPlaqueAabb`).
2. Try offsets: preferred, **up** one plaque, left, right, optionally down (`chipCollision.ts:95–103`).
3. `clampChipHost` nudges into safe rect (`chipCollision.ts:55–69`).
4. Writes final host position — may differ from scene “preferred” with no callback.

`headHang = true` (#62) removes the downward dodge so speech stays above heads, but horizontal and upward shifts remain.

Priority table in `slots.ts` means high-priority chips (settings, scoreClock) become immovable obstacles; lower chips dodge or hide.

---

## Origin soup

| Site | Object | Origin | Host placement assumption |
|------|--------|--------|---------------------------|
| Customer bubble | sign | `(0.5, 0.5)` | Box center = host `(x,y)` ❌ |
| Key-lead speech | sign | `(0.5, 1)` | Magic host X; Y via `signYAbove` ✓ |
| Driver speech | sign | `(1, 1)` | Same |
| Door prompt | sign | `(0.5, 1)` | X as plaque center; host X ❌ |
| Settings caption | sign | `(0.5, 0.5)` | `plaqueMidX` + `signYFloor` ✓ |
| Queue badge | sign | `(1, 0)` | Top-right pin at tablet inset |
| Cover / door title | sign | `(0, 0)` / `(0, 0.5)` | Corner column + `placeChip` |
| Score / clock | plain | `(1, 0.5)` / `(0, 0.5)` | Phaser-normal ✓ |

Mixed origins are fine **if** placement math converts desired anchor → host using `signPlaqueExtents`. Today only settings does this reliably on X.

---

## Why the fine-tuning loop keeps happening

1. **Two APIs**: `addUiText` = ink origin; `addSignText` = host origin — easy to apply the wrong one.
2. **Patched `Text.setPosition`**: moving “the text” moves the host (`signText.ts:369–371`); inner `Text.x/y` are layout artifacts.
3. **Y helpers exist, X helpers don’t**: `signYAbove` / `signYFloor` fixed vertical tuning; horizontal still uses magic numbers or box-center guesses.
4. **`placeChip` moves chips after scene layout**: preferred anchor ≠ landed anchor; debugging by eye adjusts magic constants instead of fixing the contract.
5. **Copy-driven relayout**: `setText` / wrap changes `panelW`, `leftLocal`, `plaqueMidX` — host must be recomputed; sites that pin once (create-time `addSignText(x,y)`) drift (#63 re-pins queue badge in `syncTablet` for this reason).
6. **Each regression gets a local patch** (#51 settings off-screen, #62 plaqueMidX, #63 signYFloor) rather than one shared `setSignAnchor(chip, worldX, worldY, mode)` helper.

---

## Recommended fix (no redesign in this run)

**Product rule:** Pick **plaque center** as the single scene-facing anchor for sign chips. Scenes compute:

```ts
const ext = signPlaqueExtents(chip);
const midX = (ext.leftLocal + ext.rightLocal) / 2;
setSignPosition(chip, desiredPlaqueCenterX - midX, signYAbove(chip, ceilingY, gap));
```

Plain HUD numerals stay on `addUiText` with explicit origins.

**Follow-up (future PR):** Export `signPlaqueMid(text)` and `setSignPlaqueCenter(text, x, y)` wrapping the subtraction; migrate `layoutCustomerSpeech` / door / shop call sites; teach `placeChip` to accept optional anchor mode — out of scope here.

**Tiny change shipped with this note:** Contract comment at top of `signText.ts` stating host `(x,y)` semantics explicitly (see that file).

---

## Verification

Investigation only — no runtime behavior change beyond the comment. `npm test` must stay green if touched.
