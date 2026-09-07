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

## Visual QA notes (iterative)

Fixed from screenshots (`?howto=1`, `?shot=drive`, shop live):

- GPS pin: 3-line layout (house / name / SLA); wider box + padding so name is not clipped
- Phone status: two lines (`Tap to call` / name); larger status chrome; stable padding + refit
- Welcome card: tightened height so title/hint are not floating in empty space
- How-to cards: shorter delivery copy; card height matched to content
- Toast / cog caption: more padding; toast cleared from cog column
- Score / clock: consistent top inset

Canvas uses CSS `object-fit: fill` — non-uniform stretch can still make type look “squashed” on odd viewports; that is separate from design-space fit.

## Libraries

No new package. `@fontsource/inter` + Phaser Text + typekit.
