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

  it("aims the seeded run at the lot ?house names, in either spelling", () => {
    for (const search of ["?shot=drive&house=5", "?shot=drive&house=house-5"]) {
      vi.stubGlobal("location", { search });
      const sim = GameSim.create({ seed: 4, autoSpawn: false });
      applyPromoShot(sim);
      expect(sim.snapshot().run?.nextStopId, search).toBe("house-5");
    }
  });

  it("falls back to the default lot when ?house names one that does not exist", () => {
    for (const search of ["?shot=drive&house=nope", "?shot=drive&house=999", "?shot=drive&house="]) {
      vi.stubGlobal("location", { search });
      const sim = GameSim.create({ seed: 4, autoSpawn: false });
      applyPromoShot(sim);
      expect(sim.snapshot().run?.nextStopId, search).toBe("house-1");
    }
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
