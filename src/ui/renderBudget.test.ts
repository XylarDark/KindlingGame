import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  applyRenderBudgetToGame,
  applyRenderScale,
  forceRenderBudget,
  getRenderBudget,
  initRenderBudget,
  isSessionTierLocked,
  pickRenderTier,
  resetRenderBudgetForTests,
  syncSceneRenderCamera,
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
    expect(pickRenderTier({ coarsePointer: false, actualFps: 55, prev: "low" })).toBe("mid");
    expect(pickRenderTier({ coarsePointer: false, actualFps: 50, prev: "mid" })).toBe("high");
  });
});

describe("tier → scale / effects mapping", () => {
  beforeEach(() => resetRenderBudgetForTests());

  it("maps high / mid / low to documented renderScale and PostFX policy", () => {
    expect(forceRenderBudget("high")).toMatchObject({
      tier: "high",
      renderScale: 1,
      postFx: true,
      postFxScale: 0.5,
      maxLights: 8,
      uploadMinMs: 16,
    });
    expect(forceRenderBudget("mid")).toMatchObject({
      tier: "mid",
      renderScale: 0.85,
      postFxScale: 0.5,
      postFx: false,
      maxLights: 0,
      uploadMinMs: 100,
    });
    expect(forceRenderBudget("low")).toMatchObject({
      tier: "low",
      renderScale: 0.65,
      postFxScale: 0.5,
      postFx: false,
      maxLights: 0,
      uploadMinMs: 200,
    });
  });
});

describe("init / tickRenderBudget", () => {
  beforeEach(() => resetRenderBudgetForTests());

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds mid on coarse pointer with PostFX off and mid renderScale", () => {
    expect(initRenderBudget(true).tier).toBe("mid");
    expect(getRenderBudget().postFx).toBe(false);
    expect(getRenderBudget().maxLights).toBe(0);
    expect(getRenderBudget().renderScale).toBeCloseTo(0.85);
    expect(isSessionTierLocked()).toBe(true);
  });

  it("locks coarse tier for the session — no mid-session resize storms", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("coarse"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    initRenderBudget(true);
    expect(tickRenderBudget(20, 2_000)).toBe(false);
    expect(getRenderBudget().tier).toBe("mid");
    expect(tickRenderBudget(20, 3_100)).toBe(false);
    expect(getRenderBudget().tier).toBe("mid");
  });

  it("high tier keeps PostFX on with ~16ms uniform upload throttle", () => {
    expect(initRenderBudget(false).tier).toBe("high");
    expect(getRenderBudget().postFx).toBe(true);
    expect(getRenderBudget().uploadMinMs).toBe(16);
    expect(isSessionTierLocked()).toBe(false);
  });

  it("desktop demotes with two strikes and promotes after cooldown", () => {
    initRenderBudget(false);
    expect(tickRenderBudget(35, 2_000)).toBe(false);
    expect(tickRenderBudget(35, 3_100)).toBe(true);
    expect(getRenderBudget().tier).toBe("mid");
    expect(tickRenderBudget(28, 4_200)).toBe(false);
    expect(tickRenderBudget(28, 5_300)).toBe(true);
    expect(getRenderBudget().tier).toBe("low");
    expect(tickRenderBudget(55, 6_400)).toBe(false);
    expect(tickRenderBudget(55, 18_000)).toBe(true);
    expect(getRenderBudget().tier).toBe("mid");
  });

  it("demotes on one strike when FPS is severely collapsed", () => {
    initRenderBudget(false);
    expect(tickRenderBudget(22, 2_000)).toBe(true);
    expect(getRenderBudget().tier).toBe("mid");
  });
});

describe("applyRenderScale / applyRenderBudgetToGame", () => {
  beforeEach(() => resetRenderBudgetForTests());

  it("resizes the backbuffer and zooms world scenes; HUD stays at zoom 1", () => {
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
    const hudCam = {
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
          { sys: { settings: { key: "hud" } }, cameras: { main: hudCam } },
          { sys: { settings: { key: "drive" } }, cameras: { main: driveCam } },
        ],
      },
    };
    applyRenderScale(game as unknown as Phaser.Game, 0.85);
    expect(resizeCalls[0]).toEqual([Math.round(GAME_WIDTH * 0.85), Math.round(GAME_HEIGHT * 0.85)]);
    expect(shopCam.zoom).toBe(0.85);
    expect(hudCam.zoom).toBe(1);
    expect(driveCam.centered).toBe(false);
  });

  it("skips resize when scale is unchanged but still re-zooms scenes", () => {
    const resizeCalls: Array<[number, number]> = [];
    const shopCam = {
      zoom: 1,
      setZoom(z: number) {
        this.zoom = z;
      },
      centerOn() {},
    };
    const game = {
      scale: {
        resize: (w: number, h: number) => resizeCalls.push([w, h]),
      },
      scene: {
        getScenes: () => [{ sys: { settings: { key: "shop" } }, cameras: { main: shopCam } }],
      },
    };
    applyRenderScale(game as unknown as Phaser.Game, 0.65);
    resizeCalls.length = 0;
    applyRenderScale(game as unknown as Phaser.Game, 0.65);
    expect(resizeCalls).toEqual([]);
    expect(shopCam.zoom).toBe(0.65);
  });
});
