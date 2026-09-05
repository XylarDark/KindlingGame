import { describe, expect, it } from "vitest";
import { buildTrafficLoops, trafficCars } from "./traffic";

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
    expect(a).toHaveLength(loops.length);
    expect(b).toHaveLength(loops.length);
    const moved = a.some((car, i) => Math.hypot(car.x - b[i]!.x, car.y - b[i]!.y) > 8);
    expect(moved).toBe(true);
  });
});
