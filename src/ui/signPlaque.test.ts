import { describe, expect, it } from "vitest";
import { Pal } from "../art/palette";
import {
  SIGN_BORDER,
  SIGN_BORDER_W,
  SIGN_EDGE,
  SIGN_EDGE_W,
  SIGN_FIELD,
  SIGN_FRAME_W,
  signPlaqueRings,
} from "./signPlaque";

describe("sign plaque", () => {
  it("reuses the counter plaque palette rather than a look-alike green", () => {
    expect(SIGN_EDGE).toBe(Pal.leafDark);
    expect(SIGN_BORDER).toBe(Pal.leaf);
    expect(SIGN_FIELD).toBe(0xffffff);
    expect(SIGN_FRAME_W).toBe(SIGN_EDGE_W + SIGN_BORDER_W);
  });

  it("returns the field last so each ring paints over the middle of the one before", () => {
    const rings = signPlaqueRings({ x: 100, y: 200, w: 300, h: 60 });

    expect(rings.map((ring) => ring.color)).toEqual([SIGN_EDGE, SIGN_BORDER, SIGN_FIELD]);
    expect(rings[2]).toEqual({ x: 100, y: 200, w: 300, h: 60, color: SIGN_FIELD });
  });

  it("grows an even frame on all four sides of the field", () => {
    const field = { x: 100, y: 200, w: 300, h: 60 };
    const [edge, border] = signPlaqueRings(field);

    expect(field.x - edge.x).toBe(SIGN_FRAME_W);
    expect(field.y - edge.y).toBe(SIGN_FRAME_W);
    expect(edge.x + edge.w - (field.x + field.w)).toBe(SIGN_FRAME_W);
    expect(edge.y + edge.h - (field.y + field.h)).toBe(SIGN_FRAME_W);
    // The visible dark ring is the gap between the two frame rects.
    expect(border.x - edge.x).toBe(SIGN_EDGE_W);
    expect(border.y - edge.y).toBe(SIGN_EDGE_W);
  });

  it("snaps fractional text bounds to whole pixels so the frame cannot shimmer", () => {
    const rings = signPlaqueRings({ x: 100.4, y: 200.6, w: 300.5, h: 60.2 });

    for (const ring of rings) {
      expect(Number.isInteger(ring.x)).toBe(true);
      expect(Number.isInteger(ring.y)).toBe(true);
      expect(Number.isInteger(ring.w)).toBe(true);
      expect(Number.isInteger(ring.h)).toBe(true);
    }
  });
});
