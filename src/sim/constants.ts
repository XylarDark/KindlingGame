export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

/** One game minute = 2 real seconds. One session is the 9am–11pm shop day. */
export const MS_PER_GAME_MINUTE = 2_000;
export const MS_PER_GAME_HOUR = 60 * MS_PER_GAME_MINUTE;
export const GAME_START_HOUR = 9;
export const GAME_END_HOUR = 23;
export const SHIFT_MS = (GAME_END_HOUR - GAME_START_HOUR) * MS_PER_GAME_HOUR;

export const PICKUP_ARRIVE_MS = 8_000;
export const PICKUP_HANDOFF_WAIT_MS = 12_000;
export const INSTORE_WALKOUT_MS = 18_000;

export const CUSTOMER_SPEED = 220;
export const VEHICLE_SPEED = 288;
export const HANDOFF_RADIUS = 112;
export const DOOR_HAND_RADIUS = 80;
export const CALL_CONNECT_MS = 1_800;
export const DROPOFF_WALK_SPEED = 160;
export const DRIVER_WALK_SPEED = 200;
export const NPC_INTERACT_COOLDOWN_MS = 360;
export const KEYLEAD_WALK_SPEED = 620;
export const BACKROOM_MS = 420;

/** Incoming tablet tickets arrive in waves of 1–2, 10–60s apart. */
export const TABLET_QUEUE_MAX = 6;
export const TICKET_WAVE_MIN_MS = 10_000;
export const TICKET_WAVE_MAX_MS = 60_000;
export const FIRST_TICKET_WAVE_MS = 2_000;

export const SCORE_INSTORE = 10;
export const SCORE_PICKUP = 10;
export const SCORE_DELIVERY_ON_TIME = 25;
export const SCORE_DELIVERY_LATE = -10;
export const SCORE_FAIL = -5;
