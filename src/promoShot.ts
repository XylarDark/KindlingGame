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

/**
 * `?house=5` or `?house=house-5` aims the seeded delivery at one lot, so a capture can
 * reach a named stop instead of only the default one. Lots front streets of both
 * orientations, and a still of the van at a stop is only worth anything if you can choose
 * which stop. An unknown or malformed id falls back to the default rather than throwing.
 */
export function houseQuery(): string {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get("house");
    if (!raw) return DEFAULT_SHOT_HOUSE;
    const id = /^\d+$/.test(raw) ? `house-${raw}` : raw;
    return houseById(id) ? id : DEFAULT_SHOT_HOUSE;
  } catch {
    return DEFAULT_SHOT_HOUSE;
  }
}

const DEFAULT_SHOT_HOUSE = "house-1";

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

  const houseId = houseQuery();
  const order = sim.spawnOrder("delivery", { destinationId: houseId, ageOk: true });
  sim.shopClick({ type: "tablet", orderId: order.id });
  sim.shopClick({ type: "strain", skuId: order.skuId });
  waitFetch(sim);
  sim.shopClick({ type: "bagRack" });
  sim.hitTheRoad();

  if (shot === "drive") {
    for (let i = 0; i < 140; i++) sim.tick(50);
    return;
  }

  const stop = houseById(houseId);
  if (!stop) return;
  const pos = tileToWorld(stop.stop);
  sim.setVehiclePosition(pos.x, pos.y);
  sim.tick(32);
  sim.interact();
  sim.tick(CALL_CONNECT_MS + 32);
  sim.interact();
  sim.tick(NPC_INTERACT_COOLDOWN_MS + 16);
}
