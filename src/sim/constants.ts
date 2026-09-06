export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

/** One game minute = 1 real second. One session is the 9am–11pm shop day. */
export const MS_PER_GAME_MINUTE = 1_000;
export const MS_PER_GAME_HOUR = 60 * MS_PER_GAME_MINUTE;
export const GAME_START_HOUR = 9;
export const GAME_END_HOUR = 23;
export const SHIFT_MS = (GAME_END_HOUR - GAME_START_HOUR) * MS_PER_GAME_HOUR;

export const PICKUP_ARRIVE_MS = 8_000;
export const PICKUP_HANDOFF_WAIT_MS = 12_000;
export const INSTORE_WALKOUT_MS = 18_000;

export const CUSTOMER_SPEED = 220;
/** px/s — ~5% under the prior 380 for tighter lane control. */
export const VEHICLE_SPEED = 361;
export const HANDOFF_RADIUS = 160;
/** Snap into a parking stall once this close to the pad center. */
export const PARK_ARRIVE_RADIUS = 70;
export const DOOR_HAND_RADIUS = 80;
export const CALL_CONNECT_MS = 1_800;
export const DROPOFF_WALK_SPEED = 160;
export const DRIVER_WALK_SPEED = 200;
export const NPC_INTERACT_COOLDOWN_MS = 360;
export const KEYLEAD_WALK_SPEED = 620;
export const BACKROOM_MS = 420;

/** Incoming tablet tickets arrive in waves of 1–2, 10–58s apart. */
export const TABLET_QUEUE_MAX = 6;
export const TICKET_WAVE_MIN_MS = 10_000;
export const TICKET_WAVE_MAX_MS = 58_000;
export const FIRST_TICKET_WAVE_MS = 2_000;
/** Scripted opening beats: walk-in, pickup, then two deliveries — one gap apart. */
export const OPENING_ORDER_GAP_MS = 8_000;
export const OPENING_FIRST_AT_MS = 400;

export const SCORE_INSTORE = 10;
export const SCORE_PICKUP = 10;
export const SCORE_DELIVERY_ON_TIME = 25;
export const SCORE_DELIVERY_LATE = -10;
export const SCORE_FAIL = -5;
