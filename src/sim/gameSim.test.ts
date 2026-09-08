import { describe, expect, it } from "vitest";
import {
  CALL_CONNECT_MS,
  INSTORE_WALKOUT_MS,
  MS_PER_GAME_HOUR,
  NPC_INTERACT_COOLDOWN_MS,
  PICKUP_ARRIVE_MS,
  PICKUP_HANDOFF_WAIT_MS,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SCORE_INSTORE,
  SCORE_PICKUP,
  SHIFT_MS,
} from "./constants";
import { GameSim } from "./gameSim";
import { CITY, houseById, tileToWorld } from "../maps/cityT0";
import {
  TRAFFIC_LANE_WIDTH,
  TRAFFIC_LOOK_AHEAD,
  TRAFFIC_MIN_SEP,
  VAN_MATCH_GAP,
  cityTrafficLoops,
  trafficCars,
} from "../maps/traffic";
import {
  OPENING_FIRST_AT_MS,
  OPENING_ORDER_GAP_MS,
  TICKET_WAVE_MAX_MS,
  WALKIN_GAP_MAX_MS,
  WALKIN_GAP_MIN_MS,
} from "./constants";

function stepDropoff(sim: GameSim): void {
  sim.interact();
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
}

function finishDropoff(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  stepDropoff(sim); // call
  sim.tick(CALL_CONNECT_MS + 32);
  stepDropoff(sim); // ask ID
  stepDropoff(sim); // check ID
  stepDropoff(sim); // hand bag
  stepDropoff(sim); // photo
}

function startDoor(sim: GameSim, houseId: string): void {
  const stop = houseById(houseId)!;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  stepDropoff(sim);
  sim.tick(CALL_CONNECT_MS + 32);
}

function waitForFetch(sim: GameSim): void {
  for (let i = 0; i < 240; i++) {
    const snap = sim.snapshot();
    if (snap.handSkuId && snap.keyLead.phase === "idle") return;
    sim.tick(50);
  }
}

function waitForCustomerAtCounter(sim: GameSim, orderId: string): void {
  for (let i = 0; i < 240; i++) {
    if (sim.orderById(orderId)?.arriveAtGameMs !== undefined) return;
    sim.tick(50);
  }
}

/**
 * Let the key lead work the counter while the van is out. Coarse 50ms ticks and an early
 * exit keep these well clear of vitest's default timeout — never tighten the granularity.
 */
