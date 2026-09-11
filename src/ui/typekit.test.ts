import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("phaser", () => ({
  default: {
    Textures: { FilterMode: { LINEAR: 0 } },
    Scale: { Events: { RESIZE: "resize" } },
  },
}));

vi.mock("./viewFit", () => ({
  getStageContainScale: () => 1,
  VIEWFIT_EVENT: "viewfit",
}));

import { capsTracking, isAllCaps, isCoarsePointer, overlayStroke, parseFontPx, typeResolution } from "./typeMetrics";
import { __devFitMeasureCount, fitTypeToBox } from "./typekit";

const typekitSrc = readFileSync(new URL("./typekit.ts", import.meta.url), "utf8").replace(/\r\n/g, "\n");

function mockFitText(content: string, seedBox: Record<string, unknown>): Phaser.GameObjects.Text {
  let fontSize = 20;
  let copy = content;
  const store = new Map<string, unknown>(Object.entries(seedBox));

  const measureDims = (): { w: number; h: number } => {
    const box = (store.get("typekitBox") ?? seedBox) as { maxWidth?: number };
    const wrapW = box.maxWidth ?? 200;
    const charW = fontSize * 0.55;
    const lines = Math.max(1, Math.ceil((copy.length * charW) / Math.max(1, wrapW - 8)));
    return {
      w: Math.min(copy.length * charW, wrapW),
      h: lines * fontSize * 1.25,
    };
  };
  let dims = measureDims();

  const text = {
    get text() {
      return copy;
    },
    set text(value: string) {
      copy = value;
    },
    get width() {
      return dims.w;
    },
    get height() {
      return dims.h;
    },
    scaleX: 1,
    scaleY: 1,
    style: { fontSize: `${fontSize}px`, resolution: 2 },
    padding: { left: 4, right: 4, top: 4, bottom: 4 },
    context: null,
    texture: { setFilter: vi.fn() },
    scene: { scale: {} },
    setScale: vi.fn().mockReturnThis(),
    setFontSize(s: string | number) {
      fontSize = typeof s === "number" ? s : Number.parseInt(String(s), 10);
      text.style.fontSize = `${fontSize}px`;
      return text;
    },
    setLetterSpacing: vi.fn(),
    setStyle: vi.fn().mockReturnThis(),
    setFixedSize: vi.fn().mockReturnThis(),
    setResolution: vi.fn(),
    setData(k: string, v: unknown) {
      store.set(k, v);
      return text;
    },
    getData(k: string) {
      return store.get(k);
    },
    updateText() {
      dims = measureDims();
      return text;
    },
  };
  return text as unknown as Phaser.GameObjects.Text;
}

describe("typeResolution", () => {
  it("never drops below 2x even on a small stretched canvas", () => {
    expect(typeResolution({ dpr: 1, fit: 0.4, objectScale: 1 })).toBe(2);
  });

  it("scales with device pixel ratio and CSS stretch", () => {
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

  it("caps resolution at 3 on coarse pointer so DPR 3 does not upload a 6× canvas", () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: query.includes("coarse"),
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    expect(isCoarsePointer()).toBe(true);
    expect(typeResolution({ dpr: 3, fit: 1, objectScale: 1 })).toBeLessThanOrEqual(3);
    expect(typeResolution({ dpr: 3, fit: 1, objectScale: 1 })).toBe(3);
    expect(typeResolution({ dpr: 2, fit: 1, objectScale: 1 })).toBeLessThanOrEqual(3);
    vi.unstubAllGlobals();
  });

  it("keeps desktop resolution at 4–8 for sharp type", () => {
    expect(typeResolution({ dpr: 2, fit: 1, objectScale: 1 })).toBe(4);
    expect(typeResolution({ dpr: 3, fit: 1, objectScale: 1 })).toBe(6);
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

describe("cheap clamp-fit on string change", () => {
  it("bindPolish skips identical strings and stores lastSize for reuse", () => {
    expect(typekitSrc).toMatch(/if \(content === text\.text\) return text/);
    expect(typekitSrc).toContain("lastSize");
    expect(typekitSrc).toContain("canReuseFitSize");
  });

  it("does not walk the full clamp loop for a same-box string swap", () => {
    const text = mockFitText("HELLO WORLD THIS IS A LONG ASK", {
      typekitBox: {
        maxWidth: 120,
        maxHeight: 48,
        minPx: 10,
        basePx: 20,
        noWrap: false,
        growBox: false,
      },
    });
    fitTypeToBox(text, 120, 48);
    const fullLoopMeasures = __devFitMeasureCount();
    expect(fullLoopMeasures).toBeGreaterThan(2);

    text.text = "DIFFERENT LONG CUSTOMER REQUEST";
    fitTypeToBox(text, 120, 48);
    expect(__devFitMeasureCount()).toBeLessThanOrEqual(3);
    expect(__devFitMeasureCount()).toBeLessThan(fullLoopMeasures);
  });
});
