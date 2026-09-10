# RawDelta readiness — moved

This topic is **Phase 5** of the responsive + smooth product plan, not a standalone product goal.

**Canonical doc:** [2026-09-10-responsive-smooth-product.md](2026-09-10-responsive-smooth-product.md) — Phases 0–5; **Phase 5** documents the `fixedRaw` ship decision and `?clock=smooth` fallback.

**Implementation (PR #32):** not a bare rawDelta flip — [`kindlingClock.ts`](../../src/sim/kindlingClock.ts) runs 60 Hz fixed steps from `game.loop.rawDelta` with Drive render interpolation. Default mode **`fixedRaw`**; revert with `?clock=smooth`.

**Guide pointer:** [guides/smooth-2d-runtime.md](../guides/smooth-2d-runtime.md) — **RawDelta readiness** section.

**Diagnose:** `?meter=1` — fps, frame ms, p95-ish rolling, fixed-step backlog, tier, resize count.
