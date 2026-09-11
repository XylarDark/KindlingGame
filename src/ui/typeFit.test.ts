import { describe, expect, it } from "vitest";
import { canReuseFitSize, clampFitSize, fitsBox, typeFitRange } from "./typeFit";

describe("typeFitRange", () => {
  it("uses the authored seed as the ceiling when no CSS cap is higher", () => {
    expect(typeFitRange({ basePx: 20, minPx: 10 })).toEqual({ floor: 10, ceiling: 20 });
  });

  it("raises the floor to the CSS readability contract", () => {
    expect(typeFitRange({ basePx: 16, minPx: 10, cssFloor: 39 })).toEqual({ floor: 39, ceiling: 39 });
  });

  it("raises the ceiling so type can grow toward a CSS cap", () => {
    expect(typeFitRange({ basePx: 16, minPx: 10, cssFloor: 14, cssCeiling: 56 })).toEqual({
      floor: 14,
      ceiling: 56,
    });
  });

  it("never lets the ceiling sit below the floor", () => {
    expect(typeFitRange({ basePx: 8, minPx: 12, cssCeiling: 10 }).ceiling).toBe(12);
  });
});

describe("fitsBox", () => {
  it("treats missing edges as unconstrained", () => {
    expect(fitsBox({ width: 400, height: 80 }, {})).toBe(true);
    expect(fitsBox({ width: 400, height: 80 }, { width: 200 })).toBe(false);
    expect(fitsBox({ width: 100, height: 80 }, { height: 40 })).toBe(false);
  });
});

describe("canReuseFitSize", () => {
  const widthOf = (factor: number) => (px: number) => ({ width: px * factor, height: px });
  const box = { width: 160, height: 80 };

  it("reuses when last size still fits and the ceiling does not", () => {
    const measure = widthOf(10);
    expect(canReuseFitSize(measure, 16, 24, box)).toBe(true);
  });

  it("refits when last size overflows the box", () => {
    const measure = widthOf(10);
    expect(canReuseFitSize(measure, 20, 24, box)).toBe(false);
  });

  it("refits when the ceiling still fits so type can grow", () => {
    const measure = widthOf(4);
    expect(canReuseFitSize(measure, 16, 24, box)).toBe(false);
  });
});

describe("clampFitSize", () => {
  const widthOf = (factor: number) => (px: number) => ({ width: px * factor, height: px });

  it("grows to the ceiling when the box has slack", () => {
    const result = clampFitSize(widthOf(4), 10, 24, { width: 200, height: 80 });
    expect(result).toEqual({ size: 24, overflow: false, clip: false });
  });

  it("picks the largest size that still fits, which can be above the old seed", () => {
    // 18px seed would have been the old shrink-from-base ceiling; 22 still fits.
    const result = clampFitSize(widthOf(5), 12, 28, { width: 110, height: 80 });
    expect(result.overflow).toBe(false);
    expect(result.size).toBe(22);
    expect(result.size).toBeGreaterThan(18);
  });

  it("shrinks from the ceiling when copy is too wide", () => {
    const result = clampFitSize(widthOf(8), 10, 40, { width: 160 });
    expect(result).toEqual({ size: 20, overflow: false, clip: false });
  });

  it("drops below the floor rather than drawing outside the box", () => {
    const result = clampFitSize(widthOf(10), 20, 28, { width: 150 });
    expect(result.size).toBe(15);
    expect(result.overflow).toBe(true);
    expect(result.clip).toBe(false);
  });

  it("asks the caller to clip when even 1px sticks out", () => {
    const result = clampFitSize(() => ({ width: 400, height: 80 }), 10, 20, { width: 40 });
    expect(result.overflow).toBe(true);
    expect(result.clip).toBe(true);
    expect(result.size).toBe(10);
  });

  it("returns the ceiling when the box is unconstrained", () => {
    expect(clampFitSize(widthOf(99), 10, 18, {})).toEqual({ size: 18, overflow: false, clip: false });
  });
});
