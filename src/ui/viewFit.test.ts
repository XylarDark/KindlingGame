import { describe, expect, it, vi } from "vitest";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import {
  GAME_ASPECT,
  HUD_TOUCH_MIN_DESIGN,
  MIN_CSS_TOUCH_PX,
  POPULAR_MOBILE_LANDSCAPE,
  RAIL_MIN_CSS_PX,
  clientToGame,
  containStage,
  stageContainScale,
  getStageContainScale,
  setStageContainScale,
  cssPxFromDesign,
  cssPxToDesign,
  designSafeInset,
  displayScale,
  fillsParent,
  minDesignPx,
  notifyViewfit,
  phaserDisplayScale,
  readCssSafeArea,
  VIEWFIT_EVENT,
} from "./viewFit";

describe("displayScale NONE + CSS contain", () => {
  it("is 1×1 on the desktop 1920×1080 artboard", () => {
    expect(displayScale({ width: GAME_WIDTH, height: GAME_HEIGHT })).toEqual({ x: 1, y: 1 });
  });

  it("maps a contained stage onto design space uniformly", () => {
    for (const view of POPULAR_MOBILE_LANDSCAPE) {
      const { stage } = containStage(view);
      const scale = displayScale(stage);
      expect(scale.x).toBeCloseTo(scale.y, 5);
      expect(stage.width / scale.x).toBeCloseTo(GAME_WIDTH);
      expect(stage.height / scale.y).toBeCloseTo(GAME_HEIGHT);
    }
  });

  it("pillarboxes wide phones and letterboxes tall viewports", () => {
    const phone = containStage({ width: 844, height: 390 });
    expect(phone.stage.width / phone.stage.height).toBeCloseTo(GAME_ASPECT, 5);
    expect(phone.railLeft).toBeGreaterThan(RAIL_MIN_CSS_PX);
    expect(phone.railRight).toBeGreaterThan(RAIL_MIN_CSS_PX);
    expect(phone.railLeft + phone.stage.width + phone.railRight).toBeCloseTo(844, 0);
    const tall = containStage({ width: 800, height: 600 });
    expect(tall.railTop + tall.stage.height + tall.railBottom).toBeCloseTo(600, 0);
    expect(tall.railLeft).toBeLessThan(1);
  });

  it("includes iPhone 16 Pro / Pro Max and iPad mini landscape sizes", () => {
    expect(POPULAR_MOBILE_LANDSCAPE).toContainEqual({ width: 874, height: 402 });
    expect(POPULAR_MOBILE_LANDSCAPE).toContainEqual({ width: 956, height: 440 });
    expect(POPULAR_MOBILE_LANDSCAPE).toContainEqual({ width: 1133, height: 744 });
  });

  it("maps iPhone notch insets into design pixels", () => {
    const view = { width: 844, height: 390 };
    const inset = designSafeInset(view, { left: 47, right: 47, top: 0, bottom: 21 });
    expect(inset.left).toBeCloseTo(cssPxToDesign(47, "x", view));
    expect(inset.bottom).toBeCloseTo(cssPxToDesign(21, "y", view));
    expect(inset.left).toBeGreaterThan(80);
    expect(inset.bottom).toBeGreaterThan(40);
  });
});

describe("readCssSafeArea", () => {
  it("falls back to documentElement when the game root still has 0 insets", () => {
    const prev = globalThis.getComputedStyle;
    const doc = globalThis.document;
    vi.stubGlobal("getComputedStyle", (el: { id?: string }) => ({
      getPropertyValue: (name: string) => {
        if (el?.id === "game-root") return "0px";
        if (name === "--kindling-safe-left") return "47px";
        return "0px";
      },
    }));
    vi.stubGlobal("document", { documentElement: { id: "html" } });
    try {
      expect(readCssSafeArea({ id: "game-root" } as HTMLElement).left).toBe(47);
    } finally {
      vi.stubGlobal("getComputedStyle", prev);
      vi.stubGlobal("document", doc);
    }
  });
});

describe("viewfit notify", () => {
  it("emits once per distinct CSS size and safe-area", () => {
    const emitted: string[] = [];
    const store = new Map<string, string>();
    const bus = {
      registry: {
        get: (key: string) => store.get(key),
        set: (key: string, value: string) => {
          store.set(key, value);
        },
      },
      events: { emit: (event: string) => emitted.push(event) },
    };
    const view = { width: 844, height: 390 };
    const inset = { left: 47, right: 47, top: 0, bottom: 21 };
    expect(notifyViewfit(bus, view, inset)).toBe(true);
    expect(notifyViewfit(bus, view, inset)).toBe(false);
    expect(notifyViewfit(bus, view, { ...inset, left: 0 })).toBe(true);
    expect(emitted).toEqual([VIEWFIT_EVENT, VIEWFIT_EVENT]);
  });
});

describe("HUD touch after scale", () => {
  it("keeps HUD buttons at least ~44 CSS px on every popular landscape size", () => {
    expect(HUD_TOUCH_MIN_DESIGN).toBe(minDesignPx(MIN_CSS_TOUCH_PX, "y"));
    for (const view of POPULAR_MOBILE_LANDSCAPE) {
      expect(cssPxFromDesign(HUD_TOUCH_MIN_DESIGN, "y", view)).toBeGreaterThanOrEqual(MIN_CSS_TOUCH_PX - 0.5);
    }
  });
});

describe("clientToGame pointer mapping", () => {
  it("maps CSS canvas bounds into 1920×1080 game space", () => {
    const canvas = { left: 10, top: 20, width: 844, height: 390 };
    expect(clientToGame(10, 20, canvas)).toEqual({ x: 0, y: 0 });
    const mid = clientToGame(10 + 422, 20 + 195, canvas);
    expect(mid.x).toBeCloseTo(GAME_WIDTH / 2);
    expect(mid.y).toBeCloseTo(GAME_HEIGHT / 2);
    const end = clientToGame(10 + 844, 20 + 390, canvas);
    expect(end.x).toBeCloseTo(GAME_WIDTH);
    expect(end.y).toBeCloseTo(GAME_HEIGHT);
  });

  it("is the inverse of CSS scale (Phaser displayScale)", () => {
    const view = { width: 800, height: 360 };
    const phaser = phaserDisplayScale(view);
    const css = displayScale(view);
    expect(phaser.x * css.x).toBeCloseTo(1);
    expect(phaser.y * css.y).toBeCloseTo(1);
  });
});

describe("stageContainScale", () => {
  it("is stageCssWidth / 1920 under uniform contain", () => {
    const { stage } = containStage({ width: 844, height: 390 });
    expect(stageContainScale(stage)).toBeCloseTo(stage.width / GAME_WIDTH, 6);
    expect(stageContainScale(stage)).toBeCloseTo(stage.height / GAME_HEIGHT, 5);
  });

  it("publishes through set/get for the shell → theme path", () => {
    setStageContainScale(0.42);
    expect(getStageContainScale()).toBeCloseTo(0.42, 6);
    setStageContainScale(1);
    expect(getStageContainScale()).toBe(1);
  });
});
