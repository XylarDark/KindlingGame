---
title: "Mobile Text Readability - Plan"
type: feat
date: 2026-09-09
topic: mobile-text-readability
artifact_contract: ce-unified-plan/v1
artifact_readiness: requirements-only
product_contract_source: ce-brainstorm
execution: code
---

# Mobile Text Readability - Plan

## Goal Capsule

- **Objective:** Make Kindling’s in-game type readable on small phone landscape (including installed PWA) under the existing 16:9 contain shell, by enforcing on-screen CSS floors and tiered treatment for message chips, HUD chrome, and TV/menu text — without another blind global type bump or a full HUD redesign.
- **Product authority:** Confirmed brainstorm strategy (Luke asked to plan mobile text readability; pain-point ranking was skipped, so first-slice scope covers message chips, HUD chrome, and TV/menu text with tiered budgets).
- **Open blockers:** None.

---

## Product Contract

### Summary

After 16:9 CSS contain, small phones shrink design-px type below readable floors. Encode a readability contract (message chips ≥ ~14 CSS px, HUD labels ≥ ~12), apply a mobile type ramp (`MOBILE_TEXT_SCALE` atop existing `MSG_SCALE`) only when stage scale / coarse pointer / narrow viewport warrants it, keep separate budgets per surface tier, and pair size with contrast and shorter mobile copy. Verify on small phone landscape + PWA with layout tests for the floors.

### Problem Frame

The shell sizes `#game-root` with uniform 16:9 contain (`src/config.ts`, `src/shell.ts`, `src/ui/viewFit.ts`). On a small landscape phone the stage scale compresses design pixels, so even the recent message `MSG_SCALE = 1.25` pass (`src/ui/theme.ts`, Shop/Door/Title consumers) can land below comfortable on-screen CSS size. Theme comments already call out aspirational mobile HUD floors that conflict with fixed containers under fill/stretch history; `fitTypeToBox` only shrinks and never bitmap-scales (`src/ui/typekit.ts`). QA notes document caption/status shrink, low-contrast score/clock outlines on dark drive/door backdrops, and that physical phone testing has lagged audits. A second blind global +25% would fight fixed chip boxes and chrome layout without addressing contrast or copy length.

### Key Decisions

- **Readability is measured in on-screen CSS px after 16:9 contain**, not design-px constants alone. Floors: message chips ≥ ~14 CSS px; HUD labels ≥ ~12 CSS px. *(session-settled: product strategy — chosen over another design-only bump.)* Governs R1, R2, R10.
- **Tiered surfaces, not one global knob:** separate budgets and treatments for (1) message chips / speech / feedback, (2) HUD chrome labels, (3) TV boards / menu / settings type. *(session-settled: product strategy — pain ranking skipped, all three in first-slice scope with differentiated treatment.)* Governs R3–R6.
- **Mobile type ramp:** when stage scale is below a threshold (and/or coarse pointer / narrow viewport), apply `MOBILE_TEXT_SCALE` atop `MSG_SCALE`; `fitTypeToBox` floors must honor the contract instead of shrinking past it into illegibility. *(session-settled: product strategy — chosen over abandoning contain or redesigning the whole HUD.)* Governs R4, R5, R7.
- **Contrast + copy accompany size:** thicker strokes, more chip padding, fewer low-contrast fills; shorten mobile strings where layout cannot grow. *(session-settled: product strategy.)* Governs R8, R9.
- **Keep 16:9 contain and current shell model** for this pass; no whole-HUD redesign and no another blind global +25%. *(session-settled: out-of-slice boundaries.)* Governs Scope Boundaries.

### Requirements

**Readability contract**

- R1. After 16:9 contain, active message-chip body type renders at ≥ ~14 CSS px on the smallest intended phone landscape playtest size (including standalone / PWA display mode).
- R2. After 16:9 contain, primary HUD chrome labels render at ≥ ~12 CSS px under the same conditions as R1.
- R3. TV board, menu, and settings type each have an explicit tier budget (design and/or mobile-scaled) documented beside the chip and HUD budgets — not a single shared multiplier for all surfaces.

**Mobile type ramp**

- R4. When stage scale is below the agreed threshold, or when coarse pointer / narrow viewport detection indicates a mobile play context, apply `MOBILE_TEXT_SCALE` atop existing `MSG_SCALE` for message-tier surfaces (chips, speech, door/title prompts that already use `scaleMsgPx`).
- R5. HUD chrome and TV/menu tiers receive their own mobile adjustments (may share detection, must not be forced through message-only `MSG_SCALE` alone).
- R6. Desktop / large-stage play remains within existing readable ranges; the mobile ramp must not oversize type on large contained stages.
- R7. `fitTypeToBox` (and any equivalent shrink-to-fit path) must not reduce type below the R1/R2 floors for in-scope surfaces; when content cannot fit, prefer copy shortening (R9), padding/box growth within tier budget, or layout clamp — not silent sub-floor shrink.

