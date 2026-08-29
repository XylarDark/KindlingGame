import {
  MS_PER_GAME_HOUR,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
} from "./constants";
import type { Order } from "./orders";

export function scoreForComplete(order: Order, gameMs: number): number {
  if (order.type === "inStore") return SCORE_INSTORE;
  if (order.type === "pickup") return SCORE_PICKUP;
  if (order.type === "delivery") {
    return isDeliveryLate(order, gameMs) ? SCORE_DELIVERY_LATE : SCORE_DELIVERY_ON_TIME;
  }
  return 0;
}

export function scoreForFail(): number {
  return SCORE_FAIL;
}

export function isDeliveryLate(order: Order, gameMs: number): boolean {
  if (order.type !== "delivery" || order.slaStartGameMs === undefined) return false;
  return gameMs - order.slaStartGameMs > MS_PER_GAME_HOUR;
}

export function deliverySlaRemainingMs(order: Order, gameMs: number): number | null {
  if (order.type !== "delivery" || order.slaStartGameMs === undefined) return null;
  return MS_PER_GAME_HOUR - (gameMs - order.slaStartGameMs);
}
