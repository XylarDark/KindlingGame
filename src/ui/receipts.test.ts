import { describe, expect, it } from "vitest";
import { MS_PER_GAME_MINUTE, TABLET_QUEUE_MAX } from "../sim/constants";
import type { OrderStatus, OrderType } from "../sim/orders";
import { readyOnCounter, readyTally, receiptSlips, type ReceiptOrder } from "./receipts";

const MAX_ROWS = 6;

function order(
  id: string,
  type: OrderType,
  status: OrderStatus,
  createdAtGameMs: number,
  slaRemainingMs: number | null = null,
): ReceiptOrder {
  return {
    id,
    type,
    status,
    destLabel: type === "delivery" ? `House ${id.replace(/\D/g, "")}` : "Pickup",
    customerName: `Cust ${id}`,
    slaRemainingMs,
    createdAtGameMs,
  };
}

describe("receipt rail", () => {
  it("keeps only packed bags, oldest ticket at the top", () => {
    const orders = [
      order("o3", "delivery", "inBin", 3_000),
      order("o1", "pickup", "onPickupShelf", 1_000),
      order("o5", "delivery", "queued", 500),
      order("o2", "pickup", "readyForHandoff", 2_000),
      order("o6", "delivery", "onRun", 100),
      order("o4", "delivery", "carrying", 4_000),
    ];
    expect(readyOnCounter(orders).map((o) => o.id)).toEqual(["o1", "o2", "o3"]);
  });

  it("breaks ties on id so the stack never reshuffles frame to frame", () => {
    const orders = [order("b", "delivery", "inBin", 1_000), order("a", "delivery", "inBin", 1_000)];
    expect(readyOnCounter(orders).map((o) => o.id)).toEqual(["a", "b"]);
  });

  it("counts delivery and pickup bags apart, and flags an urgent delivery", () => {
    const orders = [
      order("o1", "delivery", "inBin", 1_000, 40 * MS_PER_GAME_MINUTE),
      order("o2", "delivery", "inBin", 2_000, 30 * MS_PER_GAME_MINUTE),
      order("o3", "pickup", "onPickupShelf", 3_000),
      order("o4", "delivery", "queued", 4_000, 5 * MS_PER_GAME_MINUTE),
    ];
    expect(readyTally(orders)).toEqual({ delivery: 2, pickup: 1, urgent: false });

    orders[1] = order("o2", "delivery", "inBin", 2_000, 4 * MS_PER_GAME_MINUTE);
    expect(readyTally(orders)).toEqual({ delivery: 2, pickup: 1, urgent: true });
    expect(readyTally([])).toEqual({ delivery: 0, pickup: 0, urgent: false });
  });

  it("labels slips by kind and marks the urgent ones", () => {
    const slips = receiptSlips(
      [
        order("o1", "delivery", "inBin", 1_000, 47 * MS_PER_GAME_MINUTE),
        order("o2", "delivery", "inBin", 2_000, -1),
        order("o3", "pickup", "onPickupShelf", 3_000, 6 * MS_PER_GAME_MINUTE),
      ],
      MAX_ROWS,
    );
    expect(slips.map((s) => s.kind)).toEqual(["delivery", "delivery", "pickup"]);
    expect(slips[0]?.line).toBe("House 1  ·  Cust o1  ·  47m");
    expect(slips[1]?.line).toBe("House 2  ·  Cust o2  ·  LATE");
    expect(slips.map((s) => s.urgent)).toEqual([false, true, false]);
    // A pickup clock counts the customer's walk-in, not lateness — no clock, never urgent.
    expect(slips[2]?.line).toBe("Pickup  ·  Cust o3");
  });

  it("fills the rail at the tablet queue max without collapsing rows", () => {
    const orders = Array.from({ length: TABLET_QUEUE_MAX }, (_, i) =>
      order(`o${i + 1}`, "delivery", "inBin", (i + 1) * 1_000, 30 * MS_PER_GAME_MINUTE),
    );
    const slips = receiptSlips(orders, MAX_ROWS);
    expect(slips).toHaveLength(TABLET_QUEUE_MAX);
    expect(slips.some((s) => s.kind === "more")).toBe(false);
    expect(slips.map((s) => s.id)).toEqual(["o1", "o2", "o3", "o4", "o5", "o6"]);
  });

  it("collapses the newest slips so the oldest stay on the rail", () => {
    const orders = Array.from({ length: 9 }, (_, i) =>
      order(`o${i + 1}`, "delivery", "inBin", (i + 1) * 1_000, 30 * MS_PER_GAME_MINUTE),
    );
    const slips = receiptSlips(orders, MAX_ROWS);
    expect(slips).toHaveLength(MAX_ROWS);
    expect(slips.slice(0, 5).map((s) => s.id)).toEqual(["o1", "o2", "o3", "o4", "o5"]);
    expect(slips[5]).toMatchObject({ kind: "more", line: "+4 more", urgent: false });
  });

  it("shows nothing when the counter is clear", () => {
    expect(receiptSlips([order("o1", "delivery", "queued", 1_000)], MAX_ROWS)).toEqual([]);
    expect(receiptSlips([], MAX_ROWS)).toEqual([]);
  });
});
