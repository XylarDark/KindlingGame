import { PERSON_W } from "../art/peopleSize";
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

/** Shirt mark sits above the laminate; head stays under the TVs. */
export const KEYLEAD = { x: COUNTER_MID, y: COUNTER_TOP + 68 };

const COUNTER_SIGN_H = 64;
/** Shade band + painted edge along the bottom of the counter face. */
export const COUNTER_FACE_SHADE_H = 28;
/**
 * Shop sign on the counter face, centred under the key lead — and centred in the
 * clean face above the bottom shade band, not in the full face. `y` is its middle.
 * The HUD score and clock hang off this box, so the whole group rides together.
 */
export const COUNTER_SIGN = {
  x: KEYLEAD.x,
  y: COUNTER_TOP + Math.floor((COUNTER_FRONT - COUNTER_FACE_SHADE_H - COUNTER_TOP) / 2),
  w: 320,
  h: COUNTER_SIGN_H,
};

export const BACK_DOOR_W = 200;
export const BACK_DOOR_H = 372;
export const BACK_DOOR = { x: 400 + (COUNTER_LEFT - 256), y: KEYLEAD.y };
/** Bag supply on the key-lead's right; the planter balances it on their left. */
export const BAG_STACK = { x: KEYLEAD.x + 190, y: COUNTER_TOP };
export const COUNTER_PLANT = { x: KEYLEAD.x - 220, y: COUNTER_TOP };
/** Where slips print. The receipt rail hangs off the counter under this spot. */
export const RECEIPT_SPOT = { x: COUNTER_RIGHT - 48, y: COUNTER_TOP };
/**
 * Counter bags print their label on their own face, so they bake wider than the
 * road bag and draw 1:1 (see `counterBag` in pixelArt). The pass-through sill
 * caps the height, so all the room for type had to come from width.
 */
export const COUNTER_BAG_W = 112;
export const COUNTER_BAG_H = 84;
/**
 * The printed panel on a counter bag's face, as offsets from the sprite's
 * bottom-centre origin. The live count owns the upper band; the baked
 * DELIVERY / PICKUP word owns the shorter band beneath it.
 */
export const BAG_PANEL = { w: 80, countCy: -43, countH: 34 };

/** Packed deliveries pile at the counter's right end; pickups tuck in behind. */
export const READY_BAG = { x: COUNTER_RIGHT - 248, y: COUNTER_TOP };
export const PICKUP_BAG = { x: READY_BAG.x + 104, y: COUNTER_TOP };

/**
 * Receipts clipped to the counter face under the slip spot: one row per packed
 * bag, oldest at the top. The left edge has to clear the HUD clock readout.
 */
export const RECEIPT_RAIL = {
  right: RECEIPT_SPOT.x + 32,
  top: COUNTER_TOP + 2,
  w: 252,
  pad: 4,
  rowH: 18,
  maxRows: 6,
  /** Row text starts right of the pickup / delivery accent tab. */
  inset: 22,
};

export function receiptRailBox(rowCount: number): { left: number; top: number; w: number; h: number } {
  return {
    left: RECEIPT_RAIL.right - RECEIPT_RAIL.w,
    top: RECEIPT_RAIL.top,
    w: RECEIPT_RAIL.w,
    h: RECEIPT_RAIL.pad * 2 + Math.max(1, rowCount) * RECEIPT_RAIL.rowH,
  };
}

/** Middle of row `index`, counting from the oldest slip at the top. */
export function receiptRowY(index: number): number {
  return RECEIPT_RAIL.top + RECEIPT_RAIL.pad + index * RECEIPT_RAIL.rowH + RECEIPT_RAIL.rowH / 2;
}

export const BENCH_INSET = 0;
export const BENCH_LEFT = COUNTER_RIGHT;
export const BENCH_W = GAME_WIDTH - BENCH_INSET - BENCH_LEFT;
export const BENCH = {
  x: BENCH_LEFT + Math.floor(BENCH_W / 2),
  y: COUNTER_TOP + Math.floor((COUNTER_FRONT - COUNTER_TOP) / 2),
};
/**
 * Air under the counter lip that belongs to customer speech, and nothing else.
 *
 * Chips used to hang at the middle of the customer they belonged to, which reads as a
 * sticker across the model rather than as speech. There was nowhere else for them to go:
 * the lobby is 250px deep, a standing person draws {@link PERSON_DISPLAY_H}, and the
 * counter face above is already carrying the shop sign and the HUD readouts. So the queue
 * stands a band lower and the air above their hair is reserved. Cropping the lobby at the
 * chest is the perspective the cutaway already implies — these people are nearer the
 * camera than the staff behind the counter, and their feet were off-frame before this.
 *
 * Sized off a two-line chip at the message step plus its padding, measured at 66px.
 */
export const CUSTOMER_SPEECH_H = 66;
/** Daylight between the bottom of a chip and the hair beneath it. */
export const CUSTOMER_SPEECH_GAP = 10;
/**
 * The line every chip hangs from: its **bottom** edge, not its middle. A box grows
 * downward from its centre as copy wraps, so anchoring the centre is what let a two-line
 * callout reach a face that a one-liner cleared.
 */
export const CUSTOMER_SPEECH_BASE = COUNTER_FRONT + 2 + CUSTOMER_SPEECH_H;
/** Feet on the lobby boards; hair clears the speech band above it. */
export const CUSTOMER_SPOT = {
  x: COUNTER_MID,
  y: CUSTOMER_SPEECH_BASE + CUSTOMER_SPEECH_GAP + PERSON_DISPLAY_H,
};
/** Bubbles must clear the lobby sandwich board on the far left. */
export const CUSTOMER_BUBBLE_MIN_X = 300;

