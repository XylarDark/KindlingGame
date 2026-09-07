import { afterEach, describe, expect, it, vi } from "vitest";
import { applyPromoShot } from "./promoShot";
import { GameSim } from "./sim/gameSim";

describe("applyPromoShot", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("seeds a mid-run drive with a GPS stop", () => {
    vi.stubGlobal("location", { search: "?shot=drive" });
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    applyPromoShot(sim);
    const snap = sim.snapshot();
    expect(snap.playerRole).toBe("driver");
    expect(snap.run?.nextStopId).toBe("house-1");
    expect(snap.autoDriving || snap.dropoff.phase === "atCurb").toBe(true);
  });

  it("seeds the porch at CHECK ID with a card", () => {
    vi.stubGlobal("location", { search: "?shot=door" });
    const sim = GameSim.create({ seed: 4, autoSpawn: false });
    applyPromoShot(sim);
    const snap = sim.snapshot();
    expect(snap.playerRole).toBe("driver");
    expect(snap.dropoff.phase).toBe("atDoor");
    expect(snap.dropoff.idAsked).toBe(true);
    expect(snap.dropoff.idCard).not.toBeNull();
    expect(snap.dropoff.idChecked).toBe(false);
  });
});
