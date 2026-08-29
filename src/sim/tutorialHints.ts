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
  | { id: string; kind: "doorCustomer" };

/** Next tap/move. Packing is one step at a time; HIT THE ROAD is also offered once bags are ready. */
export function tutorialHints(snap: SimSnapshot): TutorialHint[] {
  if (snap.playerRole === "driver") return driverHints(snap);
  const hints: TutorialHint[] = [];
  const next = nextShopHint(snap);
  if (next && next.kind !== "hitTheRoad") hints.push(next);
  if (snap.canHitTheRoad) hints.push({ id: "hitTheRoad", kind: "hitTheRoad" });
  return hints;
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

function driverHints(snap: SimSnapshot): TutorialHint[] {
  const drop = snap.dropoff;
  if (drop.phase === "atCurb" || drop.actionLabel === "CALL") {
    return [{ id: "phone", kind: "phone" }];
  }
  if (drop.phase === "calling") return [];
  if (drop.actionLabel === "PHOTO" || drop.actionLabel === "HAND BAG") {
    return [{ id: "handoff", kind: "handoff" }];
  }
  if (drop.actionLabel === "CHECK ID" || drop.idCard) {
    return [{ id: "idCard", kind: "idCard" }];
  }
  if (snap.run?.nextStopId) {
    return [
      { id: "movePad", kind: "movePad" },
      { id: "gpsPin", kind: "gpsPin" },
    ];
  }
  return [{ id: "hitTheRoad", kind: "hitTheRoad" }];
}
