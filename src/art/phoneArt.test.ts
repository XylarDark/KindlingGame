import { describe, expect, it } from "vitest";
import {
  cellMargins,
  designRectOffset,
  PHONE_APP_CELLS,
  PHONE_CELLS,
  PHONE_CHASSIS_CELLS,
  PHONE_GLASS_CELLS,
  PHONE_HOME_CELLS,
  PHONE_ISLAND_CELLS,
  PHONE_PX,
  PHONE_SCALE,
  PHONE_STATUS_CELLS,
  PHONE_TEX,
  phoneDesignRect,
  type CellRect,
} from "./phoneArt";

const contains = (outer: CellRect, inner: CellRect): boolean =>
  inner.x >= outer.x &&
  inner.y >= outer.y &&
  inner.x + inner.w <= outer.x + outer.w &&
  inner.y + inner.h <= outer.y + outer.h;

describe("phone art grid", () => {
  it("sizes the canvas from the cell grid so nothing can be clipped", () => {
    expect(PHONE_TEX.w).toBe(PHONE_CELLS.w * PHONE_PX);
    expect(PHONE_TEX.h).toBe(PHONE_CELLS.h * PHONE_PX);
  });

  it("keeps every drawn feature inside the canvas", () => {
    const canvas: CellRect = { x: 0, y: 0, w: PHONE_CELLS.w, h: PHONE_CELLS.h };
    for (const cell of [
      PHONE_CHASSIS_CELLS,
      PHONE_GLASS_CELLS,
      PHONE_STATUS_CELLS,
      PHONE_APP_CELLS,
      PHONE_HOME_CELLS,
      PHONE_ISLAND_CELLS,
    ]) {
      expect(contains(canvas, cell)).toBe(true);
    }
  });

  it("leaves the side-button margin equal on both sides, and top equal to bottom", () => {
    const m = cellMargins(PHONE_CHASSIS_CELLS);
    expect(m.left).toBe(m.right);
    expect(m.top).toBe(m.bottom);
    // The margin has to exist, or the buttons get clipped the way they used to.
    expect(m.left).toBeGreaterThan(0);
  });

  it("centres the chassis in the texture, with no nudge factor", () => {
    const offset = designRectOffset(phoneDesignRect(PHONE_CHASSIS_CELLS));
    expect(offset.x).toBe(0);
    expect(offset.y).toBe(0);
  });

  it("centres the glass on the chassis", () => {
    const glass = designRectOffset(phoneDesignRect(PHONE_GLASS_CELLS));
    expect(glass.x).toBe(0);
    expect(glass.y).toBe(0);
  });

  it("nests glass inside chassis and app inside glass", () => {
    expect(contains(PHONE_CHASSIS_CELLS, PHONE_GLASS_CELLS)).toBe(true);
    expect(contains(PHONE_GLASS_CELLS, PHONE_APP_CELLS)).toBe(true);
    expect(contains(PHONE_GLASS_CELLS, PHONE_STATUS_CELLS)).toBe(true);
    expect(contains(PHONE_GLASS_CELLS, PHONE_HOME_CELLS)).toBe(true);
  });

  it("gives the app the glass minus the status bar and the home indicator", () => {
    expect(PHONE_STATUS_CELLS.h + PHONE_APP_CELLS.h + PHONE_HOME_CELLS.h).toBe(PHONE_GLASS_CELLS.h);
    expect(PHONE_APP_CELLS.y).toBe(PHONE_STATUS_CELLS.y + PHONE_STATUS_CELLS.h);
    expect(PHONE_HOME_CELLS.y).toBe(PHONE_APP_CELLS.y + PHONE_APP_CELLS.h);
  });

  it("keeps the app clear of the baked status bar", () => {
    const status = phoneDesignRect(PHONE_STATUS_CELLS);
    const app = phoneDesignRect(PHONE_APP_CELLS);
    expect(app.y).toBeGreaterThanOrEqual(status.y + status.h);
  });

  it("lands the chassis on the 280x336 it was specced to", () => {
    const chassis = phoneDesignRect(PHONE_CHASSIS_CELLS, PHONE_SCALE);
    expect(chassis.w).toBe(280);
    expect(chassis.h).toBe(336);
  });

  it("centres the dynamic island on the glass", () => {
    const glass = phoneDesignRect(PHONE_GLASS_CELLS);
    const island = phoneDesignRect(PHONE_ISLAND_CELLS);
    expect(island.x + island.w / 2).toBeCloseTo(glass.x + glass.w / 2, 6);
  });

  it("scales every rect from one factor", () => {
    const a = phoneDesignRect(PHONE_GLASS_CELLS, 1);
    const b = phoneDesignRect(PHONE_GLASS_CELLS, 2);
    expect(b.w).toBe(a.w * 2);
    expect(b.h).toBe(a.h * 2);
    expect(b.x).toBe(a.x * 2);
    expect(b.y).toBe(a.y * 2);
  });
});
