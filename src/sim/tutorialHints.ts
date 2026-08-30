import type { SimSnapshot } from "./gameSim";

export type TutorialHint =
  | { id: string; kind: "strain"; skuId: string }
  | { id: string; kind: "bagRack" }
  | { id: string; kind: "tablet"; orderId: string }
  | { id: string; kind: "counterBag" }
  | { id: string; kind: "receipt" }
  | { id: string; kind: "customer"; orderId: string }
  | { id: string; kind: "hitTheRoad" }
  | { id: string; kind: "handoff" }
  | { id: string; kind: "phone" }
  | { id: string; kind: "idCard" }
  | { id: string; kind: "movePad" }
  | { id: string; kind: "gpsPin" }
  | { id: string; kind: "doorCustomer" }
  | { id: string; kind: "shop" };

/** Exactly one next tap — never pack and HIT THE ROAD at the same time. */
export function tutorialHints(snap: SimSnapshot): TutorialHint[] {
  const next = snap.playerRole === "driver" ? nextDriverHint(snap) : nextShopHint(snap);
  return next ? [next] : [];
}

/** The single shop click the player should take next. */
export function nextShopHint(snap: SimSnapshot): TutorialHint | null {
  const busy = snap.keyLead.phase !== "idle";

  const walkIn = snap.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
  if (walkIn && !busy) {
    if (snap.handSkuId === walkIn.skuId) {
      return { id: `customer:${walkIn.id}`, kind: "customer", orderId: walkIn.id };
    }
    return { id: `strain:${walkIn.skuId}`, kind: "strain", skuId: walkIn.skuId };
  }

  if (busy) return null;

  if (snap.awaitingBag && !snap.pendingDepart) {
    return { id: "bagRack", kind: "bagRack" };
  }

  if (snap.highlightSkuId) {
    return { id: `strain:${snap.highlightSkuId}`, kind: "strain", skuId: snap.highlightSkuId };
  }

  const pickup = snap.orders.find((o) => o.type === "pickup" && o.status === "readyForHandoff");
  if (pickup) {
    return { id: `customer:${pickup.id}`, kind: "customer", orderId: pickup.id };
  }

  if (snap.tabletTicket?.status === "queued") {
    return { id: `tablet:${snap.tabletTicket.id}`, kind: "tablet", orderId: snap.tabletTicket.id };
  }

  if (snap.canHitTheRoad) {
    return { id: "hitTheRoad", kind: "hitTheRoad" };
  }

  return null;
}

function nextDriverHint(snap: SimSnapshot): TutorialHint | null {
  const drop = snap.dropoff;
  if (drop.phase === "atCurb" || drop.actionLabel === "CALL") {
    return { id: "phone", kind: "phone" };
  }
  if (drop.phase === "calling") return null;
  if (drop.actionLabel === "ASK ID") {
    return { id: "askId", kind: "doorCustomer" };
  }
  if (drop.actionLabel === "CHECK ID" || drop.idCard) {
    return { id: "idCard", kind: "idCard" };
  }
  if (drop.actionLabel === "HAND BAG" || drop.actionLabel === "PHOTO") {
    return { id: "handoff", kind: "handoff" };
  }
  if (snap.run?.nextStopId) return { id: "gpsPin", kind: "gpsPin" };
  return { id: "shop", kind: "shop" };
}
