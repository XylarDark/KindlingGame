import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { glyphAabb, inkInsidePlaque, measureInkHeight, measureInkWidth, plaqueCenterFromInkBox, tightInkLayout } from "./signTextInk";
import { SIGN_PAD_X, SIGN_PAD_Y } from "./signPlaque";

function read(path: string): string {
  const src = readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  if (src.trim().length === 0) throw new Error(`${path} read as empty`);
  return src;
}

const SCENES = [
  "../scenes/ShopScene.ts",
  "../scenes/DriveScene.ts",
  "../scenes/HudScene.ts",
  "../scenes/DoorScene.ts",
  "../scenes/TitleScene.ts",
];

const helper = read("./signText.ts");

function mockGlyph(w: number, h: number, originX: number, originY: number) {
  return { width: w, height: h, originX, originY };
}

function mockPlaque(x: number, y: number, width: number, height: number, originX = 0.5, originY = 0.5) {
  return { x, y, width, height, originX, originY };
}

describe("sign text ink contract", () => {
  it("states the ink-inside-panel contract at the top of signText", () => {
    expect(helper).toContain("Sign text contract — standard UI: ink stays inside its panel");
    expect(helper).toContain("syncChildScrollFactors");
  });

  it("fails on empty glyph or plaque boxes", () => {
    expect(inkInsidePlaque(mockGlyph(0, 0, 0.5, 0.5), mockPlaque(0, 0, 40, 24)).ok).toBe(false);
    expect(inkInsidePlaque(mockGlyph(20, 12, 0.5, 0.5), mockPlaque(0, 0, 0, 24)).ok).toBe(false);
  });

  it("fails when ink would clip the plaque top", () => {
    const glyph = mockGlyph(40, 16, 0.5, 0.5);
    const w = 40;
    const h = 16;
    const panelW = w + SIGN_PAD_X * 2;
    const panelH = h + SIGN_PAD_Y * 2;
    const { top: inkTop } = glyphAabb(glyph);
    const plaque = mockPlaque(0, inkTop + SIGN_PAD_Y - 2 + panelH / 2, panelW, panelH);
    const result = inkInsidePlaque(glyph, plaque);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("top-clipped ink");
  });

  it("passes when ink sits inside the padded plaque field", () => {
    const glyph = mockGlyph(40, 16, 0.5, 0.5);
    const w = 40;
    const h = 16;
    const panelW = w + SIGN_PAD_X * 2;
    const panelH = h + SIGN_PAD_Y * 2;
    const { left, top } = glyphAabb(glyph);
    const plaque = mockPlaque(
      left - SIGN_PAD_X + panelW / 2,
      top - SIGN_PAD_Y + panelH / 2,
      panelW,
      panelH,
    );
    expect(inkInsidePlaque(glyph, plaque).ok).toBe(true);
  });

  it("validates compact drive chip pads — not the default SIGN_PAD constants", () => {
    const compact = { x: 8, y: 6 };
    const glyph = mockGlyph(120, 48, 0.5, 1);
    const panelW = 120 + compact.x * 2;
    const panelH = 48 + compact.y * 2;
    const { left, top } = glyphAabb(glyph);
    const plaque = mockPlaque(
      left - compact.x + panelW / 2,
      top - compact.y + panelH / 2,
      panelW,
      panelH,
      0.5,
      0.5,
    );
    expect(inkInsidePlaque(glyph, plaque, compact).ok).toBe(true);
    expect(inkInsidePlaque(glyph, plaque).ok).toBe(false);
  });

  it("layoutPlaque validates ink before lastLayoutKey early-return", () => {
    const layoutStart = helper.indexOf("function layoutPlaque(entry: SignPlaqueEntry): void {");
    if (layoutStart === -1) throw new Error("layoutPlaque not found");
    const layoutEnd = helper.indexOf("\n}", layoutStart);
    if (layoutEnd === -1) throw new Error("layoutPlaque end not found");
    const layout = helper.slice(layoutStart, layoutEnd);
    expect(layout).toContain("inkFitsPlaque(");
    expect(layout).toMatch(/inkFitsPlaque[\s\S]*if \(key === entry\.lastLayoutKey\)/);
  });

  it("passes signPads into ink validation", () => {
    const layoutStart = helper.indexOf("function layoutPlaque(entry: SignPlaqueEntry): void {");
    if (layoutStart === -1) throw new Error("layoutPlaque not found");
    const layoutEnd = helper.indexOf("\n}", layoutStart);
    if (layoutEnd === -1) throw new Error("layoutPlaque end not found");
    const layout = helper.slice(layoutStart, layoutEnd);
    expect(layout).toMatch(/inkFitsPlaque\([\s\S]*,\s*pad,\s*\)/);
    expect(layout).toMatch(/inkFitsPlaque\(\s*layout,/);
  });

  it("sizes plaque from tight ink, not wrap-ceiling text.width", () => {
    expect(helper).toContain("tightInkLayout");
    expect(helper).toContain("applyTightInkBox");
    const layoutStart = helper.indexOf("function layoutPlaque(entry: SignPlaqueEntry): void {");
    if (layoutStart === -1) throw new Error("layoutPlaque not found");
    const layoutEnd = helper.indexOf("\n}", layoutStart);
    if (layoutEnd === -1) throw new Error("layoutPlaque end not found");
    const layout = helper.slice(layoutStart, layoutEnd);
    expect(layout).toMatch(/let layout = tightInkLayout\(text\)/);
    expect(layout).toMatch(/const w = layout\.width/);
    expect(layout).toMatch(/plaqueCenterFromGlyphs\(text, layout\)/);
  });

  it("layoutPlaque sizes the plaque before ink validation — not the boot default box", () => {
    const layoutStart = helper.indexOf("function layoutPlaque(entry: SignPlaqueEntry): void {");
    if (layoutStart === -1) throw new Error("layoutPlaque not found");
    const layoutEnd = helper.indexOf("\n}", layoutStart);
    if (layoutEnd === -1) throw new Error("layoutPlaque end not found");
    const layout = helper.slice(layoutStart, layoutEnd);
    const setSizeAt = layout.indexOf("plaque.setSize(panelW, panelH)");
    const inkAt = layout.indexOf("inkFitsPlaque(");
    if (setSizeAt < 0) throw new Error("plaque.setSize(panelW, panelH) missing");
    if (inkAt < 0) throw new Error("inkFitsPlaque missing");
    expect(setSizeAt).toBeLessThan(inkAt);
    expect(layout).toMatch(/width: panelW, height: panelH/);
    expect(layout).not.toMatch(/width: plaque\.width, height: plaque\.height/);
  });
});

describe("text boxes are all the counter plaque", () => {
  it("leaves no flat chip anywhere in the game's screens", () => {
    for (const path of SCENES) {
      const chips = read(path)
        .split("\n")
        .filter((line) => /backgroundColor/.test(line) && !/cameras\.main/.test(line));
      expect(chips, `${path} still colours a text chip directly`).toEqual([]);
    }
  });

  it("does not offer a chip colour to pass in the first place", () => {
    const typekit = read("./typekit.ts");
    expect(typekit).not.toMatch(/backgroundColor\??:/);
    expect(read("./theme.ts"), "banner chip tokens are gone from the palette").not.toMatch(/bannerInk/);
  });

  it("sizes the 9-slice from glyph bounds + SIGN_PAD, not Phaser Text padding", () => {
    expect(helper).toContain("SIGN_PAD_X");
    expect(helper).toContain("SIGN_PAD_Y");
    expect(helper).toMatch(/panelW = Math\.max\(8, w \+ pad\.x \* 2\)/);
    expect(helper).toContain("signPads(text)");
    expect(helper).toMatch(/padding: undefined/);
    expect(helper).toContain("glyphLocalBounds");
    expect(helper).toContain("tightInkLayout");
    expect(helper).toContain("plaqueCenterFromGlyphs");
  });

  it("repaints via one scene pump on copy/accent changes, not every frame for position", () => {
    expect(helper).toContain("Phaser.Scenes.Events.PRE_RENDER");
    expect(helper).toContain("SceneSignPlaquePump");
    expect(helper).toContain("layoutPlaque");
    expect(helper).not.toMatch(/scene\.events\.on\(Phaser\.Scenes\.Events\.PRE_RENDER, sync\)/);
    expect(helper).toContain("Phaser.GameObjects.Events.DESTROY");
    expect(helper).toContain("host.destroy()");
  });

  it("skips nine-slice relayout when copy and bounds are unchanged", () => {
    expect(helper).toContain("lastLayoutKey");
    expect(helper).toMatch(/if \(key === entry\.lastLayoutKey\)/);
  });

  it("hides host + plaque when copy is empty", () => {
    expect(helper).toMatch(/const show = text\.visible && copy\.trim\(\)\.length > 0/);
    expect(helper).toMatch(/host\.setVisible\(show\)/);
  });

  it("exposes setSignCopy so plaques hide when copy is empty", () => {
    expect(helper).toContain("export function setSignCopy");
    expect(helper).toMatch(/copy\.trim\(\)\.length > 0/);
    expect(helper).toMatch(/entry\.host\.setVisible\(false\)/);
  });

  it("exposes setSignPosition for host container moves", () => {
    expect(helper).toContain("export function setSignPosition");
    expect(helper).toContain("export function signContainer");
    expect(helper).toContain("export function syncSignHit");
    expect(helper).toContain("export function signPlaqueExtents");
    expect(helper).toContain("export function signYAbove");
    expect(helper).toContain("export function signYFloor");
    expect(helper).toContain("export function signPlaqueMid");
    expect(helper).toContain("export function setSignPlaqueCenter");
    expect(helper).toContain("export function setSignPlaqueEdge");
    expect(helper).toContain("export function signPlaqueCenterWorld");
  });

  it("setSignPlaqueCenter derives host from plaque mid locals", () => {
    const fn = helper.slice(helper.indexOf("export function setSignPlaqueCenter"), helper.indexOf("export function setSignPlaqueEdge"));
    expect(fn).toContain("syncSignPlaque(text)");
    expect(fn).toContain("signPlaqueMid(text)");
    expect(fn).toMatch(/setSignPosition\(text, worldX - mid\.midX, worldY - mid\.midY\)/);
  });

  it("uses NineSlice panels instead of measured Graphics rings", () => {
    expect(helper).toContain("makePlaqueNineSlice");
    expect(helper).toContain("plaque.setSize");
    expect(helper).not.toContain("signPlaqueRings");
  });

  it("allows compact plaque pads via padVariant on sign hosts", () => {
    expect(helper).toContain("padVariant?: PadVariant");
    expect(helper).toContain("padForVariant");
    expect(helper).toContain("signPads(text)");
    expect(helper).toContain('text.setData(SIGN_PAD');
  });

  it("layoutPlaque does not throw when ink fails — skips instead", () => {
    const layoutStart = helper.indexOf("function layoutPlaque(entry: SignPlaqueEntry): void {");
    if (layoutStart === -1) throw new Error("layoutPlaque not found");
    const layoutEnd = helper.indexOf("\n}", layoutStart);
    if (layoutEnd === -1) throw new Error("layoutPlaque end not found");
    const layout = helper.slice(layoutStart, layoutEnd);
    expect(layout).toContain("if (!ink.ok)");
    expect(layout).not.toContain("throw new Error");
  });

  it("compact pad variant resolves through padForVariant", () => {
    const typeScale = read("./typeScale.ts");
    expect(typeScale).toContain('PAD_COMPACT = { x: 8, y: 6 }');
    expect(helper).toContain('padVariant !== undefined');
    expect(helper).not.toMatch(/layoutPlaque[\s\S]*throw new Error/);
  });

  it("parents text + plaque in a host container", () => {
    expect(helper).toContain("scene.add.container");
    expect(helper).toContain("SIGN_HOST");
  });

  it("lays out inner glyph locally without the host-moving setPosition patch", () => {
    const layoutStart = helper.indexOf("function layoutPlaque(entry: SignPlaqueEntry): void {");
    if (layoutStart === -1) throw new Error("layoutPlaque not found");
    const layoutEnd = helper.indexOf("\n}", layoutStart);
    if (layoutEnd === -1) throw new Error("layoutPlaque end not found");
    const layout = helper.slice(layoutStart, layoutEnd);
    expect(layout).toContain("setTextLocal(textX, textY)");
    expect(layout).not.toMatch(/text\.setPosition\(textX, textY\)/);
  });

  it("repairs inner locals even when lastLayoutKey is unchanged", () => {
    const layoutStart = helper.indexOf("function layoutPlaque(entry: SignPlaqueEntry): void {");
    if (layoutStart === -1) throw new Error("layoutPlaque not found");
    const layoutEnd = helper.indexOf("\n}", layoutStart);
    if (layoutEnd === -1) throw new Error("layoutPlaque end not found");
    const layout = helper.slice(layoutStart, layoutEnd);
    expect(layout).toContain("setTextLocal(textX, textY)");
    expect(layout).toMatch(/setTextLocal\(textX, textY\)[\s\S]*if \(key === entry\.lastLayoutKey\)/);
  });

  it("patched setPosition moves the host only — never zeroes inner glyph locals", () => {
    const addStart = helper.indexOf("export function addSignText(");
    if (addStart === -1) throw new Error("addSignText not found");
    const addEnd = helper.indexOf("\n}", helper.indexOf("layoutPlaque(entry);", addStart));
    if (addEnd === -1) throw new Error("addSignText end not found");
    const add = helper.slice(addStart, addEnd);
    expect(add).toMatch(/host\.setPosition\(x, y\)/);
    expect(add).not.toMatch(/rawSetPosition\(0,\s*0/);
    expect(add).toContain("return text;");
  });

  it("sets scrollFactor on the host and syncs children from it — never mismatched", () => {
    const addStart = helper.indexOf("export function addSignText(");
    if (addStart === -1) throw new Error("addSignText not found");
    const addEnd = helper.indexOf("\n}", helper.indexOf("layoutPlaque(entry);", addStart));
    if (addEnd === -1) throw new Error("addSignText end not found");
    const add = helper.slice(addStart, addEnd);
    expect(add).toContain("host.setScrollFactor(0)");
    expect(add).toContain("syncChildScrollFactors(host)");
    expect(add).not.toMatch(/text\.setScrollFactor/);
    expect(add).not.toMatch(/plaque\.setScrollFactor/);
    expect(helper).toContain("syncChildScrollFactors(host)");
    expect(add).toContain("makeType(scene, 0, 0, content");
  });
});

describe("tight ink measurement", () => {
  it("shrinks width when reported box equals a wrap ceiling", () => {
    const lines = ["Tap me"];
    const mockText = {
      width: 350,
      height: 83,
      originX: 0.5,
      originY: 0.5,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      lineSpacing: 4,
      letterSpacing: 0,
      style: {
        fontSize: "19px",
        metrics: { fontSize: 19 },
        strokeThickness: 0,
        wordWrapWidth: 330,
        wordWrap: true,
        maxLines: 0,
        syncFont: () => {},
      },
      context: {
        measureText: (s: string) => ({ width: s === " " ? 4 : s.length * 9 }),
      },
      canvas: {},
      updateText() {
        return mockText;
      },
      getWrappedText: () => lines,
    } as unknown as Phaser.GameObjects.Text;

    expect(measureInkWidth(mockText, lines)).toBe(50);
    expect(measureInkHeight(mockText, 1)).toBe(19);
    const layout = tightInkLayout(mockText);
    expect(layout.width).toBe(50);
    expect(layout.height).toBe(19);
  });

  it("keeps full width for copy that fills the wrap box", () => {
    const longLine = "A much longer line of speech that uses the full wrap width";
    const mockText = {
      width: 350,
      height: 48,
      originX: 0.5,
      originY: 0.5,
      padding: { left: 0, right: 0, top: 0, bottom: 0 },
      lineSpacing: 4,
      letterSpacing: 0,
      style: {
        fontSize: "19px",
        metrics: { fontSize: 19 },
        strokeThickness: 0,
        wordWrapWidth: 330,
        wordWrap: true,
        maxLines: 0,
        syncFont: () => {},
      },
      context: {
        measureText: (s: string) => ({ width: s === " " ? 4 : s.length * 6.2 }),
      },
      canvas: {},
      updateText() {
        return mockText;
      },
      getWrappedText: () => [longLine],
    } as unknown as Phaser.GameObjects.Text;

    expect(tightInkLayout(mockText).width).toBe(350);
  });

  it("centres plaque on ink box midpoints", () => {
    const ink = glyphAabb({ width: 80, height: 24, originX: 0.5, originY: 0.5 });
    expect(plaqueCenterFromInkBox(ink)).toEqual({ x: -40, y: -12 });
  });
});

describe("typekit fixed HUD roles", () => {
  it("skips clamp-fit for fixed typeRole tokens", () => {
    const typekit = read("./typekit.ts");
    expect(typekit).toContain("isFixedTypeRole");
    expect(typekit).toMatch(/if \(!fixedRole && \(options\.maxWidth/);
  });
});