function runCover(sim: GameSim, done: () => boolean, maxTicks = 600): void {
  for (let i = 0; i < maxTicks; i++) {
    if (done()) return;
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
    waitForCustomerAtCounter(sim, order.id);
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
    sim.tick(PICKUP_ARRIVE_MS);
    waitForCustomerAtCounter(sim, order.id);
    sim.tick(PICKUP_HANDOFF_WAIT_MS + 16);
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
    expect(sim.orderById(order.id)?.status).toBe("atRegister");
    expect(sim.score).toBe(0);
    waitForCustomerAtCounter(sim, order.id);
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

  it("blocks walk-in TV taps until the customer reaches the counter", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    sim.shopClick({ type: "strain", skuId: order.skuId });
    expect(sim.snapshot().handSkuId).toBeNull();
    expect(sim.snapshot().toast).toContain("walking in");
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().handSkuId).toBe(order.skuId);
  });

  it("blocks pickup handoff until the customer reaches the counter", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = fillTicket(sim, "pickup");
    sim.tick(PICKUP_ARRIVE_MS);
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("readyForHandoff");
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "customer", orderId: order.id });
    expect(sim.orderById(order.id)?.status).toBe("completed");
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
    expect(sim.snapshot().toast).toMatch(/^Wrong TV\./);
    expect(sim.snapshot().sfxCue?.kind).toBe("wrong");
    sim.shopClick({ type: "strain", skuId: order.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().handSkuId).toBe(order.skuId);
    sim.shopClick({ type: "bagRack" });
    expect(order.status).toBe("onPickupShelf");
    expect(sim.snapshot().sfxCue?.kind).toBe("pack");
  });

  it("toasts Wrong TV for walk-ins and prefers them over a selected ticket", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const ticket = sim.spawnOrder("pickup");
    const walkIn = sim.spawnOrder("inStore");
    waitForCustomerAtCounter(sim, walkIn.id);
    sim.shopClick({ type: "tablet", orderId: ticket.id });
    const other = sim.catalog.find((s) => s.id !== walkIn.skuId)!;
    sim.shopClick({ type: "strain", skuId: other.id });
    expect(sim.snapshot().handSkuId).toBeNull();
    expect(sim.snapshot().toast).toMatch(/^Wrong TV\./);
    expect(sim.snapshot().toast).toContain(walkIn.customerName);
    sim.shopClick({ type: "strain", skuId: walkIn.skuId });
    waitForFetch(sim);
    expect(sim.snapshot().handSkuId).toBe(walkIn.skuId);
  });

  it("keeps walk-in guidance on the counter prompt, not the bottom toast", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    sim.spawnOrder("inStore");
    expect(sim.snapshot().toast).toBe("");
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
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("CHECK ID");
    expect(sim.snapshot().dropoff.idCard?.ageOk).toBe(true);
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.snapshot().dropoff.idCard).toBeNull();
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
    stepDropoff(sim);
    expect(sim.orderById(order.id)?.status).toBe("completed");
    expect(sim.snapshot().dropoff.phase).toBe("none");
    expect(sim.snapshot().run).toBeNull();
  });

  it("does not advance past ASK ID on the same tap burst", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1", ageOk: false });
    fillTicket(sim, "delivery", { destinationId: "house-2", ageOk: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    sim.interact(); // ask
    sim.interact(); // same-frame burst — must not check/deny yet
    sim.interact();
    expect(sim.snapshot().dropoff.actionLabel).toBe("CHECK ID");
    expect(sim.snapshot().dropoff.phase).toBe("atDoor");
    expect(sim.snapshot().run?.nextStopId).toBe("house-1");
  });

  it("keeps hand-bag and photo working on the first stop of a multi-stop run", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const first = fillTicket(sim, "delivery", { destinationId: "house-1", ageOk: true });
    fillTicket(sim, "delivery", { destinationId: "house-2", ageOk: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim); // ask
    stepDropoff(sim); // check
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    // Vehicle nearer the other house must not break the locked door flow.
    const other = tileToWorld(houseById("house-2")!.stop);
    sim.setVehiclePosition(other.x, other.y);
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
    stepDropoff(sim);
    expect(sim.orderById(first.id)?.status).toBe("completed");
    expect(sim.snapshot().run?.nextStopId).toBe("house-2");
  });

  it("does not auto-skip bag/photo when ID click-through arrives during the lock", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1", ageOk: true });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    stepDropoff(sim); // ask
    sim.interact(); // check ID — arms full click-through lock
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.snapshot().dropoff.interactArmed).toBe(false);
    sim.queueInteract(); // click-through / double-tap during lock — must discard
    sim.tick(16);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    sim.tick(NPC_INTERACT_COOLDOWN_MS);
    expect(sim.snapshot().dropoff.actionLabel).toBe("HAND BAG");
    expect(sim.snapshot().dropoff.interactArmed).toBe(true);
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.actionLabel).toBe("PHOTO");
  });

  it("denies an underage stop, fails the order, and returns to the map", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-1", ageOk: false });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    expect(sim.snapshot().dropoff.actionLabel).toBe("ASK ID");
    expect(sim.snapshot().dropoff.idCard).toBeNull();
    stepDropoff(sim);
    expect(sim.snapshot().dropoff.idCard?.ageOk).toBe(false);
    stepDropoff(sim);
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
    stepDropoff(sim);
    stepDropoff(sim);
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

  it("auto-drives toward the next parking stop without steer input", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const start = { ...sim.snapshot().vehicle };
    expect(sim.snapshot().autoDriving).toBe(true);
    for (let i = 0; i < 400; i++) sim.tick(50);
    const after = sim.snapshot().vehicle;
    expect(Math.hypot(after.x - start.x, after.y - start.y)).toBeGreaterThan(120);
  });

  it("lets pad/WASD nudge override auto-drive while en route", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    const start = { ...sim.snapshot().vehicle };
    sim.setPlayerInput(0, 1);
    for (let i = 0; i < 20; i++) sim.tick(50);
    const after = sim.snapshot().vehicle;
    expect(after.y).toBeGreaterThan(start.y + 40);
  });

  it("auto-parks in the driveway so the phone call can start", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    for (let i = 0; i < 2_000 && sim.snapshot().autoDriving; i++) sim.tick(50);
    expect(sim.snapshot().autoDriving).toBe(false);
    expect(sim.snapshot().dropoff.phase).toBe("atCurb");
    expect(sim.snapshot().dropoff.actionLabel).toBe("CALL");
    const stop = houseById("house-1")!;
    const pad = tileToWorld(stop.stop);
    const v = sim.snapshot().vehicle;
    expect(Math.hypot(v.x - pad.x, v.y - pad.y)).toBeLessThan(2);
  });

  it("queues behind traffic at the follow gap and still reaches the stop", () => {
    // 50ms ticks match the auto-drive's own slice, so this is the same drive at a third of
    // the cost. Two phases is enough: both put ~250 ticks of lane traffic in front of the
    // van. Mid-corner shoves are pinned cheaply by the time sweep in traffic.test.ts.
    for (const phaseMs of [1_500, 4_000]) {
      const sim = GameSim.create({ seed: 5, autoSpawn: false });
      fillTicket(sim, "delivery", { destinationId: "house-3" });
      sim.hitTheRoad();
      sim.clock.gameMs = phaseMs;
      let queuedTicks = 0;
      let tightest = Infinity;
      for (let i = 0; i < 1_200 && sim.snapshot().autoDriving; i++) {
        const v = sim.snapshot().vehicle;
        const cars = trafficCars(sim.clock.gameMs, cityTrafficLoops(), v);
        const cos = Math.cos(v.heading);
        const sin = Math.sin(v.heading);
        for (const car of cars) {
          const dx = car.x - v.x;
          const dy = car.y - v.y;
          const gap = Math.hypot(dx, dy);
          if (gap >= TRAFFIC_LOOK_AHEAD) continue;
          if (cos * dx + sin * dy < 36) continue;
          if (Math.abs(-sin * dx + cos * dy) > TRAFFIC_LANE_WIDTH) continue;
          queuedTicks += 1;
          tightest = Math.min(tightest, gap);
        }
        sim.tick(50);
      }
      // A bigger follow gap must never stall the route or deadlock against a lead car.
      expect(sim.snapshot().autoDriving, `phase ${phaseMs} stalled`).toBe(false);
      expect(queuedTicks, `phase ${phaseMs} never met traffic`).toBeGreaterThan(0);
      // Queued means tucked into the follow band — close up, but never inside a car.
      expect(tightest, `phase ${phaseMs} nose-to-tail`).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
      expect(tightest, `phase ${phaseMs} never closed up`).toBeLessThan(VAN_MATCH_GAP + 24);
    }
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
    sim.tick(OPENING_FIRST_AT_MS + OPENING_ORDER_GAP_MS + 400);
    expect(sim.snapshot().tabletQueueCount).toBeGreaterThanOrEqual(1);
    expect(sim.snapshot().tabletQueueCount).toBeLessThanOrEqual(2);
    expect(sim.snapshot().tabletTicket).toBeTruthy();
    for (let i = 0; i < 240; i++) sim.tick(500);
    expect(sim.snapshot().tabletQueueCount).toBeLessThanOrEqual(6);
  });

  it("scripts the first beats as walk-in, pickup, then two deliveries", () => {
    const sim = GameSim.create({ seed: 7, autoSpawn: true });
    sim.tick(OPENING_FIRST_AT_MS + 50);
    expect(sim.snapshot().orders.map((o) => o.type)).toEqual(["inStore"]);
    sim.tick(OPENING_ORDER_GAP_MS);
    expect(sim.snapshot().orders.map((o) => o.type)).toEqual(["inStore", "pickup"]);
    sim.tick(OPENING_ORDER_GAP_MS);
    const types = sim.snapshot().orders.map((o) => o.type);
    expect(types.filter((t) => t === "delivery")).toHaveLength(2);
    expect(types).toHaveLength(4);
  });

  it("caps random ticket waves at 58 seconds apart", () => {
    expect(TICKET_WAVE_MAX_MS).toBe(58_000);
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
  });

  it("ends the shift at 23:00 with a results breakdown and no softlock mid-door", () => {
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    sim.hitTheRoad();
    startDoor(sim, "house-1");
    expect(sim.snapshot().dropoff.phase).toBe("atDoor");
    sim.tick(SHIFT_MS);
    const snap = sim.snapshot();
    expect(snap.clockLabel).toBe("23:00");
    expect(snap.shiftEnded).toBe(true);
    expect(snap.dropoff.phase).toBe("none");
    expect(snap.shiftResults).not.toBeNull();
    expect(snap.shiftResults!.breakdown).toBeDefined();
    sim.tick(5_000);
    expect(sim.snapshot().shiftEnded).toBe(true);
    expect(sim.snapshot().clockLabel).toBe("23:00");
  });

  it("allows end-shift early after a scored action and startNewDay clears score", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    expect(sim.endShiftEarly()).toBe(false);
    expect(sim.snapshot().canEndShiftEarly).toBe(false);
    fillTicket(sim, "inStore");
    expect(sim.score).toBe(SCORE_INSTORE);
    expect(sim.snapshot().canEndShiftEarly).toBe(true);
    expect(sim.endShiftEarly()).toBe(true);
    expect(sim.snapshot().shiftEnded).toBe(true);
    expect(sim.snapshot().shiftResults!.breakdown.inStore).toBe(1);
    sim.startNewDay();
    const snap = sim.snapshot();
    expect(snap.shiftEnded).toBe(false);
    expect(snap.clockLabel).toBe("09:00");
    expect(snap.score).toBe(0);
    expect(snap.playerRole).toBe("keyLead");
    expect(snap.shiftResults).toBeNull();
  });

  it("stops scoring after the shift ends", () => {
    const sim = GameSim.create({ seed: 3, autoSpawn: false });
    fillTicket(sim, "inStore");
    expect(sim.score).toBe(SCORE_INSTORE);
    expect(sim.snapshot().scoreFlash?.delta).toBe(SCORE_INSTORE);
    sim.endShift();
    const score = sim.score;
    sim.tick(60_000);
    expect(sim.score).toBe(score);
    expect(sim.snapshot().shiftEnded).toBe(true);
  });

  it("lets the driver leave a walk-in with the key lead instead of pinning them to the floor", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    const walk = sim.spawnOrder("inStore", { ageOk: true });
    waitForCustomerAtCounter(sim, walk.id);
    expect(sim.snapshot().canHitTheRoad).toBe(true);
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.snapshot().playerRole).toBe("driver");
    expect(sim.snapshot().toast).toContain(walk.customerName);
    runCover(sim, () => sim.orderById(walk.id)?.status === "completed");
    expect(sim.orderById(walk.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_INSTORE);
  });

  it("clears hand and key-lead fetch state when a walk-in walks out mid-fetch", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    waitForCustomerAtCounter(sim, order.id);
    sim.shopClick({ type: "strain", skuId: order.skuId });
    expect(sim.snapshot().keyLead.phase).not.toBe("idle");
    for (let t = 0; t < INSTORE_WALKOUT_MS + 2_000; t += 50) sim.tick(50);
    expect(sim.orderById(order.id)?.status).toBe("failed");
    expect(sim.snapshot().keyLead.phase).toBe("idle");
    expect(sim.snapshot().handSkuId).toBeNull();
  });

  it("catches up a key-lead fetch across a single long hitch frame", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "strain", skuId: order.skuId });
    expect(sim.snapshot().keyLead.phase).toBe("toBack");
    sim.tick(8_000);
    expect(sim.snapshot().keyLead.phase).toBe("idle");
    expect(sim.snapshot().handSkuId).toBe(order.skuId);
  });
});