export const DOOR_W = 200;
export const DOOR_H = 372;
/** Street door sat in the old bay; shifted left 5%, then nudged back toward the counter. */
export const DOOR = {
  x: Math.floor(DOOR_W / 2 + (COUNTER_LEFT_PREV - DOOR_W) / 2) - SCREEN_5 + 36,
  y: CUSTOMER_SPOT.y,
};

/**
 * Standing room per customer. People bake 192 wide and draw at {@link PEOPLE_SCALE},
 * so this is the shoulder-to-shoulder figure plus a hand's width of daylight — the
 * pitch below cannot go under it without sprites touching.
 */
export const PERSON_DISPLAY_W = Math.round(PERSON_W * PEOPLE_SCALE);
export const CUSTOMER_SLOT_PITCH = PERSON_DISPLAY_W + 16;

/**
 * Where the `index`-th customer on the floor stands: the first arrival takes the counter
 * spot and the rest queue back toward the street door they came in through.
 *
 * The line runs doorward rather than fanning out either side of the counter, because
 * every slot then sits on the way in. A customer's walk is at most the one to the
 * counter spot and usually shorter, so nobody now waits longer to be served than they
 * did when the whole floor stood on one spot — which matters: the NPC key lead's cover
 * loop only starts on a customer once they have stopped walking, and the shift's timing
 * is tuned against that.
 */
export function customerSlotX(index: number): number {
  return CUSTOMER_SPOT.x - index * CUSTOMER_SLOT_PITCH;
}

/** Daylight left between one chip and the next. */
export const CUSTOMER_SPEECH_PAD = 8;
/** Widest a chip draws when the floor is quiet enough to give it the room. */
export const CUSTOMER_SPEECH_MAX_W = 328;
/** What a chip gets when the neighbouring slot is taken: the pitch, less the daylight. */
export const CUSTOMER_SPEECH_MIN_W = CUSTOMER_SLOT_PITCH - CUSTOMER_SPEECH_PAD;

/**
 * How wide a chip may draw, given the distance to the nearest other customer on the floor.
 *
 * Every chip shares one row, so width is the only thing keeping two of them apart, and a
 * chip centred on its owner cannot reach a neighbour's while it stays inside the gap
 * between them. Reading the room off the live distance rather than off the slot pitch is
 * what lets a lone customer have the whole box for their order and a full floor tighten
 * up: the copy shrinks to fit rather than being clipped.
 */
export function customerSpeechWidth(nearestGap: number): number {
  if (!Number.isFinite(nearestGap)) return CUSTOMER_SPEECH_MAX_W;
  const room = nearestGap - CUSTOMER_SPEECH_PAD;
  return Math.max(CUSTOMER_SPEECH_MIN_W, Math.min(CUSTOMER_SPEECH_MAX_W, room));
}

/**
 * Whether a chip shows at all.
 *
 * Width alone keeps chips apart once everyone is standing on a slot, because the slots are
 * a pitch apart and {@link CUSTOMER_SPEECH_MIN_W} fits inside that. It cannot hold for
 * someone still crossing the floor, who passes within a body's width of every customer
 * already served. Their speech waits until they have found their spot instead of sliding
 * under a neighbour's — the arrival toast already says they are on their way in.
 */
export function customerSpeechShows(settled: boolean, nearestGap: number): boolean {
  return settled || nearestGap >= CUSTOMER_SLOT_PITCH;
}

export const TV_COUNT = 3;
export const TV_COLS = 3;
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
export const CEILING_POT_LEFT = 150;
export const CEILING_POT_RIGHT = 1760;
/** Menu TVs centered over the key-lead. */
export const TV_GRID_MID = KEYLEAD.x;
export const TV_GRID_LEFT = Math.floor(TV_GRID_MID - TV_GRID_W / 2);
/** Keep the bank on the wall under the cans; shorter height lifts the bottom slightly. */
export const TV_GRID_TOP = TV_BASE_TOP + TV_BASE_H - TV_H;

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
/** 2% wider for easier driver taps on mobile. */
const WINDOW_TAP_W = Math.round(WINDOW_BASE_W * 1.02);
/** Another 5% of glass, added to the right edge only — left jamb stays put. */
const WINDOW_RIGHT_GROW = Math.round(WINDOW_TAP_W * 0.05);
/** A further 5%, right edge again. Even px so the left jamb keeps its whole-pixel column. */
const WINDOW_RIGHT_GROW_2 = 2 * Math.round(((WINDOW_TAP_W + WINDOW_RIGHT_GROW) * 0.05) / 2);
/** All right-side growth so far; `x` shifts by half of it so only the right edge moves. */
const WINDOW_RIGHT_TOTAL = WINDOW_RIGHT_GROW + WINDOW_RIGHT_GROW_2;
export const WINDOW = {
  x: WINDOW_BASE_MID + Math.round(WINDOW_RIGHT_TOTAL / 2),
  w: WINDOW_TAP_W + WINDOW_RIGHT_TOTAL,
  h: BENCH.y - WINDOW_CLEAR - WINDOW_TOP,
};
/** Driver keeps their original spot; only the glass grew. */
export const DRIVER = { x: WINDOW_BASE_MID, y: BENCH.y + 48 };

export const TABLET_W = 176;
export const TABLET_H = 112;
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

/** Five cans, even gaps across the ceiling band. Not locked to TV centers. */
export function ceilingPots(): number[] {
  const n = 5;
  const span = CEILING_POT_RIGHT - CEILING_POT_LEFT;
  return Array.from({ length: n }, (_, i) => Math.round(CEILING_POT_LEFT + (span * i) / (n - 1)));
}
