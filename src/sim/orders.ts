export type OrderType = "pickup" | "inStore" | "delivery";

export type OrderStatus =
  | "queued"
  | "carrying"
  | "onPickupShelf"
  | "readyForHandoff"
  | "inBin"
  | "onRun"
  | "atRegister"
  | "completed"
  | "failed";

export interface Order {
  id: string;
  type: OrderType;
  skuId: string;
  status: OrderStatus;
  createdAtGameMs: number;
  slaStartGameMs?: number;
  arriveAtGameMs?: number;
  destinationId?: string;
  customerName: string;
  /** Frozen at spawn so a drop is not randomly 19+ then underage. */
  idAge: number;
  late?: boolean;
}

export function destLabel(order: Pick<Order, "type" | "destinationId">): string {
  if (order.type === "inStore") return "Counter";
  if (order.type === "pickup") return "Pickup";
  if (order.destinationId) return `House ${order.destinationId.replace("house-", "")}`;
  return "Delivery";
}

export function needsFetch(order: Order): boolean {
  return order.status === "queued" || order.status === "atRegister";
}

export function isOpen(order: Order): boolean {
  return order.status !== "completed" && order.status !== "failed";
}

export function isTabletTicket(order: Pick<Order, "type" | "status">): boolean {
  return order.type !== "inStore" && order.status === "queued";
}

/** Packed pickup or delivery bags that sit on the shop counter. */
export function isPackedOnCounter(order: Pick<Order, "status">): boolean {
  return order.status === "onPickupShelf" || order.status === "readyForHandoff" || order.status === "inBin";
}

export function tabletQueue<T extends Pick<Order, "type" | "status" | "createdAtGameMs" | "id">>(orders: T[]): T[] {
  return orders
    .filter(isTabletTicket)
    .sort((a, b) => a.createdAtGameMs - b.createdAtGameMs || a.id.localeCompare(b.id));
}
