import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Pal } from "./art/palette";
import { PX } from "./art/px";
import { PEOPLE_SCALE } from "./maps/shopT0";
import { PEOPLE_PX, PERSON_H, PERSON_HAT_H, PERSON_SIT_H, PERSON_SIT_W, PERSON_W } from "./art/peopleSize";
import { SIGN_FIELD } from "./ui/signPlaque";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * `core.autocrlf` is true here, so a checkout delivers CRLF and any anchored
 * search would miss. Normalise on read — see docs/KNOWN_ERRORS.md.
 */
function readSource(rel: string): string {
  return readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");
}

/**
 * Throws rather than falling back to the rest of the file: a source scan that
 * fails open reports success while asserting against unrelated functions.
 */
function sliceBetween(src: string, from: string, to: string): string {
  const start = src.indexOf(from);
  if (start < 0) throw new Error(`marker not found in source: ${from}`);
  const end = src.indexOf(to, start + from.length);
  if (end < 0) throw new Error(`end marker not found after "${from}": ${to}`);
  return src.slice(start, end);
}

/** Spread between the widest and narrowest channel — 0 is a pure neutral. */
function channelSpread(color: number): number {
  const ch = [color >> 16, (color >> 8) & 0xff, color & 0xff];
  return Math.max(...ch) - Math.min(...ch);
}

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
    expect(src).toContain('stampKindling(scene, "tex-driver", 96, 31, DRIVER_MARK_PX, 104)');
    expect(src).toContain('stampKindling(scene, "tex-driver-sit", 120, 31, DRIVER_MARK_PX, 120)');
    expect(src).toContain('stampKindling(scene, "tex-keylead", 96, 208, 23, 120)');
  });

  it("runs the driver cap mark 10% over its old size", () => {
    const src = readFileSync(join(root, "src/pixelArt.ts"), "utf8");
    expect(src).toContain("const DRIVER_MARK_PX = 14.52;");
    expect(14.52).toBeCloseTo(13.2 * 1.1, 5);
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

describe("counter bag face", () => {
  const src = readSource("src/pixelArt.ts");

  it("bakes the counter bag face on the shared sign white", () => {
    const bags = sliceBetween(src, "function counterBags", "function vehicle");
    expect(bags).toContain('counterBag(scene, "tex-bag-white", SIGN_FIELD, BAG_FACE_SHADE)');
    for (const label of ["bags", "delivery", "pickup"]) {
      expect(bags).toContain(`stampText(scene, "tex-bag-white", "tex-bag-${label}"`);
    }
    // The cream base is gone rather than merely unused.
    expect(src).not.toContain("tex-bag-cream");
    expect(SIGN_FIELD).toBe(0xffffff);
  });

  it("keeps the pack prompt on lime so the next tap still signals", () => {
    const bags = sliceBetween(src, "function counterBags", "function vehicle");
    expect(bags).toContain('counterBag(scene, "tex-bag-lime", Pal.lime, Pal.creamSoft)');
    expect(bags).toContain('stampText(scene, "tex-bag-lime", "tex-bag-pack"');
  });

  it("shades the white face with a neutral rather than the cream tone", () => {
    const decl = /const BAG_FACE_SHADE = (0x[0-9a-f]{6});/.exec(src);
    if (!decl) throw new Error("BAG_FACE_SHADE declaration not found in src/pixelArt.ts");
    const shade = Number(decl[1]);
    expect(channelSpread(shade)).toBeLessThanOrEqual(12);
    // Reads as a foot shadow: clearly below white, still clearly paper.
    expect(shade >> 16).toBeLessThan(0xf0);
    expect(shade >> 16).toBeGreaterThan(0xc0);
    // Guard the guard — the warm tone this replaced must fail the same bar.
    expect(channelSpread(Pal.creamSoft)).toBeGreaterThan(12);
  });

  it("leaves the road and door bag on its own colours", () => {
    const roadBag = sliceBetween(src, "function bag(scene", "Counter bags carry their own");
    expect(roadBag).toContain("Pal.leaf");
    expect(roadBag).not.toContain("SIGN_FIELD");
    expect(roadBag).not.toContain("BAG_FACE_SHADE");
    expect(roadBag).not.toMatch(/0xff[ef]/i);
  });
});
