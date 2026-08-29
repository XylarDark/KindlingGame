import { describe, expect, it } from "vitest";
import { GameSim } from "./gameSim";
import { tutorialHints } from "./tutorialHints";

describe("tutorialHints", () => {
  it("points at the walk-in strain, then the customer", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    const order = sim.spawnOrder("inStore");
    expect(tutorialHints(sim.snapshot())).toEqual([
      expect.objectContaining({ kind: "strain", skuId: order.skuId }),
    ]);
    sim.shopClick({ type: "strain", skuId: order.skuId });
    for (let i = 0; i < 240; i++) {
      if (sim.snapshot().handSkuId && sim.snapshot().keyLead.phase === "idle") break;
      sim.tick(50);
    }
    expect(tutorialHints(sim.snapshot())).toEqual([
      expect.objectContaining({ kind: "customer", orderId: order.id }),
    ]);
  });

  it("points at the front ticket, then the bag stack after a pick", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const a = sim.spawnOrder("pickup");
    const b = sim.spawnOrder("delivery", { destinationId: "house-1" });
    const kinds = tutorialHints(sim.snapshot()).map((h) => h.id);
    expect(kinds).toContain(`tablet:${a.id}`);
    expect(kinds).not.toContain(`tablet:${b.id}`);
    sim.shopClick({ type: "tablet", orderId: a.id });
    expect(tutorialHints(sim.snapshot()).some((h) => h.kind === "bagRack")).toBe(true);
  });

  it("walks a pickup bag through TV, bag, receipt, bag", () => {
    const sim = GameSim.create({ seed: 1, autoSpawn: false });
    const order = sim.spawnOrder("pickup");
    sim.shopClick({ type: "tablet", orderId: order.id });
    sim.shopClick({ type: "bagRack" });
    expect(tutorialHints(sim.snapshot())).toEqual([
      expect.objectContaining({ kind: "strain", skuId: order.skuId }),
    ]);
    sim.shopClick({ type: "strain", skuId: order.skuId });
    for (let i = 0; i < 240; i++) {
      if (sim.snapshot().handSkuId && sim.snapshot().keyLead.phase === "idle") break;
      sim.tick(50);
    }
    expect(tutorialHints(sim.snapshot()).some((h) => h.kind === "counterBag")).toBe(true);
    sim.shopClick({ type: "counterBag" });
    expect(tutorialHints(sim.snapshot()).some((h) => h.kind === "receipt")).toBe(true);
    sim.shopClick({ type: "receipt" });
    expect(tutorialHints(sim.snapshot()).some((h) => h.kind === "counterBag")).toBe(true);
  });
});
