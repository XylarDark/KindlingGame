import { describe, expect, it } from "vitest";
import { TILE } from "./cityT0";
import {
  TRAFFIC_BASE_SPEED,
  TRAFFIC_DENSITY,
  TRAFFIC_LOOK_AHEAD,
  TRAFFIC_LOOP_MAX,
  TRAFFIC_MIN_SEP,
  TRAFFIC_SPEED_SCALE,
  TRAFFIC_SPEED_STEP,
  TRAFFIC_VAN_DETECT,
  VAN_CRAWL_GAP,
  VAN_FOLLOW_GAP_SCALE,
  VAN_FOLLOW_MIN_SEP,
  VAN_MATCH_GAP,
  buildTrafficLoops,
  driveSpeedForTraffic,
  leadTrafficSpeed,
  trafficCars,
} from "./traffic";
import { routeIsOrthogonal } from "../sim/driveRoute";

describe("city traffic", () => {
  it("keeps every traffic loop strictly in-lane — no diagonal corner cuts", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    expect(loops.length).toBeGreaterThan(0);
    for (const loop of loops) {
      expect(routeIsOrthogonal(loop.points), loop.id).toBe(true);
      const a = loop.points[loop.points.length - 1]!;
      const b = loop.points[0]!;
      expect(
        Math.abs(a.x - b.x) <= 1.5 || Math.abs(a.y - b.y) <= 1.5,
        `${loop.id} close`,
      ).toBe(true);
    }
  });

  it("spawns about 25% fewer cars than a full loop fill", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const full = trafficCars(0, loops);
    let slots = 0;
    for (const loop of loops) slots += loop.length > TILE * 14 ? 2 : 1;
    expect(full.length).toBe(Math.max(1, Math.round(slots * TRAFFIC_DENSITY)));
  });

  it("moves cars along loops over time", () => {
    const loops = buildTrafficLoops(4);
    const a = trafficCars(0, loops);
    const b = trafficCars(8_000, loops);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toHaveLength(a.length);
    const moved = a.some((car, i) => Math.hypot(car.x - b[i]!.x, car.y - b[i]!.y) > 8);
    expect(moved).toBe(true);
  });

  it("keeps cars from overlapping each other", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    for (const t of [0, 1_500, 4_200, 9_000, 16_000, 28_500]) {
      const cars = trafficCars(t, loops);
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const gap = Math.hypot(cars[i]!.x - cars[j]!.x, cars[i]!.y - cars[j]!.y);
          expect(gap, `t=${t} ${cars[i]!.id} vs ${cars[j]!.id}`).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
        }
      }
    }
  });

  it("never lets cars pass through the delivery van", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    // Dense sweep: at the faster pace, cars meet the van mid-corner where a single
    // shove back along the lane opens less straight-line gap than it does on a straight.
    const times = Array.from({ length: 60 }, (_, i) => i * 900);
    for (const t of [...times, 2_000, 7_500, 14_000, 22_000]) {
      const raw = trafficCars(t, loops);
      if (raw.length === 0) continue;
      const van = { x: raw[0]!.x, y: raw[0]!.y, heading: raw[0]!.angle };
      const cars = trafficCars(t, loops, van);
      for (const car of cars) {
        const gap = Math.hypot(car.x - van.x, car.y - van.y);
        expect(gap, `t=${t} ${car.id}`).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
      }
    }
  });

  it("keeps one-way lane directions — no oncoming traffic in the same corridor", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    expect(loops.length).toBeGreaterThan(0);
    for (const t of [0, 3_000, 9_000, 18_000]) {
      const cars = trafficCars(t, loops);
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i]!;
          const b = cars[j]!;
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          if (gap > 160) continue;
          const facing =
            Math.cos(a.angle) * Math.cos(b.angle) + Math.sin(a.angle) * Math.sin(b.angle);
          if (facing > -0.5) continue;
          const lateral = Math.abs(-Math.sin(a.angle) * (b.x - a.x) + Math.cos(a.angle) * (b.y - a.y));
          expect(lateral, `oncoming ${a.id}/${b.id} t=${t}`).toBeGreaterThan(40);
        }
      }
    }
  });

  it("holds back for the delivery van without leaving the lane", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const base = trafficCars(4_000, loops);
    expect(base.length).toBeGreaterThan(0);
    const lead = base[0]!;
    const van = {
      x: lead.x + Math.cos(lead.angle) * (TRAFFIC_VAN_DETECT * 0.45),
      y: lead.y + Math.sin(lead.angle) * (TRAFFIC_VAN_DETECT * 0.45),
      heading: lead.angle,
    };
    const cars = trafficCars(4_000, loops, van);
    const reacted = cars.find((c) => c.id === lead.id);
    expect(reacted).toBeTruthy();
    const gap = Math.hypot(reacted!.x - van.x, reacted!.y - van.y);
    expect(gap).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
    expect(reacted!.speed).toBe(0);
    const lateral = Math.abs(
      -(Math.sin(lead.angle) * (reacted!.x - lead.x)) + Math.cos(lead.angle) * (reacted!.y - lead.y),
    );
    expect(lateral).toBeLessThan(12);
  });

  it("does not zero speed when the van approaches from behind", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const base = trafficCars(5_000, loops);
    expect(base.length).toBeGreaterThan(0);
    const lead = base[0]!;
    const van = {
      x: lead.x - Math.cos(lead.angle) * 80,
      y: lead.y - Math.sin(lead.angle) * 80,
      heading: lead.angle,
    };
    const cars = trafficCars(5_000, loops, van);
    const reacted = cars.find((c) => c.id === lead.id)!;
    expect(reacted.speed).toBeGreaterThan(0);
    // The car the van queues behind leaves the wider follow clearance.
    expect(Math.hypot(reacted.x - van.x, reacted.y - van.y)).toBeGreaterThanOrEqual(
      VAN_FOLLOW_MIN_SEP - 1,
    );
    expect(VAN_FOLLOW_MIN_SEP).toBeCloseTo(TRAFFIC_MIN_SEP * VAN_FOLLOW_GAP_SCALE, 6);
  });

  it("reports lead speed when a car is ahead in the same lane", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const cars = trafficCars(3_000, loops);
    expect(cars.length).toBeGreaterThan(0);
    const lead = cars[0]!;
    const player = {
      x: lead.x - Math.cos(lead.angle) * 90,
      y: lead.y - Math.sin(lead.angle) * 90,
      heading: lead.angle,
    };
    expect(leadTrafficSpeed(player, cars)).toBe(lead.speed);
    expect(leadTrafficSpeed({ x: lead.x + 400, y: lead.y + 400, heading: 0 }, cars)).toBeNull();
  });

  it("modulates cruise for clear / soft / hard / stopped lead bands", () => {
    const cruise = 380;
    const lead = {
      id: "lead",
      x: 200,
      y: 0,
      key: "tex-car",
      depth: 5,
      angle: 0,
      speed: 120,
    };
    const player = { x: 0, y: 0, heading: 0 };
    expect(driveSpeedForTraffic(player, [], cruise)).toBe(cruise);
    // Clear of the follow band: close the gap at lead speed + 20.
    expect(driveSpeedForTraffic(player, [{ ...lead, x: VAN_MATCH_GAP + 8 }], cruise)).toBe(
      Math.min(cruise, 140),
    );
    // Inside the follow band: match the lead car.
    expect(driveSpeedForTraffic(player, [{ ...lead, x: VAN_MATCH_GAP - 8 }], cruise)).toBe(
      Math.min(cruise, 120),
    );
    const nose = driveSpeedForTraffic(
      player,
      [{ ...lead, x: VAN_CRAWL_GAP - 8, speed: 0 }],
      cruise,
    );
    expect(nose).toBeGreaterThanOrEqual(cruise * 0.2);
    expect(nose).toBeLessThan(cruise);
  });

  it("keeps ambient cars at the scaled traffic pace", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const cars = trafficCars(6_000, loops);
    expect(cars.length).toBeGreaterThan(0);
    const tiers = [0, 1, 2].map((i) => (TRAFFIC_BASE_SPEED + i * TRAFFIC_SPEED_STEP) * TRAFFIC_SPEED_SCALE);
    for (const car of cars) {
      expect(tiers.some((t) => Math.abs(car.speed - t) < 1e-6), `${car.id} @ ${car.speed}`).toBe(true);
      // The 15% trim must land every tier above the old unscaled base pace.
      expect(car.speed).toBeGreaterThan(TRAFFIC_BASE_SPEED);
    }
    expect(Math.max(...cars.map((c) => c.speed))).toBeCloseTo(
      (TRAFFIC_BASE_SPEED + 2 * TRAFFIC_SPEED_STEP) * TRAFFIC_SPEED_SCALE,
      6,
    );
  });

  it("holds the van further back than the raw separation, still inside its look-ahead", () => {
    expect(VAN_FOLLOW_GAP_SCALE).toBeGreaterThan(1);
    expect(VAN_CRAWL_GAP).toBeCloseTo(TRAFFIC_MIN_SEP * 0.92 * VAN_FOLLOW_GAP_SCALE, 6);
    expect(VAN_MATCH_GAP).toBeCloseTo(TRAFFIC_MIN_SEP * 1.2 * VAN_FOLLOW_GAP_SCALE, 6);
    // A lead car must still be detectable at the widest band, or the van would never react.
    expect(VAN_MATCH_GAP).toBeLessThan(TRAFFIC_LOOK_AHEAD);
    // Crawl band clears the hard car↔car separation so the van settles behind, not inside it.
    expect(VAN_CRAWL_GAP).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP);

    const cruise = 380;
    const lead = { id: "lead", x: 0, y: 0, key: "tex-car", depth: 5, angle: 0, speed: 120 };
    const player = { x: 0, y: 0, heading: 0 };
    // At the old match-band edge the van now already matches speed instead of closing in.
    const atOldEdge = TRAFFIC_MIN_SEP * 1.2 + 1;
    expect(atOldEdge).toBeLessThan(VAN_MATCH_GAP);
    expect(driveSpeedForTraffic(player, [{ ...lead, x: atOldEdge }], cruise)).toBe(120);
  });

  it("never stalls the van behind a stopped lead car", () => {
    const cruise = 380;
    const lead = { id: "lead", x: 40, y: 0, key: "tex-car", depth: 5, angle: 0, speed: 0 };
    const player = { x: 0, y: 0, heading: 0 };
    for (const gap of [VAN_CRAWL_GAP * 0.5, VAN_CRAWL_GAP - 1, VAN_MATCH_GAP - 1, VAN_MATCH_GAP + 1]) {
      expect(driveSpeedForTraffic(player, [{ ...lead, x: gap }], cruise)).toBeGreaterThan(0);
    }
  });
});
