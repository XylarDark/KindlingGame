import { describe, expect, it, vi } from "vitest";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import {
  HUD_TOUCH_MIN_DESIGN,
  MIN_CSS_TOUCH_PX,
  POPULAR_MOBILE_LANDSCAPE,
  clientToGame,
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

describe("displayScale NONE + CSS stretch", () => {
  it("is 1×1 on the desktop 1920×1080 artboard", () => {
    expect(displayScale({ width: GAME_WIDTH, height: GAME_HEIGHT })).toEqual({ x: 1, y: 1 });
  });

  it("stretches every popular landscape phone/tablet to fill the screen", () => {
    for (const view of POPULAR_MOBILE_LANDSCAPE) {
      const scale = displayScale(view);
      expect(view.width / scale.x).toBeCloseTo(GAME_WIDTH);
      expect(view.height / scale.y).toBeCloseTo(GAME_HEIGHT);
      expect(fillsParent({ width: GAME_WIDTH * scale.x, height: GAME_HEIGHT * scale.y }, view)).toBe(true);
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

describe("HUD touch after stretch", () => {
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

  it("is the inverse of CSS stretch (Phaser displayScale)", () => {
    const view = { width: 800, height: 360 };
    const phaser = phaserDisplayScale(view);
    const css = displayScale(view);
    expect(phaser.x * css.x).toBeCloseTo(1);
    expect(phaser.y * css.y).toBeCloseTo(1);
  });
});
