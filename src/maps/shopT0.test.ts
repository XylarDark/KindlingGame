import { describe, expect, it } from "vitest";
import { PERSON_W } from "../art/peopleSize";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import {
  BAG_PANEL,
  BAG_STACK,
  BENCH_LEFT,
  COUNTER_BAG_H,
  COUNTER_BAG_W,
  COUNTER_FRONT,
  COUNTER_RIGHT,
  COUNTER_TOP,
  CUSTOMER_BUBBLE_MIN_X,
  CUSTOMER_SPOT,
  customerBubbleY,
  customerSlotX,
  DOOR,
  DRIVER,
  KEYLEAD,
  PEOPLE_SCALE,
  PERSON_DISPLAY_W,
  PICKUP_BAG,
  READY_BAG,
  RECEIPT_SPOT,
  SILL_H,
  SILL_Y,
  WINDOW,
  WINDOW_LEFT_INSET,
  tabletLayout,
} from "./shopT0";

/**
 * The delivery glass has been widened twice, both times on the right edge only.
 * These guard the two things that must survive any further widening: the left
 * jamb and the seated driver.
 */
describe("delivery window", () => {
  const left = WINDOW.x - WINDOW.w / 2;
  const right = WINDOW.x + WINDOW.w / 2;
  /** The driver sits at the middle of the pre-growth glass, so mirroring him across
   * the left jamb reconstructs where the right jamb started. */
  const tapW = (DRIVER.x - left) * 2;
  const grown = right - (left + tapW);

  it("pins the left jamb and the driver while the right edge grows", () => {
    // Frozen: the left jamb has not moved since before the first right-side growth.
    expect(left).toBe(1525);
    expect(DRIVER.x).toBe(1686);
    // Whole-pixel edges — an odd total growth would land the jamb on a half pixel.
    expect(Number.isInteger(left)).toBe(true);
    expect(Number.isInteger(right)).toBe(true);
    // All of the growth went right: the glass mid moved by exactly half of it.
    expect(WINDOW.x - DRIVER.x).toBe(grown / 2);
    expect(grown).toBeGreaterThan(0);
  });

  it("has grown ~10% on the right across the two 5% steps", () => {
    expect(grown / tapW).toBeCloseTo(0.1, 2);
    // Driver stays inside the glass, off-centre to the left of the new mullion.
    expect(DRIVER.x).toBeGreaterThan(left);
    expect(DRIVER.x).toBeLessThan(WINDOW.x);
  });

  it("keeps the frame, jamb and sill clear of the screen edge", () => {
    const reveal = 8;
    const outermost = Math.max(right + reveal, right + 6);
    expect(left).toBeGreaterThanOrEqual(BENCH_LEFT);
    expect(right).toBeGreaterThan(BENCH_LEFT + WINDOW_LEFT_INSET);
    expect(outermost).toBeLessThan(GAME_WIDTH);
    // Painted wall still reads between the jamb and the edge of the screen.
    expect(GAME_WIDTH - outermost).toBeGreaterThanOrEqual(16);
  });
});

/**
 * Counter bags print their label on their own face, which needed a bigger bag.
 * Bags grow up from a bottom origin, so the sill above the counter is a hard
 * ceiling — these guard the clearances that let the bag grow wide, not tall.
 */
/**
 * Standing room on the shop floor. Every customer used to be sent to the one counter
 * spot, so a walk-in and a pickup waiting on a handoff drew inside each other — two
 * heads on one silhouette, with their speech chips stacked and unreadable.
 */
