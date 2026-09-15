/**
 * Runtime Inter bitmap fonts for HUD role tokens on coarse pointer.
 * One GPU texture per role × weight instead of per-label canvas uploads.
 */
import Phaser from "phaser";
import { Color } from "./theme";
import { isCoarsePointer, parseFontPx, UI_FONT } from "./typeMetrics";
import type { TypeRole } from "./typeScale";
import { typeRolePx } from "./typeScale";
import { hexToTint, TYPE_ATLAS_FONT, TYPE_ATLAS_INK } from "./typeInk";

export type AtlasRole = "hudTitle" | "hudBody" | "hudSmall";

export const ATLAS_ROLES: readonly AtlasRole[] = ["hudTitle", "hudBody", "hudSmall"];

const ATLAS_WEIGHTS = [600, 700] as const;
type AtlasWeight = (typeof ATLAS_WEIGHTS)[number];

/** Latin + game punctuation — speech stays canvas for richer copy. */
export const TYPE_ATLAS_CHARS =
  " !\"#$%&'()*+,-./0123456789:;<=>?@ABCDEFGHIJKLMNOPQRSTUVWXYZ[\\]^_`abcdefghijklmnopqrstuvwxyz{|}~…–—";

const SHEET_PAD = 2;
const SHEET_MAX = 2048;

let atlasReady = false;

export function isTypeAtlasReady(): boolean {
  return atlasReady;
}

export function isAtlasRole(role: TypeRole | undefined): role is AtlasRole {
  return role === "hudTitle" || role === "hudBody" || role === "hudSmall";
}

export function atlasFontKey(role: AtlasRole, weight: AtlasWeight): string {
  return `type-atlas-${role}-${weight}`;
}

function atlasTextureKey(role: AtlasRole, weight: AtlasWeight): string {
  return `type-atlas-tex-${role}-${weight}`;
}

function parseWeight(fontStyle: string | undefined): AtlasWeight {
  if (fontStyle?.includes("700")) return 700;
  return 600;
}

export function resolveAtlasFontKey(role: AtlasRole, fontStyle?: string): string {
  const weight = parseWeight(fontStyle);
  return atlasFontKey(role, weight);
}

/** Phone-only: desktop keeps canvas Text (Phase 2 clamp-fit removal is sufficient there). */
export function shouldUseTypeAtlas(role: TypeRole | undefined, hasStroke: boolean): boolean {
  if (!isCoarsePointer()) return false;
  if (!atlasReady) return false;
  if (!isAtlasRole(role)) return false;
  if (hasStroke) return false;
  return true;
}

type GlyphRect = {
  id: number;
  char: string;
  x: number;
  y: number;
  w: number;
  h: number;
  xOffset: number;
  yOffset: number;
  xAdvance: number;
};

function escapeXml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function buildXml(
  face: string,
  size: number,
  lineHeight: number,
  sheetW: number,
  sheetH: number,
  glyphs: readonly GlyphRect[],
): string {
  const chars = glyphs
    .map(
      (g) =>
        `<char id="${g.id}" x="${g.x}" y="${g.y}" width="${g.w}" height="${g.h}" xoffset="${g.xOffset}" yoffset="${g.yOffset}" xadvance="${g.xAdvance}" page="0" chnl="15"/>`,
    )
    .join("");
  return (
    `<?xml version="1.0"?>` +
    `<font>` +
    `<info face="${escapeXml(face)}" size="${size}" bold="0" italic="0" charset="" unicode="1" stretchH="100" smooth="1" aa="1" padding="0,0,0,0" spacing="1,1"/>` +
    `<common lineHeight="${lineHeight}" base="${size}" scaleW="${sheetW}" scaleH="${sheetH}" pages="1" packed="0"/>` +
    `<pages><page id="0" file="sheet.png"/></pages>` +
    `<chars count="${glyphs.length}">${chars}</chars>` +
    `</font>`
  );
}

function measureGlyph(
  ctx: CanvasRenderingContext2D,
  ch: string,
  font: string,
): { w: number; h: number; xAdvance: number; yOffset: number } {
  ctx.font = font;
  const metrics = ctx.measureText(ch);
  const w = Math.ceil(metrics.width);
  const ascent = Math.ceil(metrics.actualBoundingBoxAscent ?? parseFontPx(font) * 0.8);
  const descent = Math.ceil(metrics.actualBoundingBoxDescent ?? parseFontPx(font) * 0.22);
  const h = Math.max(1, ascent + descent);
  return { w, h, xAdvance: Math.max(w, Math.ceil(metrics.width)), yOffset: ascent };
}