describe("key lead covering the counter while the van is out", () => {
  /** Puts one packed delivery in the van and sends the player out. */
  function sendVanOut(sim: GameSim): void {
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
  }

  it("leaves the floor to the player while they are still in the shop", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    const walk = sim.spawnOrder("inStore", { ageOk: true });
    waitForCustomerAtCounter(sim, walk.id);
    expect(sim.snapshot().shopCover.active).toBe(false);
    for (let i = 0; i < 40; i++) sim.tick(50);
    expect(sim.orderById(walk.id)?.status).toBe("atRegister");
    expect(sim.score).toBe(0);
  });

  it("serves a walk-in who arrives after the van has already left", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    sendVanOut(sim);
    const walk = sim.spawnOrder("inStore", { ageOk: true });
    runCover(sim, () => sim.orderById(walk.id)?.status === "completed");
    expect(sim.orderById(walk.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_INSTORE);
  });

  it("hands off a pickup that ripens while the driver is away", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    const pick = fillTicket(sim, "pickup");
    sendVanOut(sim);
    expect(sim.orderById(pick.id)?.status).toBe("onPickupShelf");
    runCover(sim, () => sim.orderById(pick.id)?.status === "completed");
    expect(sim.orderById(pick.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_PICKUP);
  });

  it("packs and hands a pickup ticket that lands mid-run", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    sendVanOut(sim);
    const pick = sim.spawnOrder("pickup", { ageOk: true });
    runCover(sim, () => sim.orderById(pick.id)?.status === "completed");
    expect(sim.orderById(pick.id)?.status).toBe("completed");
    expect(sim.score).toBe(SCORE_PICKUP);
  });

  it("clears a stacked counter during a long run without losing anyone", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    sendVanOut(sim);
    const ids = Array.from({ length: 6 }, (_, n) =>
      sim.spawnOrder(n % 2 ? "inStore" : "pickup", { ageOk: true }).id,
    );
    runCover(sim, () => ids.every((id) => sim.orderById(id)?.status === "completed"), 1_200);
    expect(ids.map((id) => sim.orderById(id)?.status)).toEqual(ids.map(() => "completed"));
    expect(sim.score).toBe(3 * SCORE_INSTORE + 3 * SCORE_PICKUP);
    expect(sim.snapshot().shopCover.lost).toBe(0);
  });

  it("keeps packing when the player drove off with a ticket already claimed", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    const older = sim.spawnOrder("pickup", { ageOk: true });
    const newer = sim.spawnOrder("pickup", { ageOk: true });
    sim.shopClick({ type: "tablet", orderId: newer.id });
    expect(sim.snapshot().selectedOrderId).toBe(newer.id);
    expect(older.status).toBe("queued");
    expect(sim.hitTheRoad()).toBe(true);
    runCover(
      sim,
      () => [older.id, newer.id].every((id) => sim.orderById(id)?.status === "completed"),
      900,
    );
    expect(sim.orderById(newer.id)?.status).toBe("completed");
    expect(sim.orderById(older.id)?.status).toBe("completed");
  });

  it("scores each covered order exactly once and cannot be paid twice", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    sendVanOut(sim);
    const walk = sim.spawnOrder("inStore", { ageOk: true });
    const pick = sim.spawnOrder("pickup", { ageOk: true });
    runCover(sim, () =>
      [walk.id, pick.id].every((id) => sim.orderById(id)?.status === "completed"),
    );
    expect(sim.score).toBe(SCORE_INSTORE + SCORE_PICKUP);
    expect(sim.snapshot().shopCover.served).toBe(2);

    // Stale taps and further cover ticks must not re-close an order that is already paid.
    const score = sim.score;
    sim.shopClick({ type: "customer", orderId: walk.id });
    sim.shopClick({ type: "customer", orderId: pick.id });
    sim.shopClick({ type: "handoff" });
    for (let i = 0; i < 40; i++) sim.tick(50);
    expect(sim.score).toBe(score);
    expect(sim.snapshot().shopCover.served).toBe(2);
    expect(sim.snapshot().orders.some((o) => o.id === walk.id || o.id === pick.id)).toBe(false);

    sim.endShift();
    const breakdown = sim.snapshot().shiftResults!.breakdown;
    expect(breakdown.inStore).toBe(1);
    expect(breakdown.pickups).toBe(1);
    expect(breakdown.fails).toBe(0);
  });

  it("holds the courier hour on a bag packed while the van is out until the driver is back", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    sendVanOut(sim);
    const later = sim.spawnOrder("delivery", { destinationId: "house-3", ageOk: true });
    runCover(sim, () => sim.orderById(later.id)?.status === "inBin");
    expect(sim.orderById(later.id)?.status).toBe("inBin");
    expect(sim.orderById(later.id)?.slaStartGameMs).toBeUndefined();
    expect(sim.snapshot().orders.find((o) => o.id === later.id)?.slaRemainingMs).toBeNull();
    expect(sim.snapshot().shopCover.packed).toBe(1);

    // A run longer than the SLA itself must not hand the player a bag that is already late.
    sim.tick(MS_PER_GAME_HOUR);
    expect(sim.snapshot().orders.find((o) => o.id === later.id)?.late).toBe(false);

    const shop = tileToWorld(CITY.shopSpawn);
    sim.setVehiclePosition(shop.x, shop.y);
    expect(sim.backToShop()).toBe(true);
    expect(sim.orderById(later.id)?.slaStartGameMs).toBe(sim.clock.gameMs);
    const view = sim.snapshot().orders.find((o) => o.id === later.id)!;
    expect(view.late).toBe(false);
    expect(view.slaRemainingMs).toBeGreaterThan(MS_PER_GAME_HOUR - 50);
  });

  it("still starts the hour at the bag rack when the player packs it themselves", () => {
    const sim = GameSim.create({ seed: 5, autoSpawn: false });
    const order = fillTicket(sim, "delivery", { destinationId: "house-2" });
    expect(order.slaDeferred).toBeUndefined();
    expect(order.slaStartGameMs).toBe(sim.clock.gameMs);
  });

  it("tells the driver what the counter is doing and what it has cleared", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    expect(sim.snapshot().shopCover.active).toBe(false);
    sendVanOut(sim);
    const idle = sim.snapshot().shopCover;
    expect(idle.active).toBe(true);
    expect(idle.line).toBe("Counter is clear");
    expect(idle.served).toBe(0);

    const walk = sim.spawnOrder("inStore", { ageOk: true });
    sim.tick(50);
    const arriving = sim.snapshot().shopCover;
    expect(arriving.waiting).toBe(1);
    expect(arriving.line).toContain(walk.customerName);

    runCover(sim, () => sim.orderById(walk.id)?.status === "completed");
    const after = sim.snapshot().shopCover;
    expect(after.served).toBe(1);
    expect(after.waiting).toBe(0);
    expect(after.lost).toBe(0);
  });

  it("resets the cover tally on each new run", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    sendVanOut(sim);
    const walk = sim.spawnOrder("inStore", { ageOk: true });
    runCover(sim, () => sim.orderById(walk.id)?.status === "completed");
    expect(sim.snapshot().shopCover.served).toBe(1);

    const shop = tileToWorld(CITY.shopSpawn);
    sim.setVehiclePosition(shop.x, shop.y);
    expect(sim.backToShop()).toBe(true);
    expect(sim.snapshot().toast).toContain("1");
    fillTicket(sim, "delivery", { destinationId: "house-2" });
    expect(sim.hitTheRoad()).toBe(true);
    expect(sim.snapshot().shopCover.served).toBe(0);
  });
});

