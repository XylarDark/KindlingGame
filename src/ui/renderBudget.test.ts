import { describe, expect, it, beforeEach } from "vitest";
import {
  applyRenderScale,
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

  it("uses hysteresis between mid and low", () => {
    expect(pickRenderTier({ coarsePointer: false, actualFps: 28, prev: "mid" })).toBe("low");
    expect(pickRenderTier({ coarsePointer: false, actualFps: 42, prev: "low" })).toBe("mid");
    expect(pickRenderTier({ coarsePointer: false, actualFps: 50, prev: "mid" })).toBe("high");
  });
});

describe("init / tickRenderBudget", () => {
  beforeEach(() => resetRenderBudgetForTests());

  it("seeds mid on coarse pointer", () => {
    expect(initRenderBudget(true).tier).toBe("mid");
    expect(getRenderBudget().postFx).toBe(false);
    expect(getRenderBudget().maxLights).toBe(0);
    expect(getRenderBudget().renderScale).toBeCloseTo(0.75);
  });

  it("low tier turns PostFX off", () => {
    initRenderBudget(false);
    // Demotion is sticky: two consecutive low samples per step.
    expect(tickRenderBudget(20, 2_000)).toBe(false);
    expect(getRenderBudget().tier).toBe("high");
    expect(tickRenderBudget(20, 3_100)).toBe(true);
    expect(getRenderBudget().tier).toBe("mid");
    expect(tickRenderBudget(20, 4_200)).toBe(false);
    expect(getRenderBudget().tier).toBe("mid");
    expect(tickRenderBudget(20, 5_300)).toBe(true);
    expect(getRenderBudget().tier).toBe("low");
    expect(getRenderBudget().postFx).toBe(false);
    expect(getRenderBudget().renderScale).toBeCloseTo(0.6);
  });
});

describe("applyRenderScale", () => {
  beforeEach(() => resetRenderBudgetForTests());

  it("resizes the backbuffer and zooms design-space cameras", () => {
    const resizeCalls: Array<[number, number]> = [];
    const shopCam = {
      zoom: 1,
      centered: false,
      setZoom(z: number) {
        this.zoom = z;
      },
      centerOn() {
        this.centered = true;
      },
    };
    const driveCam = {
      zoom: 1,
      centered: false,
      setZoom(z: number) {
        this.zoom = z;
      },
      centerOn() {
        this.centered = true;
      },
    };
    const game = {
      scale: {
        resize: (w: number, h: number) => resizeCalls.push([w, h]),
      },
      scene: {
        getScenes: () => [
          { sys: { settings: { key: "shop" } }, cameras: { main: shopCam } },
          { sys: { settings: { key: "drive" } }, cameras: { main: driveCam } },
        ],
      },
    };
    applyRenderScale(game as unknown as Phaser.Game, 0.75);
    expect(resizeCalls[0]).toEqual([Math.round(GAME_WIDTH * 0.75), Math.round(GAME_HEIGHT * 0.75)]);
    expect(shopCam.zoom).toBe(0.75);
    expect(shopCam.centered).toBe(true);
    expect(driveCam.zoom).toBe(0.75);
    expect(driveCam.centered).toBe(false);
  });
});
