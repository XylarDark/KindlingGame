import { SIGN_PAD_X, SIGN_PAD_Y } from "./signPlaque";

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
