import { describe, expect, it } from "vitest";
import { HIT_PAD_SCALE, itemHitRect, itemHitSize } from "./hitRect";

describe("item hitboxes", () => {
  it("pads texture-space ~10% so Phaser origin + scale stay aligned", () => {
    const rect = itemHitRect(192, 352);
    expect(rect.width).toBeCloseTo(192 * HIT_PAD_SCALE);
    expect(rect.height).toBeCloseTo(352 * HIT_PAD_SCALE);
    expect(rect.x).toBeCloseTo((192 - rect.width) / 2);
    expect(rect.y).toBeCloseTo((352 - rect.height) / 2);
    const midX = 96;
    const midY = 176;
    expect(rect.x <= midX && midX < rect.x + rect.width).toBe(true);
    expect(rect.y <= midY && midY < rect.y + rect.height).toBe(true);
  });

  it("can skip padding when padScale is 1", () => {
    expect(itemHitRect(192, 352, 1)).toEqual({ x: 0, y: 0, width: 192, height: 352 });
  });

  it("reads frame size when width is missing so displaySize still hits", () => {
    expect(itemHitSize({ frame: { realWidth: 320, realHeight: 240 } })).toEqual({
      width: 320,
      height: 240,
    });
    expect(itemHitSize({ width: 96, height: 120, frame: { realWidth: 1, realHeight: 1 } })).toEqual({
      width: 96,
      height: 120,
    });
  });
});
