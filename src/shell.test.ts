import { describe, expect, it, vi } from "vitest";
import {
  applyCanvasDisplayScale,
  isPhoneLikeViewport,
  isPortraitPhone,
  isStandaloneDisplay,
  tryLockLandscape,
} from "./shell";
import { containStage, pickPhoneStageFitMode } from "./ui/viewFit";
import { GAME_HEIGHT, GAME_WIDTH } from "./sim/constants";

describe("isPhoneLikeViewport", () => {
  it("treats coarse pointer as phone-like", () => {
    expect(isPhoneLikeViewport(1920, 1080, true)).toBe(true);
  });

  it("treats 844×390 landscape as phone-like without coarse (Chrome device toolbar)", () => {
    expect(isPhoneLikeViewport(844, 390, false)).toBe(true);
  });

  it("does not treat a desktop IDE pane as phone-like", () => {
    expect(isPhoneLikeViewport(1268, 971, false)).toBe(false);
  });

  it("width-fills wide phone landscape with zero side rails when coarse is absent", () => {
    const mode = pickPhoneStageFitMode({ width: 844, height: 390 });
    expect(mode).toBe("width-fill");
    const packed = containStage({ width: 844, height: 390 }, undefined, mode);
    expect(packed.railLeft).toBe(0);
    expect(packed.railRight).toBe(0);
    expect(packed.stage.width).toBe(844);
  });
});

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

  it("gates narrow portrait even when Chrome omits (pointer: coarse)", () => {
    expect(isPortraitPhone(390, 844, false)).toBe(true);
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
  it("maps CSS canvas size onto Phaser displayScale using the live backbuffer", () => {
    const displayScale = {
      x: 1,
      y: 1,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };
    // Width-fill 844×390 viewport → 844×475 stage (16:9); full design buffer.
    const stageH = Math.round((844 * GAME_HEIGHT) / GAME_WIDTH);
    const game = {
      canvas: { clientWidth: 844, clientHeight: stageH },
      scale: {
        canvasBounds: { width: 844, height: stageH },
        gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT },
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        displayScale,
        updateBounds() {},
      },
    };
    applyCanvasDisplayScale(game as never);
    expect(displayScale.x).toBeCloseTo(GAME_WIDTH / 844);
    expect(displayScale.y).toBeCloseTo(GAME_HEIGHT / stageH);
    expect(displayScale.x).toBeCloseTo(displayScale.y, 1);
  });

  it("uses a shrunk RenderBudget backbuffer for pointer mapping", () => {
    const displayScale = {
      x: 1,
      y: 1,
      set(x: number, y: number) {
        this.x = x;
        this.y = y;
      },
    };
    const bw = Math.round(GAME_WIDTH * 0.7);
    const bh = Math.round(GAME_HEIGHT * 0.7);
    const game = {
      canvas: { clientWidth: 844, clientHeight: 390 },
      scale: {
        canvasBounds: { width: 844, height: 390 },
        gameSize: { width: bw, height: bh },
        width: bw,
        height: bh,
        displayScale,
        updateBounds() {},
      },
    };
    applyCanvasDisplayScale(game as never);
    expect(displayScale.x).toBeCloseTo(bw / 844);
    expect(displayScale.y).toBeCloseTo(bh / 390);
  });
});
