/**
 * The delivery phone's cell grid, shared by the bake and the HUD.
 *
 * The old chassis was authored on a 22×26 grid but baked onto an 80×96 canvas,
 * so Phaser clipped the right edge column, the bottom cap and the side button.
 * What survived sat 2px off centre, which `setDisplaySize` magnified into the
 * 3.7:1 gap asymmetry visible in the tutorial flash ring. Everything here is
 * therefore derived from one cell grid, the canvas is sized *from* that grid,
 * and the chassis is centred by construction — no nudge factors anywhere.
 *
 * Pure module — no Phaser — so the geometry is unit-testable.
 */

/** Finer than the 4px world grid: a convincing bezel needs sub-4px detail. */
export const PHONE_PX = 8;

export interface CellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Canvas, in cells. The art fills it exactly. */
export const PHONE_CELLS = { w: 22, h: 26 } as const;

/** Baked texture size. Derived — never hand-written into `bake`. */
export const PHONE_TEX = {
  w: PHONE_CELLS.w * PHONE_PX,
  h: PHONE_CELLS.h * PHONE_PX,
} as const;

/**
 * Design pixels per texture pixel. 22×26 cells at ×1.75 put the chassis at exactly
 * 280×336, the size the phone was first specced to; ×1.15 on top of that is this
 * 2.0125, for a 322×386.4 body. The 15% is why the numbers stopped being round —
 * every consumer derives from this factor, so fractions land where they belong
 * instead of being rounded back into a hand-written dimension.
 */
export const PHONE_SCALE = 2.0125;

/**
 * The body. One cell of margin on every side: the side buttons live in the
 * margin columns, and equal margins keep the chassis centred in the texture.
 */
export const PHONE_CHASSIS_CELLS: CellRect = { x: 1, y: 1, w: 20, h: 24 };

/**
 * Glass, inside a single-cell bezel. One cell is 14 design pixels against a 280px
 * body — 5% a side. Two cells looked like a tablet in a protective case, and it cost
 * the map 40px of width it had nowhere else to get.
 */
export const PHONE_GLASS_CELLS: CellRect = { x: 2, y: 2, w: 18, h: 22 };

/** Status bar: signal, wifi, battery. Baked, so the app must not paint over it. */
export const PHONE_STATUS_CELLS: CellRect = { x: 2, y: 2, w: 18, h: 2 };

/** Where the delivery app is allowed to paint. */
export const PHONE_APP_CELLS: CellRect = { x: 2, y: 4, w: 18, h: 19 };

/** Home indicator strip along the bottom of the glass. */
export const PHONE_HOME_CELLS: CellRect = { x: 2, y: 23, w: 18, h: 1 };

/** Dynamic island, straddling the status bar the way the real one does. */
export const PHONE_ISLAND_CELLS: CellRect = { x: 7, y: 2, w: 8, h: 2 };

export interface DesignRect {
  /** Left edge, relative to the sprite's centre. */
  x: number;
  /** Top edge, relative to the sprite's centre. */
  y: number;
  w: number;
  h: number;
}

/**
 * A cell rect in design pixels, measured from the sprite centre — which is the
 * space a Phaser container's children are positioned in.
 */
export function phoneDesignRect(cell: CellRect, scale: number = PHONE_SCALE): DesignRect {
  const unit = PHONE_PX * scale;
  return {
    x: (cell.x - PHONE_CELLS.w / 2) * unit,
    y: (cell.y - PHONE_CELLS.h / 2) * unit,
    w: cell.w * unit,
    h: cell.h * unit,
  };
}

/** Signed distance from a rect's centre to the sprite centre, per axis. */
export function designRectOffset(rect: DesignRect): { x: number; y: number } {
  return { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
}

/** Margin between a cell rect and the canvas edge, per side, in cells. */
export function cellMargins(cell: CellRect): { left: number; right: number; top: number; bottom: number } {
  return {
    left: cell.x,
    right: PHONE_CELLS.w - (cell.x + cell.w),
    top: cell.y,
    bottom: PHONE_CELLS.h - (cell.y + cell.h),
  };
}
