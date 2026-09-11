import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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
    expect(helper).toMatch(/panelW = Math\.max\(8, w \+ SIGN_PAD_X \* 2\)/);
    expect(helper).toMatch(/padding: undefined/);
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
  });

  it("uses NineSlice panels instead of measured Graphics rings", () => {
    expect(helper).toContain("makePlaqueNineSlice");
    expect(helper).toContain("plaque.setSize");
    expect(helper).not.toContain("signPlaqueRings");
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
});

describe("typekit fixed HUD roles", () => {
  it("skips clamp-fit for fixed typeRole tokens", () => {
    const typekit = read("./typekit.ts");
    expect(typekit).toContain("isFixedTypeRole");
    expect(typekit).toMatch(/if \(!fixedRole && \(options\.maxWidth/);
  });
});
