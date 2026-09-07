import { describe, expect, it } from "vitest";
import { TILE } from "./cityT0";
import {
  TRAFFIC_DENSITY,
  TRAFFIC_LOOP_MAX,
  TRAFFIC_MIN_SEP,
  TRAFFIC_VAN_DETECT,
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
    for (const t of [0, 2_000, 7_500, 14_000, 22_000]) {
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
    expect(driveSpeedForTraffic(player, [{ ...lead, x: 150 }], cruise)).toBe(Math.min(cruise, 140));
    expect(driveSpeedForTraffic(player, [{ ...lead, x: 120 }], cruise)).toBe(Math.min(cruise, 120));
    const nose = driveSpeedForTraffic(player, [{ ...lead, x: 80, speed: 0 }], cruise);
    expect(nose).toBeGreaterThanOrEqual(cruise * 0.2);
    expect(nose).toBeLessThan(cruise);
  });
});
