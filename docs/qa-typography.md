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

`fitTypeToBox` clamp-fits fonts into a floor–ceiling interval (never bitmap-scales) so type can grow toward a CSS cap when the box has slack. Wrap width subtracts padding + a letter-spacing gutter. Multi-line labels skip caps tracking so wrap math stays honest. `refitType` after mid-frame padding/chrome changes.

`noWrap: true` keeps authored line breaks and shrinks to fit width instead of re-wrapping. Use it for labels whose line structure is meaningful (door hours, phone title/status, GPS pin), so `9 AM – 11 PM` can never split into `9 AM – 11` / `PM`.

## Automated layout harness

`import.meta.env.DEV` exposes `globalThis.kindlingGame`. In DevTools, walk every visible `Text` in the running scenes and flag three classes of defect:

- **overflow** — measured `width`/`height` beyond the object's `typekitBox`
- **tiny** — resolved size under 12px
- **overlap** — intersecting bounds, *after* converting each scene's bounds to screen space with `(x - cam.scrollX) * cam.zoom`

That camera step matters: comparing the scrolling map's world coords against screen-space HUD reports false overlaps. Audit at **zoom 1 only** — the HUD renders at zoom 1 whatever the shop camera is doing, so a zoomed inspection pass reports HUD-over-world collisions that do not exist. Read the fit box with `text.getData("typekitBox")`, not as a property: a harness that reads `text.typekitBox` gets `undefined` and silently reports zero overflow. Sampling on a 250 ms interval for 20–40 s catches transient collisions from walk-ins, score pops, and phone state changes that single frames miss.

Result: shop, drive, door, settings, and results all sample clean. The only remaining reported intersections are map house numbers behind the opaque phone panel and cog chip, where the HUD fully occludes the world text.

Re-run after the ID / wall-screen / message size bump (2026-09-07): 130 samples of live shop, 120 of `?shot=drive`, 40 of `?shot=door` — no overflow, nothing under 12px, and no overlaps beyond the documented house-number-behind-phone case. Force-spawning several walk-ins at once does report stacked bubbles, but every customer walks the same path to `CUSTOMER_SPOT.x`, so those chips are exactly co-located at any font size; natural play only ever has one walk-in.

## Visual QA notes (iterative)

Fixed from screenshots (`?howto=1`, `?shot=drive`, shop live). Shots are QA scratch — captured, checked, not kept in-repo; `docs/promo/` holds the curated stills.