**Contrast and copy**

- R8. Contrast pass for in-scope text: thicker strokes / outlines where flat ink fails on dark backdrops, increased chip padding where type grew, and fewer low-contrast fills on message chips and primary HUD labels.
- R9. Where a fixed or nearly fixed box cannot grow enough for the floor, mobile copy is shortened (or line-broken deliberately) so the floor still holds — no reliance on unreadably small type to preserve long strings.

**Verification**

- R10. Layout or view-fit tests assert the CSS-px floors (or equivalent stage-scale × design-px proxies) for representative message-chip and HUD-label samples at a small-phone landscape stage scale.
- R11. Manual verify on small phone landscape and installed PWA (standalone): chips, HUD labels, and at least one TV/menu/settings surface remain legible without abandoning landscape contain.

### Success Criteria

- On the smallest intended phone landscape + PWA, message chips and HUD labels meet the ~14 / ~12 CSS-px floors after contain.
- Tier budgets are visible in code/docs (chips vs HUD vs TV/menu) rather than one global scale.
- Contrast and padding improvements make score/clock/chip text readable on dark drive/door/shop backdrops without relying on size alone.
- Automated floor checks exist for the contract; no regression that reintroduces sub-floor shrink-only behavior for in-scope surfaces.
- Desktop / large-stage layout does not become oversized or broken by the mobile ramp.

### Scope Boundaries

**In scope**

- Message chips / speech / feedback type (Shop, Door, Title prompts already on `scaleMsg*` paths, plus related chip chrome).
- HUD chrome labels (score, clock, ORDERS-adjacent chrome, settings type steps as needed for floors).
- TV board / menu / settings tier budgets and mobile treatment.
- Mobile detection hook (stage scale threshold and/or coarse pointer / narrow viewport).
- Contrast, padding, and mobile copy shortening tied to the floors.
- Layout tests and small-phone landscape + PWA verification.

**Deferred for later**

- Whole HUD redesign or information-architecture rewrite.
- Per-device font packs or user-facing “text size” settings preference.
- Drive-mode / doorstep messaging ownership redesign (separate from size/contrast floors).
- Re-registering or redesigning the service worker / install coach beyond what already exists for PWA display mode.

**Outside this pass**

- Abandoning 16:9 contain or switching shell sizing model.
- Another blind global +25% (or similar) on all type without tiering or CSS-px floors.
- Changing game rules, scoring, or spawn rates.
- Full ORDERS tablet / TV content redesign beyond readability of existing board type.

### Outstanding Questions

**Deferred to Planning**

- Exact stage-scale (and/or viewport / pointer) threshold that turns on `MOBILE_TEXT_SCALE`.
- Numeric value of `MOBILE_TEXT_SCALE` and per-tier budgets that satisfy R1–R3 without clipping fixed boxes.
- Which strings get mobile-shortened copy first (candidate list from Shop/Door/Title/HUD).
- Whether settings / TV board type shares detection with message chips or uses a slightly different ramp curve.
- Canonical “smallest intended phone landscape” reference size for R10/R11 (device or CSS viewport + DPR proxy).

### Sources

- Shell / contain / view-fit: `src/shell.ts`, `src/config.ts`, `src/ui/viewFit.ts`, `index.html`, `public/manifest.webmanifest`.
- Type ramp and message scale: `src/ui/theme.ts` (`MSG_SCALE`, `scaleMsgPx` / `scaleMsgPad` / `scaleMsgBox`, aspirational mobile floors), `src/ui/typekit.ts` (`fitTypeToBox`).
- Consumers: `src/scenes/ShopScene.ts`, `src/maps/shopT0.ts`, `src/scenes/DoorScene.ts`, `src/scenes/TitleScene.ts`, HUD/settings type in `src/scenes/HudScene.ts`.
- Prior QA / audit: `docs/qa-typography.md`, `docs/KNOWN_ERRORS.md`, `docs/audit-aesthetics-gameplay.md`.
- Related plan cross-ref: `docs/plans/2026-09-09-001-feat-shop-messaging-reflow-plan.md` (R8 smallest-16:9 readable).
- Brainstorm grounding (scout extraction): `/tmp/compound-engineering-1000/ce-brainstorm/fullscreen-mobile-text-20260909/grounding.md` (session artifact; cite repo paths above for durable Sources).
