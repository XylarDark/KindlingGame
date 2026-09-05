import { describe, expect, it } from "vitest";
import {
  CALL_CONNECT_MS,
  INSTORE_WALKOUT_MS,
  MS_PER_GAME_HOUR,
  PICKUP_ARRIVE_MS,
  PICKUP_HANDOFF_WAIT_MS,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
} from "./constants";
import { GameSim } from "./gameSim";
import { CITY, houseById, tileToWorld } from "../maps/cityT0";

function finishDropoff(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  sim.interact();
  sim.tick(CALL_CONNECT_MS + 32);
  sim.interact();
  sim.interact();
  sim.interact();
  sim.interact();
}

function startDoor(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  sim.interact();
  sim.tick(CALL_CONNECT_MS + 32);
}

function waitForFetch(sim: GameSim): void {
  for (let i = 0; i < 240; i++) {
    const snap = sim.snapshot();
    if (snap.handSkuId && snap.keyLead.phase === "idle") return;
    sim.tick(50);
  }
}

function fillTicket(
  sim: GameSim,
  type: "pickup" | "inStore" | "delivery",
  extra?: { destinationId?: string; skuId?: string; ageOk?: boolean },
) {
  const order = sim.spawnOrder(type, { ...extra, ageOk: extra?.ageOk ?? true });
  if (type === "inStore") {
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    sim.shopClick({ type: "customer", orderId: order.id });
    return order;
  }
  sim.shopClick({ type: "tablet", orderId: order.id });
  sim.shopClick({ type: "strain", skuId: order.skuId });
  waitForFetch(sim);
  sim.shopClick({ type: "bagRack" });
  return order;
}