- GPS pin: 3-line layout (house / name / SLA), `noWrap`; wider box + padding so the name is not clipped; raised to depth 13, above the van/walker sprites that were clipping it
- Phone status: two lines (`Tap to call` / name); larger status chrome; stable padding + refit
- Phone status band, and the size it was quietly not rendering: the two-line caption measures **64px** tall, and the band it had to fit was 58px, so `fitTypeToBox` had been shrinking it to ~18px for an unknown period while `PHONE_STATUS_PX` read 20px. The phone is now 15% larger (`PHONE_SCALE` 1.75 → 2.0125, chassis 280×336 → 322×386.4) and the app chrome heights — which were typed in as `34` / `58` / `4` under a header comment claiming every phone dimension derived from `PHONE_SCALE` — are stated in cells, so the band is 4 cells = 64.4px and the caption measures its authored **20px** live. It is the tightest box on the phone and carries a comment saying so; do not take height out of it without re-measuring. Full forensics in [KNOWN_ERRORS](KNOWN_ERRORS.md)
- Welcome card: title/hint at 36.3/21.8px (`WELCOME_*_SIZE` in `TitleScene`) — well over the ramp, it is the first thing read; card height 216 so they are not floating in empty space
- How-to cards: shorter delivery copy; card height matched to content
- Toast / cog caption: more padding; toast cleared from cog column
- Cog caption at **22.5px** on a constant of its own (`HUD_COG_CAPTION_PX` in `HudScene`, 25% over `HUD_CAPTION_PX`). Its own deliberately: `HUD_CAPTION_PX` is the `SCORE` caption's step as well, so raising the shared one would have resized a readout nobody asked about — `SCORE` still measures 18px. The box is derived from the step rather than typed (44px, for a 22.5px line plus the chip's 6px padding), because the old 36px box could not hold 22.5px type and `fitTypeToBox` would have rendered ~19px under a constant claiming 22.5. Measured live: 22.5px, chip 114×40, centred on the cog's own centre at x1830 — an expression both the creation site and `layoutHud` compute the same way
- Cog caption hides while the settings panel is open. The panel is anchored to the same corner and closes over the caption's top 16px, and the chip is the higher depth, so it clipped the panel's bottom corner; it also labels nothing while the panel says `SETTINGS` across its own head. Visibility is the whole mechanism on purpose — Phaser will not hit-test what it would not render, so the caption cannot take a click from under the panel either. The cog is never covered and remains the way out; verified in-browser that the caption's coordinates go dead with the panel up, that the cog closes it, and that the caption returns clickable at its own corners afterwards
- Score / clock: cream with a thick ink outline (no chip) — flat ink was unreadable on the dark drive/door backdrops
- Score pop: parked outboard of the score value — left of it at the counter sign, right of it in the corner fallback (it was crossing the `SCORE` caption)
- Buttons: label + caption are one vertically centred stack, not pinned to opposite edges
- Bag supply: the floating chip above the rack is gone. `BAGS` is baked into the bag texture (`stampText` → `tex-bag-bags`), and the next-action prompt swaps the whole sprite to `tex-bag-pack` (`TAP TO\nPACK`) so the words pulse and tint with the bag instead of needing their alpha held separately
- Walk-in bubbles: mirror to the customer's right and clamp on screen, clearing the lobby sandwich board
- Counter group (sign + score + clock): centred in the clean counter face, above the bottom shade band and painted edge
- How-to stack: lifted off dead centre so its tap hint clears the counter sign behind it
- Settings panel at +10% over the ramp (`SET_*_PX` in `HudScene`, reaching the buttons via `labelSize`/`captionSize` on `addHudButton`) — read at arm's length
- ID card at +20% (`ID_*_PX` in `HudScene`): title/name/DOB/hint at 19.2/24/19.2/15.6px, card 560×320 → 672×384 with the flash ring and the four line offsets scaled to match, so the longest `UNDER 19` DOB and deny hint keep their old margins
- Wall-screen strain names to 24.2px (`TV_LABEL_PX`, +21% over the heading step — two +10% steps): the widest generated name measures 230px against the 290px wrap width, so the `glassW - 16` / `slotH - 8` slot box needed no widening — all nine labels resolve at 24.2px, none shrunk
- Shop tablet `ORDERS` renders at **33px against a 44px seed, and that is deliberate — it is not the bug it looks like.** The label is specified as "the same size as the score", so it seeds from `HUD_SCORE_PX` by import rather than a copied number, and the intent tracks the score even though the fit reduces it. **The binding constraint is width, not height:** 135px of glyphs against a 136px box inside a 144px tablet screen, with the height box barely half used. Everything cheap has already been spent buying that 33px — the box is the screen minus a 4px hairline (was 8 a side, which cost 2px of type), and caps tracking is off because it spent 8% of the width on the gaps between six letters. Reaching the score's 44px needs a wider tablet: `TABLET_W` 176 → ~205 in `maps/shopT0`, which was considered and declined. So a future reader finding 33 under a seed of 44 has found the intended outcome; check the measured glyph width before raising the seed, because raising it alone changes nothing
- `ORDERS` against the counter readouts is pinned by `scenes/counterLayout.test.ts` for **any** score rather than the score on screen. A readout's declared `maxWidth` is a hard cap on its footprint however many digits it gains, and the score is anchored to the counter sign with origin `(1, 0.5)` so digits grow leftward, away from the tablet. Worst case leaves 480px horizontally and 48px vertically, the tight edge being the score pop rising 56px out of the value. Phaser cannot be imported in the node test env (`window is not defined`), so the test reads both scenes as source with CRLF normalised, throws on any missing marker, and asserts both boxes are non-degenerate before comparing them
- Customer / driver action messages at +20% (`MSG_PX` in `ShopScene`): walk-in bubbles, counter prompt, key-lead callout and driver bubble at 19.2px with chip padding 10/6 → 12/7 (prompt 12/8 → 14/10) and boxes grown to 328×92 / 380×96 / 340×104 / 336×124 — the three-line `ready to leave` driver copy measures 305×94 and the bubbles still clear the sandwich board, the tablet label, and the screen edges
- Door hours: nudged 4px left of the pane centre (`HOURS_NUDGE_X`), under the mark's optical weight; was 6px, and 2 design px ≈ 1 screen px at the ~1024px canvas, so the line reads a hair further right and still clearly off-centre
- Bag audit re-run (2026-09-07, zoom 1): 1 / 6 / 12 packed bags — 22, 28 and 30 visible texts, every one carrying a fit box, no overflow, nothing under 12px, no overlaps. Both counts hold the full 27px unshrunk (18×33 in the 72×34 box), and the 12-bag case has the same footprint as the 6-bag one
- Packed bags: the per-order bag + chip row (up to 6 chips marching left over the key-lead) is gone. One delivery bag and one pickup bag now stand on the counter, each printing its live count on its own baked label panel (`BAG_PANEL`, title-size, `noWrap`), and a 6-row receipt rail carries the per-order detail on the counter face. Rail rows are caption-size, `noWrap`, one line each, oldest ticket at the top; a 7th packed bag collapses the tail into `+N more`. Measured live at six slips: rail box left edge 1236 against a clock ending at 1207, so the rail clears the HUD clock

Canvas uses CSS `object-fit: contain` — the shell sizes a 16:9 stage; leftover width is Kindling side rails.

## Libraries

No new package. `@fontsource/inter` + Phaser Text + typekit.
