# Kindling (T0)

A 2D pixel-art cannabis shop + delivery game for **iPhone, iPad, Android, and desktop** browsers. You play the **key-lead** in a side-cutaway of Kindling, then **hit the road** as the driver on a handmade city map.

## Play

Public build: **https://xylardark.github.io/KindlingGame/**

On a phone, turn it **sideways**. For a full-screen app:

- **iPhone / iPad:** Safari → Share → Add to Home Screen
- **Android Chrome:** menu → Add to Home screen / Install app
- **Samsung Internet:** menu → Add page to → Home screen

Pushes to `master` publish that link through GitHub Pages.

## Run locally

```bash
npm install
npm test
npm run dev
```

Open the printed local URL on desktop or your phone (same Wi-Fi). `npm run build` typechecks and emits `dist/` for any static host. `npm run preview` serves that production build.

## Controls

Shop (tap / click):
- Tablet → strain TV → bag. Packed deliveries sit on the counter.
- Walk-ins: tap that TV, then the customer. No bag.
- **HIT THE ROAD** takes every packed delivery

Drive:
- **Move:** WASD / arrows / on-screen pad
- **Call** from the curb, then photo → check ID → hand the bag at the door
- **Hit the road / Back to shop:** HUD button

## Loops

- **In-store:** customer at the counter → matching strain → sold
- **Pickup:** tablet ticket → bag + strain → wait → customer arrives → tap them
- **Delivery:** tablet ticket → bag + strain → HIT THE ROAD → GPS → call → door

1 game hour = 2 real minutes of clock (2s per game minute). Late deliveries still complete but lose points. While you drive, an NPC key-lead keeps working the shop.

Placeholder pixels only. City maps stay handmade at T0.
