import { GAME_WIDTH } from "../sim/constants";

/** Shop cutaway at 1920×1080. Staff behind the counter; lobby in front. */
export const FLOOR_Y = 830;
/** Dropped ~5% of the screen so the wall can hold wider TVs. */
export const COUNTER_TOP = 710;
export const COUNTER_FRONT = 830;
/** Original slab 256–1504; left was pushed right 15% to widen the door bay. */
const SCREEN_5 = Math.round(GAME_WIDTH * 0.05);
const COUNTER_LEFT_WIDE = 256 + Math.round((1504 - 256) * 0.15);
const COUNTER_LEFT_PREV = Math.round(COUNTER_LEFT_WIDE * 0.9);
const COUNTER_RIGHT_PREV = 1504 - SCREEN_5;
/** Previous 399–1408 slab, grown 5% of the screen on each end. */
export const COUNTER_LEFT = COUNTER_LEFT_PREV - SCREEN_5;
export const COUNTER_RIGHT = COUNTER_RIGHT_PREV + SCREEN_5;
export const COUNTER_MID = Math.floor((COUNTER_LEFT + COUNTER_RIGHT) / 2);

/**
 * Standing people bake at 192×352. Scale fits the lobby under the
 * counter; another 15% up so the models fill the shirt and hat marks.
 */
export const PERSON_NATIVE_H = 352;
export const PEOPLE_SCALE = 0.873;
export const BAG_SCALE = 0.7;
export const PERSON_DISPLAY_H = Math.round(PERSON_NATIVE_H * PEOPLE_SCALE);

/** HUD text sits in the corners; wall props tuck under the ceiling band. */
export const WALL_PROP_TOP = 44;

/** Shirt mark sits above the laminate; head stays under the TVs. */
export const KEYLEAD = { x: COUNTER_MID, y: COUNTER_TOP + 68 };

export const BACK_DOOR_W = 200;
export const BACK_DOOR_H = 372;
export const BACK_DOOR = { x: 400 + (COUNTER_LEFT - 256), y: KEYLEAD.y };
export const BAG_STACK = { x: KEYLEAD.x - 220, y: COUNTER_TOP };
export const PACK_SPOT = { x: COUNTER_RIGHT - 120, y: COUNTER_TOP };
export const RECEIPT_SPOT = { x: COUNTER_RIGHT - 48, y: COUNTER_TOP - 8 };
/** Packed bags on the right of the counter; labels need a full slot between them. */
export const OUT_BAG_GAP = 160;
export const OUT_BAG_RIGHT = COUNTER_RIGHT - 64;

/** Label sits 10% of bag height above the sprite top. */
export function bagCaptionY(footY: number): number {
  const bagH = Math.round(120 * BAG_SCALE);
  return footY - bagH - Math.round(bagH * 0.1) - 8;
}

export const BENCH_INSET = 0;
export const BENCH_LEFT = COUNTER_RIGHT;
export const BENCH_W = GAME_WIDTH - BENCH_INSET - BENCH_LEFT;
export const BENCH = {
  x: BENCH_LEFT + Math.floor(BENCH_W / 2),
  y: COUNTER_TOP + Math.floor((COUNTER_FRONT - COUNTER_TOP) / 2),
};
export const DOOR_W = 200;
export const DOOR_H = 372;
/** Street door sat in the old bay; shifted left 5%, then nudged back toward the counter. */
export const DOOR = {
  x: Math.floor(DOOR_W / 2 + (COUNTER_LEFT_PREV - DOOR_W) / 2) - SCREEN_5 + 36,
  y: COUNTER_FRONT + PERSON_DISPLAY_H + 2,
};
/** Street and staff door lintel — windows no longer share this. */
export const FRAME_TOP = COUNTER_FRONT - DOOR_H;

/** Feet on the lobby boards; head stays just below the counter front. */
export const CUSTOMER_SPOT = { x: COUNTER_MID, y: COUNTER_FRONT + PERSON_DISPLAY_H + 2 };
/** Speech sits in the lobby, left of the walk-in — not on their head or the plaque. */
export const CUSTOMER_BUBBLE_DX = -220;
export const CUSTOMER_BUBBLE_Y = COUNTER_FRONT + 96;

