/** Shop cutaway at 1920×1080. Staff behind the counter; lobby in front. */
export const FLOOR_Y = 680;
export const COUNTER_TOP = 548;
export const COUNTER_FRONT = 668;
export const COUNTER_LEFT = 268;
export const COUNTER_RIGHT = 1510;
export const COUNTER_MID = Math.floor((COUNTER_LEFT + COUNTER_RIGHT) / 2);

/**
 * Standing people bake at 192×352 (8px cells). Old display was 96×176 @ 1.4 → 134×246.
 * 0.9 keeps them ~29% larger on screen without NEAREST-upscaling the KINDLING stamp.
 */
export const PERSON_NATIVE_H = 352;
export const PEOPLE_SCALE = 0.9;
export const BAG_SCALE = 0.72;

/** Shift back-wall props right so the lobby entrance stays clear. */
export const BACK_WALL_SHIFT = 100;

/** Chest clears the slab; head stays under the TV bezels. */
export const KEYLEAD = { x: COUNTER_MID, y: COUNTER_TOP + 114 };
/** Staff door, left of the strain grid. */
export const BACK_DOOR_W = 192;
export const BACK_DOOR_H = 380;
export const BACK_DOOR = { x: 430, y: KEYLEAD.y };
export const BAG_STACK = { x: KEYLEAD.x - 80, y: COUNTER_TOP };
export const PACK_SPOT = { x: 1216 + BACK_WALL_SHIFT, y: COUNTER_TOP };
/** Stay on the counter (right edge 1510) instead of sliding into the window. */
export const RECEIPT_SPOT = { x: 1490, y: COUNTER_TOP - 8 };

export const BENCH = {
  x: 1710,
  y: COUNTER_TOP + Math.floor((COUNTER_FRONT - COUNTER_TOP) / 2),
};
/** Square window whose sill sits on the bench. */
export const WINDOW = { x: BENCH.x, w: 288, h: 288 };
export const DRIVER = { x: WINDOW.x, y: BENCH.y + 64 };

export const DOOR = { x: 132, y: 980 };
export const DOOR_W = 192;
export const DOOR_H = 380;

export const CUSTOMER_SPOT = { x: 900, y: 980 };
export const CUSTOMER_BUBBLE_Y = CUSTOMER_SPOT.y - Math.round(PERSON_NATIVE_H * PEOPLE_SCALE) - 10;

export const TV_COUNT = 3;
export const TV_COLS = 3;
export const TV_ROWS = 1;
export const STRAINS_PER_TV = 3;
export const TV_W = 184;
export const TV_H = 228;
export const TV_GAP_X = 12;
export const TV_GAP_Y = 0;
export const TV_GRID_W = TV_COLS * TV_W + (TV_COLS - 1) * TV_GAP_X;
export const TV_GRID_H = TV_ROWS * TV_H + Math.max(0, TV_ROWS - 1) * TV_GAP_Y;
/** Centered over the budtender, clear of the staff door and orders board. */
export const TV_GRID_LEFT = Math.floor(KEYLEAD.x - TV_GRID_W / 2);
export const TV_GRID_TOP = 112;
export const TV_Y = TV_GRID_TOP + TV_H / 2;

/** Orders board sits on the right, clear of the TVs and the window. */
export const TABLET_W = 280;
export const TABLET_H = 328;
export const TABLET_INSET = 8;
export const TABLET_HEADER_H = 40;
export const TABLET = {
  x: WINDOW.x - WINDOW.w / 2 - 68 - TABLET_W / 2,
  y: TV_GRID_TOP + TABLET_H / 2,
};

export function tabletLayout() {
  const left = TABLET.x - TABLET_W / 2;
  const top = TABLET.y - TABLET_H / 2;
  return {
    left,
    top,
    w: TABLET_W,
    h: TABLET_H,
    screenLeft: left + TABLET_INSET,
    screenTop: top + TABLET_INSET,
    screenW: TABLET_W - TABLET_INSET * 2,
    screenH: TABLET_H - TABLET_INSET * 2,
    headerH: TABLET_HEADER_H,
  };
}

export function tvPos(index: number): { x: number; y: number } {
  const col = index % TV_COLS;
  const row = Math.floor(index / TV_COLS);
  return {
    x: TV_GRID_LEFT + TV_W / 2 + col * (TV_W + TV_GAP_X),
    y: TV_GRID_TOP + TV_H / 2 + row * (TV_H + TV_GAP_Y),
  };
}

export function tvX(index: number): number {
  return tvPos(index).x;
}

export function strainSlotH(): number {
  return Math.floor((TV_H - 20) / STRAINS_PER_TV);
}

/** Screen position of a catalog strain on its TV. */
export function strainPos(index: number): { x: number; y: number } {
  const tv = Math.floor(index / STRAINS_PER_TV);
  const slot = index % STRAINS_PER_TV;
  const p = tvPos(tv);
  const slotH = strainSlotH();
  const blockTop = p.y - TV_H / 2 + 10;
  return { x: p.x, y: blockTop + slot * slotH + slotH / 2 };
}

/** @deprecated jars are wall TVs now */
export const JAR_Y = TV_Y;
export const COUNTER_BAG = PACK_SPOT;
export function jarX(index: number): number {
  return tvX(index);
}
