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
import { doorstepWorld, houseById, tileToWorld } from "../maps/cityT0";

function finishDropoff(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  sim.interact();
  sim.tick(CALL_CONNECT_MS + 32);
  for (let i = 0; i < 40; i++) sim.tick(50);
  const door = doorstepWorld(stop);
  sim.setDriverPosition(door.x, door.y);
  sim.interact();
  sim.interact();
  sim.interact();
}

function waitForFetch(sim: GameSim): void {
  for (let i = 0; i < 240; i++) {
    const snap = sim.snapshot();
    if (snap.handSkuId && snap.keyLead.phase === "idle") return;
    sim.tick(50);
  }
}

function fillTicket(sim: GameSim, type: "pickup" | "inStore" | "delivery", extra?: { destinationId?: string; skuId?: string }) {
  const order = sim.spawnOrder(type, extra);
  if (type === "inStore") {
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    sim.shopClick({ type: "customer", orderId: order.id });
    return order;
  }
  sim.shopClick({ type: "tablet", orderId: order.id });
  sim.shopClick({ type: "bagRack" });
  sim.shopClick({ type: "strain", skuId: order.skuId });
  waitForFetch(sim);
  sim.shopClick({ type: "counterBag" });
  sim.shopClick({ type: "receipt" });
  sim.shopClick({ type: "counterBag" });
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
    sim.tick(1000);
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.orderById(order.id)?.slaStartGameMs).toBe(order.slaStartGameMs);
  });

  it("prints a receipt with the bag and does not finish until receipt then bag", () => {
    const sim = GameSim.create({ seed: 8, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "bagRack" });
    expect(sim.snapshot().receipt?.customerName).toBe(order.customerName);
    expect(sim.snapshot().receipt?.held).toBe(false);
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    sim.shopClick({ type: "counterBag" });
    expect(order.status).toBe("queued");
    sim.shopClick({ type: "receipt" });
    expect(sim.snapshot().receipt?.held).toBe(true);
    expect(order.status).toBe("queued");
    sim.shopClick({ type: "counterBag" });
    expect(order.status).toBe("onPickupShelf");
  });

  it("lets a wrong wall TV stay unfetched until the right one is tapped", () => {
    const sim = GameSim.create({ seed: 8, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    const other = sim.catalog.find((s) => s.id !== order.skuId)!;
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "bagRack" });
    sim.shopClick({ type: "strain", skuId: other.id });
    expect(sim.snapshot().handSkuId).toBeNull();
    expect(sim.snapshot().keyLead.phase).toBe("idle");
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().handSkuId).toBe(order.skuId);
    sim.shopClick({ type: "counterBag" });
    sim.shopClick({ type: "receipt" });
    sim.shopClick({ type: "counterBag" });
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

  it("does not complete a delivery from parking alone — call, photo, and ID are required", () => {
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
    expect(sim.snapshot().pendingDepart).toBe(false);
    expect(sim.snapshot().playerRole).toBe("keyLead");
    expect(order.status).toBe("queued");
  });

  it("does not highlight a TV until that ticket is tapped", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    expect(sim.snapshot().highlightSkuId).toBeNull();
    sim.shopClick({ type: "tablet", orderId: order.id });
    expect(sim.snapshot().highlightSkuId).toBe(order.skuId);
    expect(sim.snapshot().selectedOrderId).toBe(order.id);
  });

  it("queues a second ticket instead of interrupting the current bag", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const first = sim.spawnOrder("pickup");
    const second = sim.spawnOrder("delivery", { destinationId: "house-1" });
    sim.shopClick({ type: "tablet", orderId: first.id });
    sim.shopClick({ type: "bagRack" });
    sim.shopClick({ type: "tablet", orderId: second.id });
    expect(sim.snapshot().selectedOrderId).toBe(first.id);
    expect(sim.snapshot().highlightSkuId).toBe(first.skuId);
    expect(sim.snapshot().counterBag?.customerName).toBe(first.customerName);
    expect(sim.snapshot().pendingDepart).toBe(false);
    expect(sim.snapshot().tabletTicket?.id).toBeUndefined();
  });

  it("starts the next queued ticket after the current bag is sealed", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const first = sim.spawnOrder("pickup");
    const second = sim.spawnOrder("delivery", { destinationId: "house-1" });
    sim.shopClick({ type: "tablet", orderId: first.id });
    sim.shopClick({ type: "bagRack" });
    sim.shopClick({ type: "tablet", orderId: second.id });
    sim.shopClick({ type: "strain", skuId: first.skuId });
    waitForFetch(sim);
    sim.shopClick({ type: "counterBag" });
    sim.shopClick({ type: "receipt" });
    sim.shopClick({ type: "counterBag" });
    expect(first.status).toBe("onPickupShelf");
    expect(sim.snapshot().selectedOrderId).toBe(second.id);
    expect(sim.snapshot().highlightSkuId).toBe(second.skuId);
    expect(sim.snapshot().bagsOnPickup).toContain(first.id);
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
