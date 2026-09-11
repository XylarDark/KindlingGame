# Text chrome recovery — PR A (rails + sign contract + Settings centering)

**Date:** 2026-09-11  
**Base:** `master` @ `9ac1def`

## Product decisions

- **Restore green KINDLING side rails** (removed in #48; Luke wants them back).
- Drive SCORE changes deferred to **PR B**.

## PR A scope

### 1) Restore rails

Restore from pre-#48 (`44c4f4c`):

- `index.html`: `.kindling-rail` CSS, `#rail-left` / `#rail-right`
- `src/shell.ts`: `layoutRails` + call from `installMobileShell` for coarse height-fill
- `src/config.test.ts`: expect rails present; leaf `#3d6a44` on rails; sky OS chrome

Coarse phones: height-fill with branded rails. Fine pointer: contain, rails hidden when no leftover width.

### 2) Freeze sign text contract

In `src/ui/signText.ts` (+ tests):

- Keep #53: patched `setPosition` moves **host only** (never zero glyph locals).
- Glyph bounds → plaque; text AABB ⊆ plaque AABB (pad tolerance) — **failing tests** if empty box or top-clipped ink.
- `syncChildScrollFactors` on host only.
- Short comment at top of `signText` stating the contract (standard UI: ink inside panel).

### 3) Settings optical centering

Fix Settings caption so it looks centered in its plaque (shot showed top-heavy). Origin `(0.5, 0.5)` with `signYAbove` / `signPlaqueExtents` for cog-relative layout at mid/low RenderBudget HUD viewport. Keep #52 `cogHit` + scroll `(0,0)` HUD camera.

## Out of scope (later PRs)

- **PR B:** COUNTER Drive SCORE
- **PR C:** ID header
- **PR D:** drive pin size / menu boards
- SCORE visibility policy, BitmapText, lint

## Verify

- `npm run typecheck` + `npm test`
- Captures: phone-ish height-fill with rails; Settings caption centered; shop SCORE still OK
