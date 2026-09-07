# Kindling promo captures

Capture these four stills (or a short GIF covering 1–3) for portfolio / itch / README. Landscape 16:9 preferred.

1. **Shop TVs** — Kindling cutaway with wall strain TVs lit, tablet or walk-in hint flashing.  
   _Captured:_ [`shop-howto.png`](promo/shop-howto.png), [`shop-welcome.png`](promo/shop-welcome.png)
2. **City map** — Driver van on the handmade streets with a GPS pin / house stop visible.  
   _Captured:_ [`city-map.png`](promo/city-map.png) (`?howto=0&shot=drive`)
3. **Door ID** — Porch handoff with the ID card modal (ASK ID → CHECK ID beat).  
   _Captured:_ [`door-id.png`](promo/door-id.png) (`?howto=0&shot=door`)
4. **Results card** — End-of-shift overlay with score breakdown, New day / Title buttons.  
   _Captured:_ [`results.png`](promo/results.png)

Also useful: night shop [`shop-night.png`](promo/shop-night.png). Full findings: [`audit-aesthetics-gameplay.md`](audit-aesthetics-gameplay.md).

Re-capture map/door:

```bash
npm run build && npx vite preview --host --port 4173
npx tsx scripts/promo-capture.ts
```
