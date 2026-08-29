import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { PX } from "./art/px";
import { PEOPLE_SCALE } from "./maps/shopT0";
import { PEOPLE_PX, PERSON_H, PERSON_HAT_H, PERSON_SIT_H, PERSON_SIT_W, PERSON_W } from "./art/peopleSize";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("people bake contract", () => {
  it("bakes people at 2× world PX so KINDLING can stamp as Inter", () => {
    expect(PEOPLE_PX).toBe(PX * 2);
    expect(PERSON_W).toBe(24 * PEOPLE_PX);
    expect(PERSON_H).toBe(44 * PEOPLE_PX);
    expect(PERSON_HAT_H).toBe(48 * PEOPLE_PX);
    expect(PERSON_SIT_W).toBe(28 * PEOPLE_PX);
    expect(PERSON_SIT_H).toBe(36 * PEOPLE_PX);
  });

  it("keeps the shop display scale", () => {
    expect(PEOPLE_SCALE).toBe(0.873);
  });

  it("stamps KINDLING through typekit without bitmap scale", () => {
    const src = readFileSync(join(root, "src/pixelArt.ts"), "utf8");
    expect(src).toContain("makeType");
    expect(src).toContain("fitTypeToWidth");
    expect(src).not.toMatch(/label\.setScale/);
    expect(src).toContain('stampKindling(scene, "tex-driver", 96, 36, 13, 104)');
    expect(src).toContain('stampKindling(scene, "tex-driver-sit", 112, 36, 13, 120)');
    expect(src).toContain('stampKindling(scene, "tex-keylead", 96, 208, 26, 120)');
  });

  it("does not flip the front-facing key-lead", () => {
    const src = readFileSync(join(root, "src/scenes/ShopScene.ts"), "utf8");
    const spawn = src.indexOf('.image(KEYLEAD.x, KEYLEAD.y, "tex-keylead")');
    expect(spawn).toBeGreaterThan(-1);
    expect(src).not.toMatch(/keyLead[\s\S]{0,80}setFlipX/);
    expect(src).not.toContain("setFlipX");
  });

  it("does not paint cheek blush", () => {
    const src = readFileSync(join(root, "src/pixelArt.ts"), "utf8");
    const face = src.slice(src.indexOf("function drawFace"), src.indexOf("function drawHands"));
    expect(face).not.toContain("Pal.blush");
  });

  it("keeps the bag a simple silhouette", () => {
    const src = readFileSync(join(root, "src/pixelArt.ts"), "utf8");
    const bag = src.slice(src.indexOf("function bag"), src.indexOf("function vehicle"));
    expect(bag).not.toMatch(/gusset|Kindling tag|open mouth/i);
  });
});