function packGlyphs(
  ctx: CanvasRenderingContext2D,
  chars: string,
  font: string,
  fontPx: number,
): { glyphs: GlyphRect[]; sheetW: number; sheetH: number; lineHeight: number } | null {
  const sizes = [...chars].map((ch) => ({ ch, ...measureGlyph(ctx, ch, font) }));
  let rowH = 0;
  let x = SHEET_PAD;
  let y = SHEET_PAD;
  let sheetW = SHEET_PAD;
  let lineHeight = fontPx;
  const placements: Array<{ ch: string; x: number; y: number; w: number; h: number; xAdvance: number; yOffset: number }> = [];

  for (const item of sizes) {
    if (x + item.w + SHEET_PAD > SHEET_MAX) {
      y += rowH + SHEET_PAD;
      x = SHEET_PAD;
      rowH = 0;
    }
    if (y + item.h + SHEET_PAD > SHEET_MAX) return null;
    placements.push({ ch: item.ch, x, y, w: item.w, h: item.h, xAdvance: item.xAdvance, yOffset: item.yOffset });
    x += item.w + SHEET_PAD;
    rowH = Math.max(rowH, item.h);
    sheetW = Math.max(sheetW, x);
    lineHeight = Math.max(lineHeight, item.h);
  }

  const sheetH = y + rowH + SHEET_PAD;
  const glyphs: GlyphRect[] = placements.map((p) => ({
    id: p.ch.codePointAt(0) ?? p.ch.charCodeAt(0),
    char: p.ch,
    x: p.x,
    y: p.y,
    w: p.w,
    h: p.h,
    xOffset: 0,
    yOffset: p.yOffset,
    xAdvance: p.xAdvance + 1,
  }));
  return { glyphs, sheetW, sheetH, lineHeight };
}

function drawSheet(
  ctx: CanvasRenderingContext2D,
  font: string,
  glyphs: readonly GlyphRect[],
  sheetW: number,
  sheetH: number,
): void {
  ctx.clearRect(0, 0, sheetW, sheetH);
  ctx.font = font;
  ctx.fillStyle = "#ffffff";
  ctx.textBaseline = "alphabetic";
  for (const g of glyphs) {
    ctx.fillText(g.char, g.x, g.y + g.yOffset);
  }
}

function registerOneFont(
  scene: Phaser.Scene,
  role: AtlasRole,
  weight: AtlasWeight,
  fontPx: number,
): boolean {
  const cacheKey = atlasFontKey(role, weight);
  const texKey = atlasTextureKey(role, weight);
  if (scene.cache.bitmapFont.exists(cacheKey)) return true;

  const fontSpec = `${weight} ${fontPx}px ${UI_FONT}`;
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;

  const packed = packGlyphs(ctx, TYPE_ATLAS_CHARS, fontSpec, fontPx);
  if (!packed) {
    console.debug("typeAtlas: sheet overflow", { role, weight, fontPx });
    return false;
  }

  canvas.width = packed.sheetW;
  canvas.height = packed.sheetH;
  drawSheet(ctx, fontSpec, packed.glyphs, packed.sheetW, packed.sheetH);

  if (scene.textures.exists(texKey)) scene.textures.remove(texKey);
  scene.textures.addCanvas(texKey, canvas);

  const xml = buildXml(UI_FONT, fontPx, packed.lineHeight, packed.sheetW, packed.sheetH, packed.glyphs);
  scene.cache.bitmapFont.add(cacheKey, {
    data: xml,
    texture: texKey,
    textureX: 0,
    textureY: 0,
  });
  return scene.cache.bitmapFont.exists(cacheKey);
}

/**
 * Build role atlases after Inter is loaded. Coarse-only — desktop skips registration.
 * Returns true when all role × weight fonts registered.
 */
export function registerTypeAtlas(scene: Phaser.Scene): boolean {
  if (!isCoarsePointer()) {
    atlasReady = false;
    return false;
  }
  let ok = true;
  for (const role of ATLAS_ROLES) {
    const fontPx = Math.round(parseFontPx(typeRolePx(role)));
    for (const weight of ATLAS_WEIGHTS) {
      if (!registerOneFont(scene, role, weight, fontPx)) ok = false;
    }
  }
  atlasReady = ok;
  if (ok) console.debug("typeAtlas: registered", { roles: ATLAS_ROLES.length, weights: ATLAS_WEIGHTS.length });
  return ok;
}

export function resetTypeAtlasForTests(): void {
  atlasReady = false;
}

/** Create BitmapText for a role token — caller finishes wrap + hooks. */
export function makeAtlasInk(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  role: AtlasRole,
  options: {
    fontStyle?: string;
    color?: string;
    align?: string;
    lineSpacing?: number;
    letterSpacing?: number;
    maxWidth?: number;
  },
): Phaser.GameObjects.BitmapText {
  const fontKey = resolveAtlasFontKey(role, options.fontStyle);
  const text = scene.make.bitmapText({
    x,
    y,
    font: fontKey,
    text: content,
    size: false,
    add: false,
  });
  text.setTint(hexToTint(options.color ?? Color.inkHex));
  if (options.align) text.setCenterAlign();
  if (options.lineSpacing !== undefined) text.setLineSpacing(options.lineSpacing);
  if (options.letterSpacing !== undefined) text.setLetterSpacing(options.letterSpacing);
  if (options.maxWidth && options.maxWidth > 0) text.setMaxWidth(options.maxWidth);
  text.setData(TYPE_ATLAS_INK, true);
  text.setData(TYPE_ATLAS_FONT, fontKey);
  return text;
}

export function addAtlasInk(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  role: AtlasRole,
  options: Parameters<typeof makeAtlasInk>[5],
): Phaser.GameObjects.BitmapText {
  const text = makeAtlasInk(scene, x, y, content, role, options);
  scene.add.existing(text);
  return text;
}
