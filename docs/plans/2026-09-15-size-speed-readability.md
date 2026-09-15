# Size / speed / readability — phased plan

**Purpose:** freeze “what good looks like” before any perf or type refactors. Phase 0 (this document + [perf baseline](../operational/perf-baseline-phase0.md)) records meters, inventories, and gate status only — no gameplay or perf fix code unless a gate is already broken (then flag Phase 1, do not fix in Phase 0).

**Read with:** [smooth-2d-runtime.md](../guides/smooth-2d-runtime.md), [KNOWN_ERRORS.md](../KNOWN_ERRORS.md) (Phase 0 baseline section).

---

## Constraints that stay true (do not change in later phases without explicit promotion)

| Area | Contract |
|------|----------|
| **Sim clock** | Default **`smooth`** (`kindlingClock.resolveClockMode()`). Sim `frameMs` = Phaser scene **`delta`** only — not RAF `rawDelta`. Opt-in: `?clock=fixedRaw`. |
| **Phone render** | **30 FPS** (`fps.target` + `limit`), seed tier **mid** `renderScale` **0.85**, PostFX **off**, **`sessionTierLocked`** — no mid-session `scale.resize` on coarse. |
| **Typography** | Inter canvas text, ink-on-white, leaf **9-slice** plaques, **four type roles** (`hudTitle`, `hudBody`, `hudSmall`, `speech`) + baked `TYPE_INTRO` on Title. |
| **Layout** | No `layoutPlaque` **throw** on ink failure (skip instead). No adaptive **0.45 / 0.32** renderScale. No Android-specific rewrite. |
| **Proof tools** | `?meter=1` (or `localStorage kindlingMeter=1`), **`resize× === 0`** after boot on phone, `npx tsx scripts/agent-shot.ts --lane N`, `npm run typecheck`, existing Vitest guards. |

Design layout stays **1920×1080** (`GAME_WIDTH` × `GAME_HEIGHT`). Only the WebGL backbuffer shrinks via `renderScale`; HUD scene uses camera zoom **1** and lays out in live backbuffer pixels.

---

## Phase order (later PRs follow this — no arguing from feelings)

| Phase | Focus | Exit gate (summary) |
|-------|--------|---------------------|
| **0 — Baseline** | Meter checklist, bake/Text inventory, gate confirm | This doc + [perf-baseline-phase0.md](../operational/perf-baseline-phase0.md); tests green |
| **1 — Correctness** | Title/HUD leak, dropoff skip, start-click regressions | Sim + source guards green; capture on affected flows |
| **2 — Type** | Clamp-fit / setText / plaque pump cost on interaction | p95 frame ms on tap strain ≤ baseline + no layout throw |
| **3 — VRAM** | RT count × tier, bake cell sizing, texture upload spikes | Meter + memory heuristics on Shop/Drive/Door |
| **4 — Boot** | `#loading-gate` wall time, warm path, first-show hitches | Boot capture + perfProbe first-show counts |
| **5 — Atlas (optional)** | Batch binds, offline compressed formats | Only if Phase 3–4 still show bind/upload cliffs |
| **6 — Scans** | Source-scan / audit harness extensions | New guards for whatever Phase 1–5 touched |

Phases **1–6 are out of scope** until Phase 0 baseline is merged.

---

## Related shipped work (context, not re-litigated here)

- PR **#29** — session tier lock (`sessionTierLocked`)
- PR **#32** — fixed-step + interpolation + feel meter
- PR **#42** — dropoff step gate + drive/door sign chrome
- PR **#60** — four role type tokens (`typeScale.ts`)

See [2026-09-10-responsive-smooth-product.md](2026-09-10-responsive-smooth-product.md) for the earlier smooth-runtime roadmap (partially superseded by density-first mid **0.85**).
