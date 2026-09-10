# Coarse overdraw + demotion cuts (2026-09-10)

Follow-up to [density-first budget](2026-09-10-density-first-budget.md) — Luke: installed PWA still laggy at mid **0.85** / low **0.65**.

**Goal:** frame-time wins without soft-pixel scales, PostFX on phones, smoothed delta, or new atlas packs.

## Landed (this PR)

| Cut | Where | Effect |
|-----|-------|--------|
| Coarse demotion | `renderBudget.ts` | mid→low @ **36fps** Drive/Door, **32fps** shop; one-strike demote on coarse; **rawDelta ≥48ms** hitch demote |
| `phoneFxQuality()` | `renderBudget.ts` → Drive/Door/art | **lite** (mid): smaller lamp pools, no outer window halos, thinner lot stroke; **minimal** (low): lamps only, no house/shop window fills, lot glow off |
| Traffic cap | `trafficVisualMax()` | mid **10**, low **8** sprites (was 12) |
| Tier-change invalidation | Drive lot glow, Door nightFx | FX tier flip repaints without waiting for sky key |

## Residual

- Shop live sky `paintOutside` bands at night (window RT is empty; exterior pane still repaints on `skyVisualDirtyKey`).
- Drive **lite** still paints per-house window rects when on-screen — acceptable until device proof says otherwise.
- No rawDelta in `pickRenderTier` itself — hitch only accelerates demotion strikes in `tickRenderBudget`.
- ASTC/ETC texture packs still deferred.

## Verify

`npx vitest run`, `npx tsc --noEmit`. Installed-phone Drive/Door feel is the success gate (capture optional in shaping).