describe("recurring walk-in traffic", () => {
  interface DoorLog {
    /** Game time each walk-in was first seen on the floor, in spawn order. */
    spawnedAt: number[];
    ids: string[];
    /** Most walk-ins standing at the counter at any one sample. */
    maxAtOnce: number;
  }

  /**
   * Watch the front door for a whole shift. 500ms samples, not 50ms: a shift is 840s of
   * game time, and fine granularity here would run 16,800 ticks per test for no extra
   * signal — a walk-in lives ~21s, so nothing can slip between samples.
   */
  function watchDoor(sim: GameSim): DoorLog {
    const log: DoorLog = { spawnedAt: [], ids: [], maxAtOnce: 0 };
    const seen = new Set<string>();
    for (let t = 0; t < SHIFT_MS; t += 500) {
      sim.tick(500);
      const onFloor = sim.snapshot().orders.filter((o) => o.type === "inStore");
      log.maxAtOnce = Math.max(log.maxAtOnce, onFloor.length);
      for (const order of onFloor) {
        if (seen.has(order.id)) continue;
        seen.add(order.id);
        log.ids.push(order.id);
        log.spawnedAt.push(sim.clock.gameMs);
      }
    }
    return log;
  }

  function gapsBetween(times: number[]): number[] {
    return times.slice(1).map((t, i) => t - times[i]!);
  }

  it("keeps the door swinging all shift, not just at open", () => {
    const sim = GameSim.create({ seed: 3 });
    const log = watchDoor(sim);
    // ~20 walk-ins at a 24-60s beat. The band is wide enough for any seed but far above
    // the single scripted walk-in that used to be the whole day's foot traffic.
    expect(log.ids.length).toBeGreaterThanOrEqual(12);
    expect(log.ids.length).toBeLessThanOrEqual(30);
    // Spread across the shift, not bunched into the opening.
    expect(log.spawnedAt[log.spawnedAt.length - 1]).toBeGreaterThan(SHIFT_MS * 0.8);
  });

  it("holds the door beat to its 24-60s window", () => {
    const sim = GameSim.create({ seed: 3 });
    const gaps = gapsBetween(watchDoor(sim).spawnedAt);
    expect(gaps.length).toBeGreaterThanOrEqual(11);
    // 500ms of slack each way for the sampling rate above.
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(WALKIN_GAP_MIN_MS - 500);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(WALKIN_GAP_MAX_MS + 500);
  });

  it("never puts a second walk-in on the counter behind the first", () => {
    // Nobody serves anyone here, so every walk-in stands until they leave — the worst
    // case for stacking, and the one that proves the door waits for the spot to clear.
    const sim = GameSim.create({ seed: 5 });
    const log = watchDoor(sim);
    expect(log.maxAtOnce).toBe(1);
    expect(log.ids.length).toBeGreaterThanOrEqual(12);
  });

  it("puts a walk-in that arrives mid-run through the key lead's cover loop", () => {
    const sim = GameSim.create({ seed: 4 });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
    const walkInIds = () => sim.snapshot().orders.filter((o) => o.type === "inStore").map((o) => o.id);
    const atDeparture = new Set(walkInIds());
    const arrivals = () => walkInIds().filter((id) => !atDeparture.has(id));

    runCover(sim, () => arrivals().length > 0, 1_400);
    const arrival = arrivals()[0];
    expect(arrival).toBeDefined();
    const servedBefore = sim.snapshot().shopCover.served;

    runCover(sim, () => sim.orderById(arrival!)?.status === "completed", 400);
    expect(sim.orderById(arrival!)?.status).toBe("completed");
    expect(sim.snapshot().shopCover.served).toBeGreaterThan(servedBefore);
  });

  it("lets the key lead clear a full shift of walk-ins without losing one", () => {
    const sim = GameSim.create({ seed: 8 });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
    const log = watchDoor(sim);
    expect(log.ids.length).toBeGreaterThanOrEqual(12);
    expect(log.maxAtOnce).toBe(1);
    const statuses = log.ids.map((id) => sim.orderById(id)!.status);
    // A walk-in still crossing the floor at 23:00 is neither sold nor lost.
    expect(statuses.filter((s) => s === "failed")).toEqual([]);
    expect(statuses.filter((s) => s === "completed").length).toBeGreaterThanOrEqual(12);
  });

  it("leaves the driver's banner alone when someone walks in behind them", () => {
    const sim = GameSim.create({ seed: 6, autoSpawn: false });
    fillTicket(sim, "delivery", { destinationId: "house-1" });
    expect(sim.hitTheRoad()).toBe(true);
    const banner = sim.snapshot().toast;
    expect(banner).not.toBe("");
    sim.spawnOrder("inStore", { ageOk: true });
    expect(sim.snapshot().toast).toBe(banner);
  });
});
