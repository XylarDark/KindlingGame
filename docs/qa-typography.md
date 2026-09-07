# Kindling — typography audit

**Date:** 2026-09-06 (visual redo 2026-09-07)  
**Goal:** Readable UI type that fits chrome; verified with browser screenshots.

## Scale (layout-first)

| Token | Design px |
|-------|----------:|
| display | 36 |
| title | 27 |
| heading | 20 |
| body | 16 |
| caption | 13 |
| micro | 11 |
| fit floor | 10 |

`fitTypeToBox` shrinks fonts (never bitmap-scales) to `maxWidth`/`maxHeight`. Wrap width subtracts padding + a letter-spacing gutter. Multi-line labels skip caps tracking so wrap math stays honest. `refitType` after mid-frame padding/chrome changes.

`noWrap: true` keeps authored line breaks and shrinks to fit width instead of re-wrapping. Use it for labels whose line structure is meaningful (door hours, phone title/status, GPS pin), so `9 AM – 11 PM` can never split into `9 AM – 11` / `PM`.

## Automated layout harness

`import.meta.env.DEV` exposes `globalThis.kindlingGame`. In DevTools, walk every visible `Text` in the running scenes and flag three classes of defect:

- **overflow** — measured `width`/`height` beyond the object's `typekitBox`
- **tiny** — resolved size under 12px
- **overlap** — intersecting bounds, *after* converting each scene's bounds to screen space with `(x - cam.scrollX) * cam.zoom`

That camera step matters: comparing the scrolling map's world coords against screen-space HUD reports false overlaps. Sampling on a 250 ms interval for 20–40 s catches transient collisions from walk-ins, score pops, and phone state changes that single frames miss.

Result: shop, drive, door, settings, and results all sample clean. The only remaining reported intersections are map house numbers behind the opaque phone panel and cog chip, where the HUD fully occludes the world text.

Re-run after the ID / wall-screen / message size bump (2026-09-07): 130 samples of live shop, 120 of `?shot=drive`, 40 of `?shot=door` — no overflow, nothing under 12px, and no overlaps beyond the documented house-number-behind-phone case. Force-spawning several walk-ins at once does report stacked bubbles, but every customer walks the same path to `CUSTOMER_SPOT.x`, so those chips are exactly co-located at any font size; natural play only ever has one walk-in.

## Visual QA notes (iterative)

Fixed from screenshots (`?howto=1`, `?shot=drive`, shop live):

- GPS pin: 3-line layout (house / name / SLA); wider box + padding so name is not clipped
- Phone status: two lines (`Tap to call` / name); larger status chrome; stable padding + refit
- Welcome card: tightened height so title/hint are not floating in empty space
- How-to cards: shorter delivery copy; card height matched to content
- Toast / cog caption: more padding; toast cleared from cog column
- Score / clock: cream with a thick ink outline (no chip) — flat ink was unreadable on the dark drive/door backdrops
- Score pop: parked right of the score chip (it was crossing the `SCORE` caption)
- Buttons: label + caption are one vertically centred stack, not pinned to opposite edges
- Bag rack: was cream-on-cream (rendered blank) — now ink on the cream chip
- GPS pin: raised above the van/walker sprites, which were clipping it
- Walk-in bubbles: mirror to the customer's right and clamp on screen, clearing the lobby sandwich board
- Counter group (sign + score + clock): centred in the clean counter face, above the bottom shade band and painted edge
- How-to stack: lifted off dead centre so its tap hint clears the counter sign behind it
- Local type steps at +10% over the ramp: welcome copy, settings panel (`labelSize`/`captionSize` on `addHudButton`)
- ID card at +20% (`ID_*_PX` in `HudScene`): title/name/DOB/hint at 19.2/24/19.2/15.6px, card 560×320 → 672×384 with the flash ring and the four line offsets scaled to match, so the longest `UNDER 19` DOB and deny hint keep their old margins (`docs/qa-shots/type-id-card-*`)
- Wall-screen strain names to 24.2px (`TV_LABEL_PX`, +10% again): the widest generated name measures 230px against the 290px wrap width, so the `glassW - 16` / `slotH - 8` slot box needed no widening — all nine labels resolve at 24.2px, none shrunk
- Customer / driver action messages at +20% (`MSG_PX` in `ShopScene`): walk-in bubbles, counter prompt, key-lead callout and driver bubble at 19.2px with chip padding 10/6 → 12/7 (prompt 12/8 → 14/10) and boxes grown to 328×92 / 380×96 / 340×104 / 336×124 — the three-line `ready to leave` driver copy measures 305×94 and the bubbles still clear the sandwich board, the tablet label, and the screen edges (`docs/qa-shots/type-shop-*`)
- Door hours: nudged 4px left of the pane centre, under the mark's optical weight (was 6px; 2 design px ≈ 1 screen px at the ~1024px canvas, so the line reads a hair further right and still clearly off-centre — `docs/qa-shots/type-door-hours-*`)
- Packed bags: the per-order bag + chip row (up to 6 chips marching left over the key-lead) is now one pile with a `N DELIVERY · N PICKUP` chip plus a 6-row receipt rail on the counter face; rail rows are caption-size, `noWrap`, and the rail's left edge clears the HUD clock (shots in `docs/qa-shots/counter-ready-*`)

Canvas uses CSS `object-fit: fill` — non-uniform stretch can still make type look “squashed” on odd viewports; that is separate from design-space fit.

## Libraries

No new package. `@fontsource/inter` + Phaser Text + typekit.