export const TV_COUNT = 3;
export const TV_COLS = 3;
export const TV_ROWS = 1;
export const STRAINS_PER_TV = 3;
/** 15% larger than the original 304×220 bank, then 5% shorter for headroom. */
const TV_BASE_W = 304;
const TV_BASE_H = 220;
const TV_BASE_TOP = 152;
const TV_SCALE = 1.15;
export const TV_W = Math.round(TV_BASE_W * TV_SCALE);
export const TV_H = Math.round(TV_BASE_H * TV_SCALE * 0.95);
/** Chassis-to-chassis wall; ~32px of plaster shows after the 4px sit-on-wall reveal. */
export const TV_GAP_X = 40;
export const TV_GAP_Y = 0;
/** Dark bezel / recessed-glass inset. Keep strain slots inside this. */
export const TV_BEZEL = Math.round(16 * TV_SCALE);
export const TV_GRID_W = TV_COLS * TV_W + (TV_COLS - 1) * TV_GAP_X;
export const TV_GRID_H = TV_ROWS * TV_H + Math.max(0, TV_ROWS - 1) * TV_GAP_Y;
export const CEILING_POT_LEFT = 150;
export const CEILING_POT_RIGHT = 1760;
/** Menu TVs centered over the key-lead. */
export const TV_GRID_MID = KEYLEAD.x;
export const TV_GRID_LEFT = Math.floor(TV_GRID_MID - TV_GRID_W / 2);
/** Keep the bank on the wall under the cans; shorter height lifts the bottom slightly. */
export const TV_GRID_TOP = TV_BASE_TOP + TV_BASE_H - TV_H;
export const TV_Y = TV_GRID_TOP + TV_H / 2;

/** Grey-over-white chair rail; the pass-through oak sill sits on this band. */
export const CHAIR_RAIL_Y = COUNTER_TOP - 114;
export const CHAIR_RAIL_GREY_H = 8;
export const CHAIR_RAIL_WHITE_H = 8;
export const CHAIR_RAIL_H = CHAIR_RAIL_GREY_H + CHAIR_RAIL_WHITE_H;

/** Shared lintel for the pass-through and driver windows, under the TVs. */
export const WINDOW_TOP = TV_GRID_TOP + TV_H + 40;
/** Keep the street-window bottom clear of the driver pillow. */
export const WINDOW_CLEAR = 48;
/** Wall between the pass-through / counter corner and the delivery glass. */
export const WINDOW_LEFT_INSET = 24;
export const WINDOW_RIGHT_INSET = 76;
const WINDOW_BASE_W = GAME_WIDTH - BENCH_LEFT - WINDOW_LEFT_INSET - WINDOW_RIGHT_INSET;
const WINDOW_BASE_MID = BENCH_LEFT + WINDOW_LEFT_INSET + Math.floor(WINDOW_BASE_W / 2);
export const WINDOW = {
  x: WINDOW_BASE_MID,
  /** 2% wider for easier driver taps on mobile. */
  w: Math.round(WINDOW_BASE_W * 1.02),
  h: BENCH.y - WINDOW_CLEAR - WINDOW_TOP,
};
export const DRIVER = { x: WINDOW.x, y: BENCH.y + 48 };
export const WINDOW_MID = WINDOW_TOP + Math.floor(WINDOW.h / 2);

export const TABLET_W = 176;
export const TABLET_H = 112;
export const TABLET_INSET = 10;
export const TABLET_HEADER_H = 16;
export const TABLET_HOME_H = 0;
/** Oak shelf flush with the chair rail. */
export const SILL_H = CHAIR_RAIL_H + 2;
export const SILL_Y = CHAIR_RAIL_Y;
/**
 * Pass-through into the product room. Opening sits under the TVs with a
 * wider gap from the key-lead, and stops at the oak sill so stock only
 * shows in the window.
 */
export const PASS_WINDOW = {
  x: KEYLEAD.x + 360,
  y: WINDOW_TOP,
  w: 400,
  h: SILL_Y - WINDOW_TOP,
};
/** Landscape iPad sitting on the product-room sill. */
export const TABLET = {
  x: PASS_WINDOW.x,
  y: SILL_Y + 2 - TABLET_H / 2,
};

export function tabletLayout() {
  const left = TABLET.x - TABLET_W / 2;
  const top = TABLET.y - TABLET_H / 2;
  const side = 16;
  const cap = 8;
  return {
    left,
    top,
    w: TABLET_W,
    h: TABLET_H,
    screenLeft: left + side,
    screenTop: top + cap,
    screenW: TABLET_W - side * 2,
    screenH: TABLET_H - cap * 2,
    headerH: TABLET_HEADER_H,
    homeH: TABLET_HOME_H,
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
  return Math.floor((TV_H - TV_BEZEL * 2) / STRAINS_PER_TV);
}

export function strainPos(index: number): { x: number; y: number } {
  const tv = Math.floor(index / STRAINS_PER_TV);
  const slot = index % STRAINS_PER_TV;
  const p = tvPos(tv);
  const slotH = strainSlotH();
  const blockTop = p.y - TV_H / 2 + TV_BEZEL;
  return { x: p.x, y: blockTop + slot * slotH + slotH / 2 };
}

export const JAR_Y = TV_Y;
export const COUNTER_BAG = PACK_SPOT;
export function jarX(index: number): number {
  return tvX(index);
}

/** Five cans, even gaps across the ceiling band. Not locked to TV centers. */
export function ceilingPots(): number[] {
  const n = 5;
  const span = CEILING_POT_RIGHT - CEILING_POT_LEFT;
  return Array.from({ length: n }, (_, i) => Math.round(CEILING_POT_LEFT + (span * i) / (n - 1)));
}
