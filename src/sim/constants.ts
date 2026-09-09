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
export const VEHICLE_SPEED = 380;
export const HANDOFF_RADIUS = 160;
/** Snap into a parking stall once this close to the pad center. */
export const PARK_ARRIVE_RADIUS = 70;
/**
 * How fast the van squares up in its stall, in rad/s. The driver is still at the wheel
 * and the camera is still on them, so the last quarter turn is a turn, not a snap. A
 * linear rate rather than an exponential ease so it lands exactly on the parked heading
 * in bounded time — 90° in a quarter of a second — instead of only ever approaching it.
 */
export const PARK_TURN_RATE = 6.4;
export const DOOR_HAND_RADIUS = 80;
export const CALL_CONNECT_MS = 1_800;
export const DROPOFF_WALK_SPEED = 160;
export const DRIVER_WALK_SPEED = 200;
export const NPC_INTERACT_COOLDOWN_MS = 360;
export const KEYLEAD_WALK_SPEED = 620;
export const BACKROOM_MS = 420;

/** Incoming tablet tickets arrive in waves of 1–2. */
export const TABLET_QUEUE_MAX = 6;
/** The beat the tablet was originally paced to: a wave every 10–58s. */
const TICKET_WAVE_BASE_MIN_MS = 10_000;
const TICKET_WAVE_BASE_MAX_MS = 58_000;
/**
 * Tablet work arrives slower than the original 10–58s beat. First pass: three quarters
 * of that rate (gap ×4/3). This pass: another 15% slower (rate ×0.85 → gaps /0.85), so
 * overall rate is 0.75×0.85 of the original. Stretching the gap rather than thinning the
 * waves keeps a wave worth 1–2 jobs — there is simply more room between them. Waves land
 * every ~15.7–91.0s, averaging one every ~53.3s: about 1.7 tickets a minute.
 */
export const TICKET_WAVE_GAP_SCALE = (4 / 3) / 0.85;
export const TICKET_WAVE_MIN_MS = Math.round(TICKET_WAVE_BASE_MIN_MS * TICKET_WAVE_GAP_SCALE);
export const TICKET_WAVE_MAX_MS = Math.round(TICKET_WAVE_BASE_MAX_MS * TICKET_WAVE_GAP_SCALE);
/** The opening beat is scripted onboarding, not steady-state pacing — left at its old pace. */
export const FIRST_TICKET_WAVE_MS = 2_000;
/**
 * Foot traffic through the front door, slowed in lockstep with the tablet so the walk-in
 * / pickup / delivery mix stays put. Never two walk-ins at once — a walk-in is the only
 * order with a person on the floor who leaves angry.
 */
const WALKIN_GAP_BASE_MIN_MS = 24_000;
const WALKIN_GAP_BASE_MAX_MS = 60_000;
/** Same 15% slowdown as {@link TICKET_WAVE_GAP_SCALE}'s latest pass. */
export const WALKIN_GAP_SCALE = 1 / 0.85;
export const WALKIN_GAP_MIN_MS = Math.round(WALKIN_GAP_BASE_MIN_MS * WALKIN_GAP_SCALE);
export const WALKIN_GAP_MAX_MS = Math.round(WALKIN_GAP_BASE_MAX_MS * WALKIN_GAP_SCALE);
/** The first unscripted walk-in waits out the opening beats and the first ticket wave. */
export const FIRST_WALKIN_MS = 12_000;

/**
 * Covering the counter alone, the key lead is one person with one pair of hands. Every
 * other job already waiting is one more thing on their mind before they look up and
 * notice somebody new standing there. One job in front of them and they turn round as
 * fast as they always did; deep enough and a walk-in's patience runs out first.
 */
export const COVER_NOTICE_STEP_MS = 2_600;
/**
 * Past this depth the counter is as far gone as it gets — misery stops compounding.
 * Set clear of the walk-in threshold so the ramp is graded: a pickup's shorter fuse
 * burns out first, a walk-in's a job or two later, rather than everything at one cliff.
 */
export const COVER_NOTICE_MAX_STEPS = 9;
/** How long the cover readout names the customer who just left. */
export const COVER_LOSS_LINE_MS = 5_000;
/** Scripted opening beats: walk-in, pickup, then two deliveries — one gap apart. */
export const OPENING_ORDER_GAP_MS = 8_000;
export const OPENING_FIRST_AT_MS = 400;

export const SCORE_INSTORE = 10;
export const SCORE_PICKUP = 10;
export const SCORE_DELIVERY_ON_TIME = 25;
export const SCORE_DELIVERY_LATE = -10;
export const SCORE_FAIL = -5;
