import { isPackedOnCounter, type Order, type OrderType } from "../sim/orders";
import { isSlaUrgent, receiptOverflowLine, receiptSlipLine } from "./copy";

/** What the receipt rail needs to know about an order. */
export interface ReceiptOrder {
  id: string;
  type: OrderType;
  status: Order["status"];
  destLabel: string;
  customerName: string;
  slaRemainingMs: number | null;
  createdAtGameMs: number;
}

export type ReceiptKind = "delivery" | "pickup" | "more";

export interface ReceiptSlip {
  id: string;
  kind: ReceiptKind;
  line: string;
  urgent: boolean;
}

export interface ReadyTally {
  delivery: number;
  pickup: number;
  /** Any packed delivery inside its urgent window — the rail and chip go danger. */
  urgent: boolean;
}

/** Packed bags on the counter, oldest ticket first. */
export function readyOnCounter<T extends ReceiptOrder>(orders: T[]): T[] {
  return orders
    .filter((o) => isPackedOnCounter(o))
    .sort((a, b) => a.createdAtGameMs - b.createdAtGameMs || a.id.localeCompare(b.id));
}

/** Counts behind the tally chip: bags for the van, bags waiting on the pickup shelf. */
export function readyTally(orders: ReceiptOrder[]): ReadyTally {
  const ready = readyOnCounter(orders);
  const delivery = ready.filter((o) => o.type === "delivery");
  return {
    delivery: delivery.length,
    pickup: ready.length - delivery.length,
    urgent: delivery.some((o) => isSlaUrgent(o.slaRemainingMs)),
  };
}

/**
 * One slip per packed bag, oldest at the top down to newest at the bottom. Past
 * `maxRows` the newest slips collapse into a `+N more` row so the oldest — the
 * ones about to run late — stay on the rail.
 */
export function receiptSlips(orders: ReceiptOrder[], maxRows: number): ReceiptSlip[] {
  const ready = readyOnCounter(orders);
  if (maxRows <= 0) return [];
  if (ready.length <= maxRows) return ready.map(slipFor);
  const shown = ready.slice(0, maxRows - 1).map(slipFor);
  return [...shown, { id: "more", kind: "more", line: receiptOverflowLine(ready.length - shown.length), urgent: false }];
}

function slipFor(order: ReceiptOrder): ReceiptSlip {
  // Pickup timers count the customer's walk-in, not lateness — no clock on the slip.
  if (order.type !== "delivery") {
    return { id: order.id, kind: "pickup", line: receiptSlipLine(order.destLabel, order.customerName, null), urgent: false };
  }
  return {
    id: order.id,
    kind: "delivery",
    line: receiptSlipLine(order.destLabel, order.customerName, order.slaRemainingMs),
    urgent: isSlaUrgent(order.slaRemainingMs),
  };
}