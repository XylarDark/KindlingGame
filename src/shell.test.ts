import { describe, expect, it, vi } from "vitest";
import {
  applyCanvasDisplayScale,
  canRequestFullscreen,
  chromeCoachCopy,
  isPortraitPhone,
  isStandaloneDisplay,
  shouldShowChromeCoach,
  tryEnterFullscreen,
  tryLockLandscape,
} from "./shell";
import { GAME_HEIGHT, GAME_WIDTH } from "./sim/constants";

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

describe("applyCanvasDisplayScale", () => {
  it("maps CSS canvas size onto Phaser displayScale in 1920×1080 space", () => {
    const displayScale = {
      x: 1,
      y: 1,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };
    const game = {
      canvas: { clientWidth: 844, clientHeight: 390 },
      scale: {
        canvasBounds: { width: 844, height: 390 },
        displayScale,
        updateBounds() {},
      },
    };
    applyCanvasDisplayScale(game as never);
    expect(displayScale.x).toBeCloseTo(GAME_WIDTH / 844);
    expect(displayScale.y).toBeCloseTo(GAME_HEIGHT / 390);
  });
});

describe("fullscreen helpers", () => {
  it("detects requestFullscreen support", () => {
    expect(
      canRequestFullscreen({
        fullscreenEnabled: true,
        documentElement: { requestFullscreen: async () => undefined },
      }),
    ).toBe(true);
    expect(canRequestFullscreen({ fullscreenEnabled: false, documentElement: {} })).toBe(false);
  });

  it("calls requestFullscreen when available", () => {
    const requestFullscreen = vi.fn().mockResolvedValue(undefined);
    expect(tryEnterFullscreen({ requestFullscreen })).toBe(true);
    expect(requestFullscreen).toHaveBeenCalled();
  });

  it("shows the chrome coach only for touch browsers that are not already fullscreen", () => {
    expect(
      shouldShowChromeCoach({
        standalone: false,
        fullscreenElement: null,
        dismissed: false,
        coarsePointer: true,
      }),
    ).toBe(true);
    expect(
      shouldShowChromeCoach({
        standalone: true,
        fullscreenElement: null,
        dismissed: false,
        coarsePointer: true,
      }),
    ).toBe(false);
  });

  it("uses install copy when fullscreen API is missing", () => {
    expect(chromeCoachCopy(false).action).toBe("Got it");
    expect(chromeCoachCopy(true).action).toBe("Go fullscreen");
  });
});
