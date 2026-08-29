import { describe, expect, it } from "vitest";
import { capsTracking, isAllCaps, overlayStroke, parseFontPx, typeResolution } from "./typeMetrics";

describe("typeResolution", () => {
  it("never drops below 2x even on a small FIT canvas", () => {
    expect(typeResolution({ dpr: 1, fit: 0.4, objectScale: 1 })).toBe(2);
  });

  it("scales with device pixel ratio and FIT zoom", () => {
    expect(typeResolution({ dpr: 2, fit: 1, objectScale: 1 })).toBe(4);
    expect(typeResolution({ dpr: 2, fit: 2, objectScale: 1 })).toBe(8);
  });

  it("raises resolution when the text object itself is scaled up", () => {
    const base = typeResolution({ dpr: 1, fit: 1, objectScale: 1 });
    const scaled = typeResolution({ dpr: 1, fit: 1, objectScale: 2 });
    expect(scaled).toBeGreaterThan(base);
    expect(scaled).toBeLessThanOrEqual(8);
  });

  it("caps at 8 so 64px display type does not allocate huge canvases", () => {
    expect(typeResolution({ dpr: 3, fit: 3, objectScale: 4 })).toBe(8);
  });
});

describe("parseFontPx", () => {
  it("reads theme-style px strings and numbers", () => {
    expect(parseFontPx("22px")).toBe(22);
    expect(parseFontPx(18)).toBe(18);
    expect(parseFontPx(undefined)).toBe(18);
  });
});

describe("caps tracking", () => {
  it("opens all-caps marks and leaves sentence case alone", () => {
    expect(isAllCaps("KINDLING")).toBe(true);
    expect(isAllCaps("SCORE")).toBe(true);
    expect(isAllCaps("Open\n9 AM – 11 PM")).toBe(false);
    expect(isAllCaps("Welcome to Kindling")).toBe(false);
    expect(capsTracking(24)).toBe(2);
    expect(capsTracking(48)).toBe(4);
  });
});

describe("overlayStroke", () => {
  it("keeps a hairline, not a 4px blob", () => {
    expect(overlayStroke(20).strokeThickness).toBeLessThanOrEqual(2);
    expect(overlayStroke(15).strokeThickness).toBeGreaterThanOrEqual(1);
  });
});
