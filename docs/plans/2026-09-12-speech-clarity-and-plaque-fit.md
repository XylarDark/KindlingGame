# Speech clarity and plaque fit

**Date:** 2026-09-12  
**Base:** `master` @ `2581452` (#69 Step 1 copy de-dupe merged)

## Goal

Short speech copy should wear a short plaque. `maxWidth` / wordWrap is a **ceiling**, not the default measured width. Even pad around real glyphs — no empty right/bottom slab from wrap-box inflation.

## Steps

### Step 1 — Copy de-dupe ✅ Implemented (#69)

One speaker owns one fact. Key-lead holding lines drop redundant “Tap the customer”; customer bubble is just `Tap me` when the lead already holds the same SKU.

### Step 2 — Plaque hugs ink ✅ Implemented (this PR)

**Outcome:** After Phaser measures text (possibly with wordWrap), size the 9-slice from **tight ink** (longest line / drawn stack height), not full `text.width` / `text.height` when those equal a wrap or clip ceiling.

**Approach:** `signTextInk.ts` adds `tightInkLayout`, `measureInkWidth`, and `measureInkHeight` (mirroring Phaser `GetTextSize`). `layoutPlaque` shrinks via `applyTightInkBox` when reported bounds exceed measured ink, then centres the nine-slice on the ink AABB midpoint. All sign chips benefit; pad variants unchanged.

### Step 3 — Re-pin to real plaque height ✅ Implemented

**Outcome:** Speech centers use measured `signPlaqueExtents` / `signPlaqueMid` after tight-ink sizing (#70), not the stale `CUSTOMER_SPEECH_H` (83) wrap ceiling.

**Approach:** `layoutCustomerSpeech` accepts per-customer `h` from synced plaques. `ShopScene.syncCustomers` sets copy and syncs before layout; layout key includes rounded panel height. Key-lead and driver bubbles re-pin when plaque height changes, not only on copy change. Customer feedback stacks via `speechPlaqueAboveHead` from the order bubble's plaque bottom.

## Locks

- Plaque-center API (#66) stays valid
- No layout throws; four TypeRoles; less-is-more

## Verification

- `npm run verify` green
- Shop stills: short `Holding …` / `Tap me` plaques look tight (before/after in PR)
