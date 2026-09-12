# Plaque placement harness

**Date:** 2026-09-12  
**Modules:** `src/ui/plaquePlacement.ts` (pure contract), `src/ui/plaquePlacementPhaser.ts` (scene adapters)  
**Tests:** `src/ui/plaquePlacement.test.ts`

## What this is

A small geometry contract for sign-chip placement. Scenes still own copy and visibility; tests assert that landed plaque AABBs stay inside named bands (above head, head↔TV, top-center) using `signPlaqueExtents`-shaped data.

See also [2026-09-12-text-position-contract.md](./2026-09-12-text-position-contract.md) for the product pin rules.

## Run the placement tests

```bash
npm test -- src/ui/plaquePlacement.test.ts
npm run verify
```

The suite covers:

| Case | Band | Seed / source |
|------|------|----------------|
| Key-lead speech | `inHeadTvBand` at KEYLEAD slot | `?capture=shop-lead` sim seed + slot head top |
| Customer order | `aboveHead` | `?capture=shop-counter` + `layoutCustomerSpeech` |
| Door prompt | `topCenter` | DoorScene constants |
| HUD toast | `topCenter` | HudScene `SCREEN_CHIP_MARGIN` math |

**TODO:** When the door orange-status always-on chip lands, add a `topCenter` assertion in `plaquePlacement.test.ts` (search for the TODO comment).

## Contract helpers

```ts
import {
  aboveHead,
  inHeadTvBandPlaque,
  topCenter,
  overlapsObstacle,
  assertPlacement,
  plaqueAabbFromCenter,
} from "../ui/plaquePlacement";
```

- **`aboveHead(aabb, headTopY, gap)`** — plaque bottom ≤ headTop − gap  
- **`inHeadTvBandPlaque(aabb, headTop, tvBottom, gap)`** — plaque fully inside the vertical band  
- **`topCenter(aabb, viewW, insetTop, margin)`** — center X ≈ viewW/2, top ≥ inset + margin  
- **`overlapsObstacle(aabb, faceOrTv, maxOverlapPx²)`** — fail when overlap exceeds tolerance  

Pure placement math (no Phaser):

- `speechPlaqueCenterAboveHead(plaque, centerX, headTopY, gap)`  
- `leadSpeechPlaqueCenterFromExtents(plaque, centerX, headTopY, tvBottomY, gap)`  

Phaser adapters used by scenes: `speechPlaqueAboveHead`, `leadSpeechPlaqueCenter`, `modelHeadTop`, `spriteBodyAabb`.

## Add a new chip band

1. **Name the band** — add a small factory if useful (see `aboveHeadBand`, `inHeadTvBand` in `plaquePlacement.ts`).
2. **Export or reuse placement math** — prefer pure functions that take `ChipPlaqueExtents` so tests need no canvas.
3. **Pin geometry in `plaquePlacement.test.ts`** — build a representative `mockSpeechPlaque(w, h)`, compute preferred center, derive AABB with `plaqueAabbFromCenter`, call `assertPlacement(...)`.
4. **Optional capture seed** — if the chip is visible in a `?capture=` or `?shot=` seed, tick the sim in the test the way `promoShot.test.ts` does.
5. **On-device overlay** — wire `?layoutDebug=1` in the owning scene (Shop/Door pattern: `layoutDebugGfx` + `paintLayoutDebug`).

## Playtest overlay

Load the game with:

```
http://127.0.0.1:5174/?layoutDebug=1
```

Optional capture seeds for shop bands:

```
?layoutDebug=1&capture=shop-lead
?layoutDebug=1&capture=shop-counter
```

Blue bands = target regions; yellow/green = landed plaque AABBs. Persists in `localStorage` as `kindlingLayoutDebug=1` (same pattern as the feel meter).
