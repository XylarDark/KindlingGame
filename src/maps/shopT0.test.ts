import { describe, expect, it } from "vitest";
import { PERSON_W } from "../art/peopleSize";
import { GAME_WIDTH } from "../sim/constants";
import {
  BAG_PANEL,
  BAG_STACK,
  BENCH_LEFT,
  COUNTER_BAG_H,
  COUNTER_BAG_W,
  COUNTER_RIGHT,
  COUNTER_TOP,
  DRIVER,
  KEYLEAD,
  PEOPLE_SCALE,
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
