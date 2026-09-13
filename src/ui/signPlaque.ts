import { Pal } from "../art/palette";

/**
 * The counter plaque's border treatment, shared so other signage can match it
 * exactly rather than approximately.
 */
export const SIGN_EDGE = Pal.leafDark;
export const SIGN_BORDER = Pal.leaf;
/** `SIGN_WHITE` in shopInterior.ts, which is a module-local constant there. */
export const SIGN_FIELD = 0xffffff;

export const SIGN_EDGE_W = 4;
export const SIGN_BORDER_W = 4;
/** Total frame thickness on each side of the white field. */
export const SIGN_FRAME_W = SIGN_EDGE_W + SIGN_BORDER_W;

/** White margin around glyphs — panel grows by this, not Phaser Text padding. */
export const SIGN_PAD_X = 27;
export const SIGN_PAD_Y = 23;

export const PLAQUE_TEX = "sign-plaque";
export const PLAQUE_TEX_LIME = "sign-plaque-lime";
export const PLAQUE_TEX_DANGER = "sign-plaque-danger";

export interface SignRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SignRing extends SignRect {
  color: number;
}

/**
 * Filled rects for a plaque wrapping `field`, outermost first.
 *
 * @deprecated Runtime plaques use {@link registerSignPlaqueTextures} in signPlaqueNine.ts.
 */
export function signPlaqueRings(field: SignRect): SignRing[] {
  const grow = (by: number, color: number): SignRing => ({
    x: Math.round(field.x - by),
    y: Math.round(field.y - by),
    w: Math.round(field.w + by * 2),
    h: Math.round(field.h + by * 2),
    color,
  });
  return [grow(SIGN_FRAME_W, SIGN_EDGE), grow(SIGN_BORDER_W, SIGN_BORDER), grow(0, SIGN_FIELD)];
}
