import { describe, expect, it } from "vitest";
import { GameSim } from "./gameSim";
import { lerpMoverHeading, lerpMoverScalar, lerpMoverState, SimInterpolator, type MoverState } from "./simInterpolator";

const base: MoverState = {
  gameMs: 1000,
  vehicle: { x: 0, y: 0, heading: 0 },
  driverOnFoot: true,
  driver: { x: 80, y: 30 },
};

const next: MoverState = {
  gameMs: 2000,
  vehicle: { x: 100, y: 50, heading: Math.PI / 2 },
  driverOnFoot: true,
  driver: { x: 90, y: 40 },
};

describe("simInterpolator", () => {
  it("lerps scalars and headings at alpha 0.5", () => {
    expect(lerpMoverScalar(0, 100, 0.5)).toBe(50);
    expect(lerpMoverHeading(0, Math.PI / 2, 0.5)).toBeCloseTo(Math.PI / 4, 4);
  });

  it("lerps vehicle and driver between mover states", () => {
    const mid = lerpMoverState(base, next, 0.5);
    expect(mid.gameMs).toBe(1500);
    expect(mid.vehicle.x).toBe(50);
    expect(mid.vehicle.y).toBe(25);
    expect(mid.driver).toEqual({ x: 85, y: 35 });
  });

  it("holds prev/curr for interpolation alpha", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const ip = new SimInterpolator();
    ip.seed(sim.snapshot());
    sim.tick(16);
    ip.markStepStart(sim.snapshot());
    ip.push(sim.snapshot());
    const half = ip.lerp(0.5);
    expect(half.vehicle.x).toBeGreaterThan(0);
  });
});
