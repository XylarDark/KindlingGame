import { describe, expect, it, beforeEach } from "vitest";
import {
  applyRenderBudgetToGame,
  forceRenderBudget,
  getRenderBudget,
  initRenderBudget,
  pickRenderTier,
  resetRenderBudgetForTests,
  tickRenderBudget,
} from "./renderBudget";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";

describe("pickRenderTier", () => {
  it("demotes high when FPS sags, and keeps coarse devices off high until healthy", () => {
    expect(pickRenderTier({ coarsePointer: false, actualFps: 60, prev: "high" })).toBe("high");
    expect(pickRenderTier({ coarsePointer: false, actualFps: 35, prev: "high" })).toBe("mid");
    expect(pickRenderTier({ coarsePointer: true, actualFps: 45, prev: "high" })).toBe("mid");
    expect(pickRenderTier({ coarsePointer: true, actualFps: 35, prev: "high" })).toBe("low");
  });

  it("demotes high sooner on drive/door than in shop", () => {
    expect(pickRenderTier({ coarsePointer: false, actualFps: 46, prev: "high", heavyScene: false })).toBe("high");
    expect(pickRenderTier({ coarsePointer: false, actualFps: 46, prev: "high", heavyScene: true })).toBe("mid");
    expect(pickRenderTier({ coarsePointer: false, actualFps: 50, prev: "mid", heavyScene: true })).toBe("mid");
  });

  it("uses hysteresis between mid and low", () => {
    expect(pickRenderTier({ coarsePointer: false, actualFps: 28, prev: "mid" })).toBe("low");
    expect(pickRenderTier({ coarsePointer: false, actualFps: 42, prev: "low" })).toBe("mid");
    expect(pickRenderTier({ coarsePointer: false, actualFps: 50, prev: "mid" })).toBe("high");
  });
});

describe("init / tickRenderBudget", () => {
  beforeEach(() => resetRenderBudgetForTests());

  it("seeds mid on coarse pointer with PostFX off and full design scale", () => {
    expect(initRenderBudget(true).tier).toBe("mid");
    expect(getRenderBudget().postFx).toBe(false);
    expect(getRenderBudget().maxLights).toBe(0);
    expect(getRenderBudget().renderScale).toBe(1);
  });

  it("high tier keeps PostFX on with ~16ms uniform upload throttle", () => {
    expect(initRenderBudget(false).tier).toBe("high");
    expect(getRenderBudget().postFx).toBe(true);
    expect(getRenderBudget().uploadMinMs).toBe(16);
    expect(getRenderBudget().maxLights).toBe(8);
  });

  it("low tier turns PostFX off without shrinking the canvas", () => {
    initRenderBudget(false);
    // Mild sag: two consecutive samples per step (above SEVERE_DEMOTE_FPS).
    expect(tickRenderBudget(35, 2_000)).toBe(false);
    expect(getRenderBudget().tier).toBe("high");
    expect(tickRenderBudget(35, 3_100)).toBe(true);
    expect(getRenderBudget().tier).toBe("mid");
    expect(tickRenderBudget(28, 4_200)).toBe(false);
    expect(getRenderBudget().tier).toBe("mid");
    expect(tickRenderBudget(28, 5_300)).toBe(true);
    expect(getRenderBudget().tier).toBe("low");
    expect(getRenderBudget().postFx).toBe(false);
    expect(getRenderBudget().renderScale).toBe(1);
  });

  it("demotes on one strike when FPS is severely collapsed", () => {
    initRenderBudget(false);
    expect(tickRenderBudget(22, 2_000)).toBe(true);
    expect(getRenderBudget().tier).toBe("mid");
  });
});

describe("applyRenderBudgetToGame", () => {
  beforeEach(() => resetRenderBudgetForTests());

  it("restores design 1920×1080 if a prior build left a shrunk buffer", () => {
    const resizeCalls: Array<[number, number]> = [];
    const game = {
      scale: {
        gameSize: { width: 1440, height: 810 },
        width: 1440,
        height: 810,
        resize: (w: number, h: number) => resizeCalls.push([w, h]),
      },
    };
    applyRenderBudgetToGame(game as unknown as Phaser.Game);
    expect(resizeCalls).toEqual([[GAME_WIDTH, GAME_HEIGHT]]);
  });

  it("does not resize when already at design size", () => {
    const resizeCalls: Array<[number, number]> = [];
    const game = {
      scale: {
        gameSize: { width: GAME_WIDTH, height: GAME_HEIGHT },
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
        resize: (w: number, h: number) => resizeCalls.push([w, h]),
      },
    };
    forceRenderBudget("low");
    applyRenderBudgetToGame(game as unknown as Phaser.Game);
    expect(resizeCalls).toEqual([]);
  });
});
