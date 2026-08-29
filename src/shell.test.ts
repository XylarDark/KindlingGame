import { describe, expect, it, vi } from "vitest";
import { isPortraitPhone, isStandaloneDisplay, tryLockLandscape } from "./shell";

describe("isPortraitPhone", () => {
  it("asks a phone in portrait to rotate", () => {
    expect(isPortraitPhone(390, 844, true)).toBe(true);
  });

  it("asks an Android phone in portrait to rotate", () => {
    expect(isPortraitPhone(360, 800, true)).toBe(true);
    expect(isPortraitPhone(412, 915, true)).toBe(true);
  });

  it("lets a phone in landscape play", () => {
    expect(isPortraitPhone(844, 390, true)).toBe(false);
    expect(isPortraitPhone(800, 360, true)).toBe(false);
  });

  it("does not cover a mouse-driven desktop window", () => {
    expect(isPortraitPhone(900, 1400, false)).toBe(false);
  });
});

describe("tryLockLandscape", () => {
  it("attempts lock when the Screen Orientation API exists", () => {
    const lock = vi.fn().mockResolvedValue(undefined);
    expect(tryLockLandscape({ lock })).toBe(true);
    expect(lock).toHaveBeenCalledWith("landscape");
  });

  it("does nothing when lock is unavailable", () => {
    expect(tryLockLandscape(undefined)).toBe(false);
    expect(tryLockLandscape({} as Pick<ScreenOrientation, "lock">)).toBe(false);
  });
});

describe("isStandaloneDisplay", () => {
  it("detects standalone display-mode", () => {
    expect(isStandaloneDisplay((query) => ({ matches: query.includes("standalone") }))).toBe(true);
  });

  it("detects iOS navigator.standalone", () => {
    expect(isStandaloneDisplay(() => ({ matches: false }), true)).toBe(true);
  });

  it("is false in a normal browser tab", () => {
    expect(isStandaloneDisplay(() => ({ matches: false }), false)).toBe(false);
  });
});
