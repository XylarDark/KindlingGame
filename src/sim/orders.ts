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