describe("GameSim order loops", () => {
  it("completes pickup: bag, strain, counter, arrive, handoff", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = fillTicket(sim, "pickup");
    expect(order.status).toBe("onPickupShelf");
    sim.tick(PICKUP_ARRIVE_MS);
    expect(sim.orderById(order.id)?.status).toBe("readyForHandoff");
    sim.tick(4000);
    sim.shopClick({ type: "handoff" });
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_PICKUP);
  });

  it("completes pickup when the waiting customer is tapped", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = fillTicket(sim, "pickup");
    sim.tick(PICKUP_ARRIVE_MS);
    expect(sim.orderById(order.id)?.status).toBe("readyForHandoff");
    sim.tick(4000);
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_PICKUP);
  });

  it("fails pickup as a no-show if nobody hands it off", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = fillTicket(sim, "pickup");
    sim.tick(PICKUP_ARRIVE_MS + PICKUP_HANDOFF_WAIT_MS + 16);
    expect(sim.orderById(order.id)?.status).toBe("failed");
    expect(sim.score).toBe(SCORE_FAIL);
  });

  it("completes in-store serve and penalizes walkout", () => {
    const served = GameSim.create({ seed: 2, autoSpawn: false });
    fillTicket(served, "inStore");
    expect(served.score).toBe(SCORE_INSTORE);

    const walked = GameSim.create({ seed: 2, autoSpawn: false });
    const order = walked.spawnOrder("inStore");
    walked.tick(4000);
    walked.tick(INSTORE_WALKOUT_MS);
    expect(walked.orderById(order.id)?.status).toBe("failed");
    expect(walked.score).toBe(SCORE_FAIL);
  });

  it("does not finish a walk-in until the strain is handed to them", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    const other = sim.catalog.find((s) => s.id !== order.skuId)!;
    sim.shopClick({ type: "strain", skuId: other.id });
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("atRegister");
    expect(sim.score).toBe(0);
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().serveLine).toContain("HANDOFF");
    expect(sim.orderById(order.id)?.status).toBe("atRegister");
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_INSTORE);
  });

  it("starts delivery SLA when the named bag is filled, not when leaving", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(order.status).toBe("inBin");
    expect(order.customerName.length).toBeGreaterThan(2);
    expect(sim.snapshot().orders[0]?.destLabel).toBe("House 1");
    expect(order.slaStartGameMs).toBe(sim.clock.gameMs);
    const packed = sim.snapshot().orders.find((o) => o.id === order.id)!;
    expect(packed.slaRemainingMs).toBeGreaterThan(MS_PER_GAME_HOUR - 50);
    expect(packed.slaRemainingMs).toBeLessThanOrEqual(MS_PER_GAME_HOUR);
    expect(packed.late).toBe(false);
    sim.tick(1000);
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.orderById(order.id)?.slaStartGameMs).toBe(order.slaStartGameMs);
    const afterTick = sim.snapshot().orders.find((o) => o.id === order.id)!;
    expect(afterTick.slaRemainingMs).toBeCloseTo(MS_PER_GAME_HOUR - 1000, -2);
    expect(afterTick.status).toBe("onRun");
  });

  it("keeps a packed delivery bag after the one-hour SLA expires", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.tick(MS_PER_GAME_HOUR + 50);
    const view = sim.snapshot().orders.find((o) => o.id === order.id)!;
    expect(view.status).toBe("inBin");
    expect(view.slaRemainingMs).toBeLessThanOrEqual(0);
    expect(view.late).toBe(true);
  });

  it("packs after tablet, strain, then bag — no receipt click", () => {
    const sim = GameSim.create({ seed: 8, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().highlightSkuId).toBe(order.skuId);
    expect(sim.snapshot().awaitingBag).toBe(false);
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().awaitingBag).toBe(true);
    expect(sim.snapshot().highlightSkuId).toBeNull();
    expect(order.status).toBe("queued");
    sim.shopClick({ type: "bagRack" });
    expect(order.status).toBe("onPickupShelf");
  });

  it("lets a wrong wall TV stay unfetched until the right one is tapped", () => {
    const sim = GameSim.create({ seed: 8, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    const other = sim.catalog.find((s) => s.id !== order.skuId)!;
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "strain", skuId: other.id });
    expect(sim.snapshot().handSkuId).toBeNull();
    expect(sim.snapshot().keyLead.phase).toBe("idle");
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().handSkuId).toBe(order.skuId);
    sim.shopClick({ type: "bagRack" });
    expect(order.status).toBe("onPickupShelf");
  });

  it("scores on-time and late delivery handoffs", () => {
    const onTime = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(onTime, "delivery", { destinationId: "house-1" });
    onTime.hitTheRoad();
    finishDropoff(onTime, "house-1");
    expect(onTime.score).toBe(SCORE_DELIVERY_ON_TIME);

    const late = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(late, "delivery", { destinationId: "house-1" });
    late.hitTheRoad();
    late.tick(MS_PER_GAME_HOUR + 50);
    finishDropoff(late, "house-1");
    expect(late.score).toBe(SCORE_DELIVERY_LATE);
  });

  it("does not complete a delivery from parking alone — call, ID, bag, and photo are required", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const stop = houseById("house-1")!;
    const pos = tileToWorld(stop.stop);
    sim.setVehiclePosition(pos.x, pos.y);
    sim.tick(32);
    sim.interact();
    expect(sim.orderById(order.id)?.status).toBe("onRun");
    expect(sim.snapshot().dropoff.phase).toBe("calling");
  });

  it("puts the driver and customer at the door after the call connects", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const stop = houseById("house-1")!;
    const pos = tileToWorld(stop.stop);
    sim.setVehiclePosition(pos.x, pos.y);
    sim.tick(32);
    sim.interact();
    sim.tick(CALL_CONNECT_MS + 32);
    const drop = sim.snapshot().dropoff;
    expect(drop.phase).toBe("atDoor");
    expect(drop.actionLabel).toBe("ASK ID");
    expect(drop.idAsked).toBe(false);
    expect(drop.idCard).toBeNull();
    expect(drop.customerName).toBe(order.customerName);
    expect(sim.orderById(order.id)?.status).toBe("onRun");
  });

  it("completes a 19+ stop: ask ID, check ID, hand bag, photo, then returns to the map", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1", ageOk: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    expect(sim.snapshot().dropoff.actionLabel).toBe("ASK ID");
    expect(sim.snapshot().dropoff.idCard).toBeNull();
    sim.interact();
    expect(sim.snapshot().dropoff.actionLabel).toBe("CHECK ID");
    expect(sim.snapshot().dropoff.idCard?.ageOk).toBe(true);
    sim.interact();
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.snapshot().dropoff.idCard).toBeNull();
    sim.interact();
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
    sim.interact();
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.snapshot().dropoff.phase).toBe("none");
    expect(sim.snapshot().run).toBeNull();
  });

  it("denies an underage stop, fails the order, and returns to the map", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1", ageOk: false });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    expect(sim.snapshot().dropoff.actionLabel).toBe("ASK ID");
    expect(sim.snapshot().dropoff.idCard).toBeNull();
    sim.interact();
    expect(sim.snapshot().dropoff.idCard?.ageOk).toBe(false);
    sim.interact();
    expect(sim.orderById(order.id)?.status).toBe("failed");
    expect(sim.score).toBe(SCORE_FAIL);
    expect(sim.snapshot().dropoff.phase).toBe("none");
    expect(sim.snapshot().run).toBeNull();
  });

  it("after an underage deny, GPS still points at the next bag on the run", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    const first = fillTicket(sim, "delivery", { destinationId: "house-1", ageOk: false });
    const second = fillTicket(sim, "delivery", { destinationId: "house-2", ageOk: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    sim.interact();
    sim.interact();
    expect(sim.orderById(first.id)?.status).toBe("failed");
    expect(sim.orderById(second.id)?.status).toBe("onRun");
    expect(sim.snapshot().run?.nextStopId).toBe("house-2");
    expect(sim.snapshot().dropoff.phase).toBe("none");
    finishDropoff(sim, "house-2");
    expect(sim.orderById(second.id)?.status).toBe("completed");
    expect(sim.snapshot().dropoff.phase).toBe("none");
    expect(sim.snapshot().run).toBeNull();
  });

  it("only returns to the shop when the vehicle is near Kindling", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const house = tileToWorld(houseById("house-1")!.stop);
    sim.setVehiclePosition(house.x, house.y);
    expect(sim.backToShop()).toBe(false);
    expect(sim.snapshot().playerRole).toBe("driver");
    expect(sim.snapshot().toast).toBe("Drive up to Kindling first.");
    const shop = tileToWorld(CITY.shopSpawn);
    sim.setVehiclePosition(shop.x, shop.y);
    expect(sim.backToShop()).toBe(true);
    expect(sim.snapshot().playerRole).toBe("keyLead");
  });

  it("hands every packed counter bag on one multi-stop run", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    const first = fillTicket(sim, "delivery", { destinationId: "house-1" });
    const second = fillTicket(sim, "delivery", { destinationId: "house-2" });
    sim.hitTheRoad();
    expect(sim.snapshot().run?.orderIds).toEqual([first.id, second.id]);
    finishDropoff(sim, "house-1");
    expect(sim.orderById(first.id)?.status).toBe("completed");
    expect(sim.orderById(second.id)?.status).toBe("onRun");
    expect(sim.snapshot().run?.nextStopId).toBe("house-2");
    finishDropoff(sim, "house-2");
    expect(sim.orderById(second.id)?.status).toBe("completed");
    expect(sim.snapshot().run).toBeNull();
    expect(sim.score).toBe(SCORE_DELIVERY_ON_TIME * 2);
  });

  it("takes multiple bin bags on one run", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    fillTicket(sim, "delivery", { destinationId: "house-2" });
    expect(sim.snapshot().bagsInBin).toHaveLength(2);
    sim.hitTheRoad();
    const run = sim.snapshot().run;
    expect(run?.orderIds).toHaveLength(2);
    expect(run?.nextStopId).toBeTruthy();
  });

  it("lets the driver leave with packed deliveries while more tickets wait", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const packed = fillTicket(sim, "delivery", { destinationId: "house-1" });
    const waiting = sim.spawnOrder("delivery", { destinationId: "house-2" });
    sim.shopClick({ type: "tablet", orderId: waiting.id });
    const snap = sim.snapshot();
    expect(snap.canHitTheRoad).toBe(true);
    expect(snap.awaitingBag).toBe(false);
    expect(snap.highlightSkuId).toBe(waiting.skuId);
    expect(snap.bagsInBin).toEqual([packed.id]);
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.snapshot().playerRole).toBe("driver");
    expect(sim.snapshot().run?.orderIds).toEqual([packed.id]);
    expect(waiting.status).toBe("queued");
  });

  it("lets the NPC key-lead bag a delivery while the player drives", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    sim.spawnOrder("delivery", { destinationId: "house-3" });
    for (let i = 0; i < 240; i++) sim.tick(50);
    expect(sim.snapshot().bagsInBin.length).toBeGreaterThan(0);
  });

  it("generates a unique catalog for the session", () => {
    const sim = GameSim.create({ seed: 9, autoSpawn: false });
    const names = sim.catalog.map((s) => s.name);
    expect(new Set(names).size).toBe(names.length);
    expect(sim.catalog).toHaveLength(9);
  });

  it("shows one tablet ticket and never auto-queues more than 6", () => {
    const sim = GameSim.create({ seed: 7, autoSpawn: true });
    sim.tick(2_400);
    expect(sim.snapshot().tabletQueueCount).toBeGreaterThanOrEqual(1);
    expect(sim.snapshot().tabletQueueCount).toBeLessThanOrEqual(2);
    expect(sim.snapshot().tabletTicket).toBeTruthy();
    for (let i = 0; i < 240; i++) sim.tick(500);
    expect(sim.snapshot().tabletQueueCount).toBeLessThanOrEqual(6);
  });

  it("calls out strain and customer after the tablet is tapped", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    const sku = sim.catalog.find((s) => s.id === order.skuId)!;
    expect(sim.snapshot().keyLeadLine).toBeNull();
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().keyLeadLine).toBe(`Pickup: ${sku.name} for ${order.customerName}`);
  });

  it("selects a delivery ticket without sending the driver", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    const order = sim.spawnOrder("delivery", { destinationId: "house-1" });
    const sku = sim.catalog.find((s) => s.id === order.skuId)!;
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().keyLeadLine).toBe(`Delivery: ${sku.name} for ${order.customerName}`);
    expect(sim.snapshot().highlightSkuId).toBe(order.skuId);
    expect(sim.snapshot().awaitingBag).toBe(false);
    expect(sim.snapshot().pendingDepart).toBe(false);
    expect(sim.snapshot().playerRole).toBe("keyLead");
    expect(order.status).toBe("queued");
  });

  it("highlights the TV after the tablet is tapped, then the bag after fetch", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    expect(sim.snapshot().highlightSkuId).toBeNull();
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().highlightSkuId).toBe(order.skuId);
    expect(sim.snapshot().awaitingBag).toBe(false);
    expect(sim.snapshot().selectedOrderId).toBe(order.id);
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().highlightSkuId).toBeNull();
    expect(sim.snapshot().awaitingBag).toBe(true);
  });

  it("queues a second ticket instead of interrupting the current bag", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const first = sim.spawnOrder("pickup");
    const second = sim.spawnOrder("delivery", { destinationId: "house-1" });
    sim.shopClick({ type: "tablet", orderId: first.id });
    sim.shopClick({ type: "tablet", orderId: second.id });
    expect(sim.snapshot().selectedOrderId).toBe(first.id);
    expect(sim.snapshot().highlightSkuId).toBe(first.skuId);
    expect(sim.snapshot().counterBag).toBeNull();
    expect(sim.snapshot().pendingDepart).toBe(false);
    expect(sim.snapshot().tabletTicket?.id).toBeUndefined();
  });

  it("starts the next queued ticket after the current bag is sealed", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const first = sim.spawnOrder("pickup");
    const second = sim.spawnOrder("delivery", { destinationId: "house-1" });
    sim.shopClick({ type: "tablet", orderId: first.id });
    sim.shopClick({ type: "tablet", orderId: second.id });
    sim.shopClick({ type: "strain", skuId: first.skuId });
    waitForFetch(sim);
    sim.shopClick({ type: "bagRack" });
    expect(first.status).toBe("onPickupShelf");
    expect(sim.snapshot().selectedOrderId).toBe(second.id);
    expect(sim.snapshot().highlightSkuId).toBe(second.skuId);
    expect(sim.snapshot().awaitingBag).toBe(false);
    expect(sim.snapshot().bagsOnPickup).toContain(first.id);
    sim.shopClick({ type: "strain", skuId: second.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().awaitingBag).toBe(true);
    expect(sim.snapshot().highlightSkuId).toBeNull();
  });

  it("resets the clock to 9:00 and clears a door stop so leftover SLAs are not LATE", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    sim.tick(MS_PER_GAME_HOUR + 50);
    expect(sim.snapshot().clockLabel).not.toBe("09:00");
    expect(sim.snapshot().dropoff.phase).toBe("atDoor");
    expect(sim.snapshot().orders.find((o) => o.id === order.id)?.late).toBe(true);
    sim.resetToMorning();
    const snap = sim.snapshot();
    expect(snap.clockLabel).toBe("09:00");
    expect(snap.dropoff.phase).toBe("none");
    expect(sim.orderById(order.id)?.status).toBe("onRun");
    const view = snap.orders.find((o) => o.id === order.id)!;
    expect(view.late).toBe(false);
    expect(view.slaRemainingMs).toBeGreaterThan(MS_PER_GAME_HOUR - 50);
  });

  it("leaves each sealed bag on the counter", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    const a = fillTicket(sim, "pickup");
    const b = fillTicket(sim, "delivery", { destinationId: "house-1" });
    const snap = sim.snapshot();
    expect(a.status).toBe("onPickupShelf");
    expect(b.status).toBe("inBin");
    expect(snap.bagsOnPickup).toContain(a.id);
    expect(snap.bagsInBin).toContain(b.id);
    expect(snap.counterBag).toBeNull();
  });
});
