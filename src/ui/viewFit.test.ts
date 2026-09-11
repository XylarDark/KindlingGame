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
  setStageFrame,
  cssPxFromDesign,
  cssPxToDesign,
  designHudInset,
  designLayoutInset,
  designSafeInset,
  displayScale,
  fillsParent,
  minDesignPx,
  notifyViewfit,
  phaserDisplayScale,
  readCssSafeArea,
  stageCropCss,
  settingsCogX,
  cogInsideHudViewport,
  hudSceneViewport,
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

  it("pillarboxes wide phones and never letterboxes tall viewports", () => {
    const phone = containStage({ width: 844, height: 390 });
    expect(phone.stage.width / phone.stage.height).toBeCloseTo(GAME_ASPECT, 5);
    expect(phone.stage.height).toBe(390);
    expect(phone.railTop).toBe(0);
    expect(phone.railBottom).toBe(0);
    expect(phone.railLeft).toBeGreaterThan(RAIL_MIN_CSS_PX);
    expect(phone.railRight).toBeGreaterThan(RAIL_MIN_CSS_PX);
    expect(phone.railLeft + phone.stage.width + phone.railRight).toBeCloseTo(844, 0);
    const tall = containStage({ width: 800, height: 600 });
    expect(tall.stage.height).toBe(600);
    expect(tall.railTop).toBe(0);
    expect(tall.railBottom).toBe(0);
    expect(tall.stage.width).toBeGreaterThan(800);
    expect(tall.railLeft).toBe(0);
    expect(tall.railRight).toBe(0);
    expect(tall.stage.left).toBeLessThan(0);
  });

  it("contain mode fits the full 16:9 inside tall IDE / desktop panes", () => {
    // Cursor browser-like pane: taller than 16:9 — height-fill would set left < 0.
    const tall = containStage({ width: 1268, height: 971 }, GAME_ASPECT, "contain");
    expect(tall.stage.left).toBeGreaterThanOrEqual(0);
    expect(tall.stage.top).toBeGreaterThanOrEqual(0);
    expect(tall.stage.width).toBeLessThanOrEqual(1268 + 0.01);
    expect(tall.stage.height).toBeLessThanOrEqual(971 + 0.01);
    expect(tall.stage.width / tall.stage.height).toBeCloseTo(GAME_ASPECT, 5);
    expect(tall.railTop + tall.stage.height + tall.railBottom).toBeCloseTo(971, 0);
    expect(tall.stage.left + tall.stage.width).toBeLessThanOrEqual(1268 + 0.01);
  });

  it("keeps railTop and railBottom at zero on every popular landscape size", () => {
    for (const view of POPULAR_MOBILE_LANDSCAPE) {
      const packed = containStage(view);
      expect(packed.railTop).toBe(0);
      expect(packed.railBottom).toBe(0);
      expect(packed.stage.height).toBe(view.height);
      expect(packed.stage.top).toBe(0);
    }
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

  it("adds height-fill crop to HUD insets so chrome stays in the visible rect", () => {
    const packed = containStage({ width: 1024, height: 768 });
    expect(packed.stage.left).toBeLessThan(0);
    const crop = stageCropCss(packed.stage);
    expect(crop.left).toBeGreaterThan(100);
    const inset = designLayoutInset(packed.stage, { left: 0, right: 0, top: 0, bottom: 0 });
    const cropDesign = cssPxToDesign(crop.left, "x", packed.stage);
    expect(inset.left).toBeCloseTo(cropDesign, 5);
    expect(inset.right).toBeCloseTo(cropDesign, 5);
    // Cog at GAME_WIDTH - 24 - inset.right must stay inside the visible crop.
    const cogX = GAME_WIDTH - 24 - inset.right;
    expect(cogX).toBeLessThanOrEqual(GAME_WIDTH - cropDesign);
    expect(cogX).toBeGreaterThanOrEqual(cropDesign);
  });

  it("publishes stage frame for designHudInset", () => {
    const packed = containStage({ width: 1024, height: 768 });
    setStageFrame(packed.stage);
    const inset = designHudInset({ left: 0, right: 0, top: 0, bottom: 0 });
    expect(inset.left).toBeGreaterThan(100);
    setStageFrame({ width: GAME_WIDTH, height: GAME_HEIGHT, left: 0, top: 0 });
  });
});

describe("clientToGame with cropped stage", () => {
  it("maps the visible left edge when the canvas overhangs the viewport", () => {
    // 800×600 viewport, height-fill stage ~1067×600 centred → left ≈ -133.5
    const packed = containStage({ width: 800, height: 600 });
    const canvas = {
      left: packed.stage.left,
      top: 0,
      width: packed.stage.width,
      height: packed.stage.height,
    };
    const atViewportLeft = clientToGame(0, 300, canvas);
    expect(atViewportLeft.x).toBeCloseTo((-packed.stage.left / packed.stage.width) * GAME_WIDTH, 0);
    expect(atViewportLeft.x).toBeGreaterThan(100);
    const atViewportRight = clientToGame(800, 300, canvas);
    expect(atViewportRight.x).toBeCloseTo(((800 - packed.stage.left) / packed.stage.width) * GAME_WIDTH, 0);
    expect(atViewportRight.x).toBeLessThan(GAME_WIDTH - 100);
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
  it("keeps HUD buttons at least ~48 CSS px on every popular landscape size", () => {
    expect(MIN_CSS_TOUCH_PX).toBe(48);
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

describe("settings cog viewport geometry", () => {
  it("FAILS if cog X stays at design GAME_WIDTH when the HUD backbuffer is narrower", () => {
    for (const scale of [0.85, 0.65]) {
      const viewW = Math.round(GAME_WIDTH * scale);
      const viewH = Math.round(GAME_HEIGHT * scale);
      const cogRight = settingsCogX(viewW, 0);
      expect(cogInsideHudViewport(cogRight, HUD_TOUCH_MIN_DESIGN, viewW)).toBe(true);
      expect(GAME_WIDTH - 24).toBeGreaterThan(viewW);
      expect(cogRight).toBeLessThanOrEqual(viewW);
      expect(viewH).toBeGreaterThan(600);
    }
  });

  it("reads the live camera width instead of design GAME_WIDTH", () => {
    const viewW = Math.round(GAME_WIDTH * 0.85);
    const scene = {
      cameras: { main: { width: viewW, height: Math.round(GAME_HEIGHT * 0.85) } },
      scale: { width: viewW, height: Math.round(GAME_HEIGHT * 0.85) },
    };
    expect(hudSceneViewport(scene as never).width).toBe(viewW);
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
