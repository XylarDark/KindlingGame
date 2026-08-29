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

/** Valid next taps/moves for tutorial arrows. Several can be live at once. */
export function tutorialHints(snap: SimSnapshot): TutorialHint[] {
  if (snap.playerRole === "driver") return driverHints(snap);
  return shopHints(snap);
}

function shopHints(snap: SimSnapshot): TutorialHint[] {
  const hints: TutorialHint[] = [];
  const busy = snap.keyLead.phase !== "idle";
  const packing = snap.counterBag;

  if (packing) {
    if (!busy) {
      if (!packing.hasItem && !snap.handSkuId && snap.highlightSkuId) {
        hints.push({ id: `strain:${snap.highlightSkuId}`, kind: "strain", skuId: snap.highlightSkuId });
      } else if (!packing.hasItem && snap.handSkuId) {
        hints.push({ id: "counterBag", kind: "counterBag" });
      } else if (packing.hasItem && !snap.receipt?.held) {
        hints.push({ id: "receipt", kind: "receipt" });
      } else if (packing.hasItem && snap.receipt?.held) {
        hints.push({ id: "counterBag", kind: "counterBag" });
      }
    }
  } else {
    const walkIn = snap.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (walkIn && !busy) {
      if (snap.handSkuId === walkIn.skuId) {
        hints.push({ id: `customer:${walkIn.id}`, kind: "customer", orderId: walkIn.id });
      } else {
        hints.push({ id: `strain:${walkIn.skuId}`, kind: "strain", skuId: walkIn.skuId });
      }
    }

    const tickets = snap.tabletTicket ? [snap.tabletTicket] : [];
    if (snap.pendingDepart) {
      /* Driver is about to leave — don't point at the bag stack. */
    } else if (snap.awaitingBag) {
      hints.push({ id: "bagRack", kind: "bagRack" });
    } else {
      for (const ticket of tickets) {
        if (ticket.status === "queued") hints.push({ id: `tablet:${ticket.id}`, kind: "tablet", orderId: ticket.id });
      }
    }

    const pickup = snap.orders.find((o) => o.type === "pickup" && o.status === "readyForHandoff");
    if (pickup && !busy) {
      hints.push({ id: `customer:${pickup.id}`, kind: "customer", orderId: pickup.id });
      hints.push({ id: "handoff", kind: "handoff" });
    }
  }

  if (snap.canHitTheRoad) hints.push({ id: "hitTheRoad", kind: "hitTheRoad" });
  return hints;
}

function driverHints(snap: SimSnapshot): TutorialHint[] {
  const drop = snap.dropoff;
  if (drop.phase === "atCurb" || drop.actionLabel === "CALL") {
    return [{ id: "phone", kind: "phone" }];
  }
  if (drop.phase === "calling" || drop.phase === "waiting") return [];
  if (drop.actionLabel === "WALK") {
    return [
      { id: "movePad", kind: "movePad" },
      { id: "doorCustomer", kind: "doorCustomer" },
    ];
  }
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
