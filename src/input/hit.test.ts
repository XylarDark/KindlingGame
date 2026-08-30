import { describe, expect, it } from "vitest";
import { itemHitRect, itemHitSize } from "./hitRect";

describe("item hitboxes", () => {
  it("uses texture-space (0,0,w,h) so Phaser origin + scale stay aligned", () => {
    const rect = itemHitRect(192, 352);
    expect(rect).toEqual({ x: 0, y: 0, width: 192, height: 352 });
    expect(rect.x <= 96 && 96 < rect.x + rect.width).toBe(true);
    expect(rect.x <= -1 && -1 < rect.x + rect.width).toBe(false);
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
