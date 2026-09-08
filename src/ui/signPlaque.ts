import { Pal } from "../art/palette";

/**
 * The counter plaque's border treatment, shared so other signage can match it
 * exactly rather than approximately.
 *
 * Source of truth is `drawShopCounter` in `src/art/shopInterior.ts`: a leaf-dark
 * outer edge, a leaf inner edge, then a white field carrying ink type. That art
 * paints through `fill` from `src/art/px.ts`, which snaps every edge to the 4px
 * pixel grid, so its authored 3px and 8px insets land on screen as two 4px
 * rings — the snapped widths are what is reused here.
 */
export const SIGN_EDGE = Pal.leafDark;
export const SIGN_BORDER = Pal.leaf;
/** `SIGN_WHITE` in shopInterior.ts, which is a module-local constant there. */
export const SIGN_FIELD = 0xffffff;

export const SIGN_EDGE_W = 4;
export const SIGN_BORDER_W = 4;
/** Total frame thickness on each side of the white field. */
export const SIGN_FRAME_W = SIGN_EDGE_W + SIGN_BORDER_W;

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
 * Filled rects for a plaque wrapping `field`, outermost first — draw them in
 * order and each one covers the middle of the last, leaving two even rings.
 * `field` is the white area, so callers pass the measured bounds of whatever
 * sits on the plaque and the frame grows outward from there.
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
