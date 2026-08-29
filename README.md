# Kindling (T0)

A 2D pixel-art cannabis shop + delivery game for **mobile browsers** and desktop. You play the **key-lead** in a side-cutaway of Kindling, then **hit the road** as the driver on a handmade city map.

## Run

```bash
npm install
npm test
npm run dev
```

Open the printed local URL on desktop or your phone (same Wi-Fi). `npm run build` typechecks and emits `dist/` for any static host.

## Controls

Shop (click / tap):
- Tap the **budtender**, then **BAGS**, then a **strain jar**, then the **bag on the counter**
- Wrong jar: tap the right strain (it goes to your hand) and tap the bag again
- **Tablet** shows pickup and delivery tickets; delivery bags get the customer name
- In-store customers use the same counter

Drive:
- **Move:** WASD / arrows / on-screen pad
- **Interact:** E / Space / INTERACT at the GPS pin
- **Hit the road / Back to shop:** HUD button after a delivery bag is labeled

## Loops

- **In-store:** customer at the counter → bag + matching strain → sold
- **Pickup:** tablet ticket → bag + strain → wait → customer arrives → tap them or INTERACT
- **Delivery:** tablet ticket → bag + strain (name prints on the bag) → HIT THE ROAD → GPS → Interact at the pin

1 game hour = 60 real seconds. Late deliveries still complete but lose points. While you drive, an NPC key-lead keeps working the shop.

## T0 playtest

1. Desktop: complete one in-store sale and one pickup.
2. Bag two nearby deliveries (houses 1 and 2), wait for the second, hit the road, deliver both on time.
3. Wait out a delivery SLA (~60s after bin) and confirm the score drops on handoff.
4. Phone or Chrome device mode: same loop with the virtual pad; buttons stay on the bottom/right.

Placeholder pixels only. City maps stay handmade at T0.