describe("customer standing slots", () => {
  const span = (index: number) => ({
    left: customerSlotX(index) - PERSON_DISPLAY_W / 2,
    right: customerSlotX(index) + PERSON_DISPLAY_W / 2,
  });

  it("puts the first arrival on the counter spot", () => {
    expect(customerSlotX(0)).toBe(CUSTOMER_SPOT.x);
  });

  it("never lets two customers share floor space", () => {
    // Nine is past anything the shop can produce — one walk-in is allowed at a time and
    // pickups leave in PICKUP_HANDOFF_WAIT_MS — so this is the rule, not the live case.
    const xs = Array.from({ length: 9 }, (_, i) => customerSlotX(i));
    expect(new Set(xs).size).toBe(xs.length);
    for (let a = 0; a < xs.length; a++) {
      for (let b = a + 1; b < xs.length; b++) {
        expect(Math.abs(xs[a]! - xs[b]!), `slots ${a} and ${b}`).toBeGreaterThanOrEqual(PERSON_DISPLAY_W);
      }
    }
  });

  it("queues back toward the door, so no slot is a longer walk than the counter", () => {
    // Load-bearing, not cosmetic: the NPC key lead's cover loop only starts on a
    // customer once they stop walking, and a shift's timing is tuned against that. A
    // ladder that fanned the queue outward made one slot a longer walk than the old
    // single spot and the counter started shedding people on a normal delivery run.
    for (let i = 1; i < 9; i++) {
      expect(customerSlotX(i), `slot ${i} is doorward of slot ${i - 1}`).toBeLessThan(customerSlotX(i - 1));
      expect(Math.abs(customerSlotX(i) - DOOR.x)).toBeLessThan(Math.abs(customerSlotX(0) - DOOR.x));
    }
  });

  it("alternates speech rows down the line", () => {
    for (let i = 1; i < 9; i++) {
      expect(customerBubbleY(i), `rows either side of slot ${i}`).not.toBe(customerBubbleY(i - 1));
    }
  });

  it("keeps the rows on screen and clear of the counter", () => {
    for (let i = 0; i < 9; i++) {
      const y = customerBubbleY(i);
      expect(y).toBeGreaterThan(COUNTER_FRONT);
      // The chip is centred on this y and its box caps at 92 tall.
      expect(y + 92 / 2).toBeLessThan(GAME_HEIGHT);
    }
  });

  it("holds four customers inside the clear lobby", () => {
    // Four is past the live maximum. The left bound is the sandwich board the bubbles
    // already had to clear; the right is the counter spot itself, so it cannot move.
    for (let i = 0; i < 4; i++) {
      expect(span(i).left, `slot ${i} clears the sandwich board`).toBeGreaterThan(CUSTOMER_BUBBLE_MIN_X - PERSON_DISPLAY_W);
      expect(span(i).right, `slot ${i} stays on screen`).toBeLessThan(GAME_WIDTH - 24);
    }
  });
});

describe("counter bags", () => {
  const bagTop = COUNTER_TOP - COUNTER_BAG_H;
  const span = (x: number) => ({ left: x - COUNTER_BAG_W / 2, right: x + COUNTER_BAG_W / 2 });
  /** The sill lip plus the drop shadow it casts down the wall. */
  const sillBottom = SILL_Y + SILL_H + 6;

  it("grows wide rather than tall, so the sill and tablet stay clear", () => {
    expect(bagTop).toBeGreaterThan(sillBottom);
    const tab = tabletLayout();
    expect(bagTop).toBeGreaterThan(tab.top + tab.h);
    // Width is the only axis with room, so that is where the label space came from.
    expect(COUNTER_BAG_W).toBeGreaterThan(COUNTER_BAG_H);
  });

  it("keeps the printed count band inside the bag face", () => {
    expect(BAG_PANEL.w).toBeLessThan(COUNTER_BAG_W);
    // Offsets are measured up from the bottom-centre origin.
    expect(BAG_PANEL.countCy - BAG_PANEL.countH / 2).toBeGreaterThan(-COUNTER_BAG_H);
    expect(BAG_PANEL.countCy + BAG_PANEL.countH / 2).toBeLessThan(0);
  });

  it("parks the supply bag between the key lead and the ready pile", () => {
    const supply = span(BAG_STACK.x);
    expect(supply.left).toBeGreaterThan(KEYLEAD.x + (PERSON_W * PEOPLE_SCALE) / 2);
    expect(supply.right).toBeLessThan(span(READY_BAG.x).left);
  });

  it("stands the pickup bag behind the pile without hiding its label or the slips", () => {
    const ready = span(READY_BAG.x);
    const pickup = span(PICKUP_BAG.x);
    expect(pickup.left).toBeGreaterThan(ready.left);
    // The delivery bag overlaps the pickup bag's edge but not its printed panel.
    expect(pickup.left + (COUNTER_BAG_W - BAG_PANEL.w) / 2).toBeGreaterThanOrEqual(ready.right);
    // Both stay on the counter, short of the slip printer at its end.
    expect(pickup.right).toBeLessThan(RECEIPT_SPOT.x - 24);
    expect(pickup.right).toBeLessThan(COUNTER_RIGHT);
  });
});
