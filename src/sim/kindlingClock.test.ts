import { describe, expect, it, beforeEach } from "vitest";
import { GameSim } from "./gameSim";
import {
  FIXED_STEP_MS,
  MAX_STEPS_PER_FRAME,
  advanceSimClock,
  getClockAlpha,
  getClockStats,
  getSimInterpolator,
  resetKindlingClockForTests,
  setClockMode,
} from "./kindlingClock";

describe("kindlingClock fixed timestep", () => {
  beforeEach(() => {
    resetKindlingClockForTests();
    setClockMode("fixedRaw");
  });

  it("runs one 60 Hz step per ~16.67 ms frame", () => {
    let ticks = 0;
    let total = 0;
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const result = advanceSimClock({
      frameMs: FIXED_STEP_MS,
      tick: (dt) => {
        ticks += 1;
        total += dt;
        sim.tick(dt);
      },
      snapshot: () => sim.snapshot(),
    });
    expect(result.steps).toBe(1);
    expect(ticks).toBe(1);
    expect(total).toBeCloseTo(FIXED_STEP_MS, 4);
    expect(getClockAlpha()).toBeGreaterThanOrEqual(0);
  });

  it("caps steps per frame to avoid spiral of death", () => {
    let ticks = 0;
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    advanceSimClock({
      frameMs: FIXED_STEP_MS * (MAX_STEPS_PER_FRAME + 3),
      tick: (dt) => {
        ticks += 1;
        sim.tick(dt);
      },
      snapshot: () => sim.snapshot(),
    });
    expect(ticks).toBe(MAX_STEPS_PER_FRAME);
    expect(getClockStats().backlogMs).toBeLessThan(FIXED_STEP_MS);
  });

  it("smooth mode ticks once with the supplied frame delta", () => {
    setClockMode("smooth");
    let ticks = 0;
    let total = 0;
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    advanceSimClock({
      frameMs: 22,
      tick: (dt) => {
        ticks += 1;
        total += dt;
        sim.tick(dt);
      },
      snapshot: () => sim.snapshot(),
    });
    expect(ticks).toBe(1);
    expect(total).toBe(22);
    expect(getClockAlpha()).toBe(1);
  });

  it("seeds interpolator from snapshots", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    advanceSimClock({
      frameMs: FIXED_STEP_MS,
      tick: (dt) => sim.tick(dt),
      snapshot: () => sim.snapshot(),
    });
    const ip = getSimInterpolator();
    expect(ip.current.gameMs).toBeGreaterThan(0);
  });
});
