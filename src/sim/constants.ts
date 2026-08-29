export const GAME_WIDTH = 1920;
export const GAME_HEIGHT = 1080;

export const MS_PER_GAME_HOUR = 60_000;
export const GAME_START_HOUR = 10;

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

/** Incoming tickets arrive at 12.5% of the original T0 cadence. */
export const ORDER_ARRIVAL_RATE = 0.125;
export const ORDER_AUTO_SPAWN_MS = 14_000 / ORDER_ARRIVAL_RATE;

export const SCORE_INSTORE = 10;
export const SCORE_PICKUP = 10;
export const SCORE_DELIVERY_ON_TIME = 25;
export const SCORE_DELIVERY_LATE = -10;
export const SCORE_FAIL = -5;
