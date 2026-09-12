import { SIGN_PAD_X, SIGN_PAD_Y } from "./signPlaque";
import { parseFontPx } from "./typeMetrics";

const INK_CEILING_SLACK = 0.5;

export interface AxisAlignedBox {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface GlyphLayout {
  width: number;
  height: number;
  originX: number;
  originY: number;
}

export interface PlaqueLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  originX: number;
  originY: number;
}

const INK_PAD_TOLERANCE = 0.5;

function padExtents(text: Phaser.GameObjects.Text): { x: number; y: number } {
  const p = text.padding;
  return { x: (p?.left ?? 0) + (p?.right ?? 0), y: (p?.top ?? 0) + (p?.bottom ?? 0) };
}

/** Lines Phaser actually draws — respects maxLines truncation. */
export function drawnWrappedLines(text: Phaser.GameObjects.Text): string[] {
  const lines = text.getWrappedText();
  const maxLines = text.style.maxLines;
  if (maxLines > 0 && maxLines < lines.length) return lines.slice(0, maxLines);
  return lines;
}

/** Longest wrapped line + text padding — mirrors Phaser GetTextSize width. */
export function measureInkLineWidth(text: Phaser.GameObjects.Text, line: string): number {
  const ctx = text.context;
  if (!ctx) return line.length * 8;
  text.style.syncFont(text.canvas, ctx);
  const letterSpacing = text.letterSpacing;
  const stroke = text.style.strokeThickness ?? 0;
  let lineWidth = stroke;
  if (letterSpacing === 0) {
    lineWidth += ctx.measureText(line).width;
  } else {
    for (let i = 0; i < line.length; i++) {
      lineWidth += ctx.measureText(line[i]).width;
    }
    if (line.length > 1) lineWidth += letterSpacing * (line.length - 1);
  }
  if (text.style.wordWrapWidth) {
    lineWidth -= ctx.measureText(" ").width;
  }
  return Math.ceil(lineWidth);
}

export function measureInkWidth(text: Phaser.GameObjects.Text, lines: readonly string[]): number {
  let maxLine = 0;
  for (const line of lines) maxLine = Math.max(maxLine, measureInkLineWidth(text, line));
  return maxLine + padExtents(text).x;
}

export function measureInkHeight(text: Phaser.GameObjects.Text, lineCount: number): number {
  if (lineCount <= 0) return 0;
  const style = text.style;
  const lineHeight = parseFontPx(style.fontSize) + (style.strokeThickness ?? 0);
  let height = lineHeight * lineCount;
  if (lineCount > 1) height += text.lineSpacing * (lineCount - 1);
  return height + padExtents(text).y;
}

/**
 * Ink box for plaque layout — shrinks to longest line / drawn stack when Phaser's
 * measured width or height is inflated by a wrap or clip ceiling.
 */
export function tightInkLayout(text: Phaser.GameObjects.Text): GlyphLayout {
  text.updateText();
  const reportedW = text.width;
  const reportedH = text.height;
  const lines = drawnWrappedLines(text);
  const tightW = measureInkWidth(text, lines);
  const tightH = measureInkHeight(text, lines.length);
  return {
    width: reportedW > tightW + INK_CEILING_SLACK ? tightW : reportedW,
    height: reportedH > tightH + INK_CEILING_SLACK ? tightH : reportedH,
    originX: text.originX,
    originY: text.originY,
  };
}

export function plaqueCenterFromInkBox(ink: AxisAlignedBox): { x: number; y: number } {
  return { x: (ink.left + ink.right) / 2, y: (ink.top + ink.bottom) / 2 };
}

export function glyphLocalBounds(glyph: GlyphLayout): { left: number; top: number } {
  const { width: w, height: h, originX, originY } = glyph;
  const textX = -w * originX;
  const textY = -h * originY;
  return { left: textX - w * originX, top: textY - h * originY };
}

/** Glyph ink bounds in host-local space (Phaser origin-aware). */
export function glyphAabb(glyph: GlyphLayout): AxisAlignedBox {
  const { left, top } = glyphLocalBounds(glyph);
  return { left, top, right: left + glyph.width, bottom: top + glyph.height };
}

export function plaqueAabb(plaque: PlaqueLayout): AxisAlignedBox {
  const { x, y, width: w, height: h, originX, originY } = plaque;
  const left = x - w * originX;
  const top = y - h * originY;
  return { left, top, right: left + w, bottom: top + h };
}

export interface InkPad {
  x: number;
  y: number;
}

/**
 * True when glyph ink sits inside the plaque with the given pad margin (± tolerance).
 * Returns a reason string when layout would clip or leave an empty box.
 */
export function inkInsidePlaque(
  glyph: GlyphLayout,
  plaque: PlaqueLayout,
  pad: InkPad = { x: SIGN_PAD_X, y: SIGN_PAD_Y },
  tolerance = INK_PAD_TOLERANCE,
): { ok: true } | { ok: false; reason: string } {
  const { width: w, height: h } = glyph;
  if (w <= 0 || h <= 0) return { ok: false, reason: "empty glyph box" };
  if (plaque.width <= 0 || plaque.height <= 0) return { ok: false, reason: "empty plaque box" };
  const ink = glyphAabb(glyph);
  const panel = plaqueAabb(plaque);
  if (ink.top < panel.top + pad.y - tolerance) return { ok: false, reason: "top-clipped ink" };
  if (ink.left < panel.left + pad.x - tolerance) return { ok: false, reason: "left-clipped ink" };
  if (ink.right > panel.right - pad.x + tolerance) return { ok: false, reason: "right-clipped ink" };
  if (ink.bottom > panel.bottom - pad.y + tolerance) return { ok: false, reason: "bottom-clipped ink" };
  return { ok: true };
}
