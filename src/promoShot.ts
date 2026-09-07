import { houseById, tileToWorld } from "./maps/cityT0";
import { CALL_CONNECT_MS, NPC_INTERACT_COOLDOWN_MS } from "./sim/constants";
import type { GameSim } from "./sim/gameSim";

export type PromoShot = "drive" | "door";

/** `?shot=drive` (or map) / `?shot=door` (or id) for promo stills. */
export function shotQuery(): PromoShot | null {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get("shot");
    if (q === "drive" || q === "map") return "drive";
    if (q === "door" || q === "id") return "door";
  } catch {
    /* ignore */
  }
  return null;
}

function waitFetch(sim: GameSim): void {
  for (let i = 0; i < 300; i++) {
    if (sim.snapshot().keyLead.phase === "idle" && sim.snapshot().handSkuId) return;
    sim.tick(50);
  }
}

/** Seed a delivery mid-run (map) or at the ID-check porch (door). */
export function applyPromoShot(sim: GameSim): void {
  const shot = shotQuery();
  if (!shot) return;

  const order = sim.spawnOrder("delivery", { destinationId: "house-1", ageOk: true });
  sim.shopClick({ type: "tablet", orderId: order.id });
  sim.shopClick({ type: "strain", skuId: order.skuId });
  waitFetch(sim);
  sim.shopClick({ type: "bagRack" });
  sim.hitTheRoad();

  if (shot === "drive") {
    for (let i = 0; i < 140; i++) sim.tick(50);
    return;
  }

  const stop = houseById("house-1");
  if (!stop) return;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  sim.interact();
  sim.tick(CALL_CONNECT_MS + 32);
  sim.interact();
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
}
