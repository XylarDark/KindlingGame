import { describe, expect, it } from "vitest";
import { buildTrafficLoops, trafficCars, TRAFFIC_MIN_SEP } from "./traffic";

describe("city traffic", () => {
  it("builds ambient road loops for cosmetic cars", () => {
    const loops = buildTrafficLoops(6);
    expect(loops.length).toBeGreaterThan(0);
    expect(loops.every((loop) => loop.points.length >= 3 && loop.length > 0)).toBe(true);
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
    const loops = buildTrafficLoops(6);
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
});
