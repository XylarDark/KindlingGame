import { describe, expect, it } from "vitest";
import {
  CITY,
  TILE,
  houseById,
  lotCenter,
  lotWorldRect,
  pathToHouse,
  shopWorldHit,
} from "./cityT0";

describe("city map", () => {
  it("uses large tiles and mixed house lots", () => {
    expect(TILE).toBeGreaterThanOrEqual(112);
    expect(CITY.houses.length).toBeGreaterThanOrEqual(12);
    const sizes = new Set(CITY.houses.map((h) => `${h.lotW}x${h.lotH}`));
    expect(sizes.size).toBeGreaterThan(1);
    expect(CITY.houses.some((h) => h.lotW >= 3 || h.lotH >= 3)).toBe(true);
  });

  it("keeps every house reachable from Kindling", () => {
    expect(CITY.walkable[CITY.shopSpawn.r]?.[CITY.shopSpawn.c]).toBe(true);
    for (const house of CITY.houses) {
      const path = pathToHouse(CITY.shopSpawn, house.id);
      expect(path.length, house.id).toBeGreaterThan(1);
      expect(path[path.length - 1]).toEqual(house.stop);
    }
  });

  it("sizes the Kindling return hit to the shop building lot", () => {
    const hit = shopWorldHit();
    const lot = lotWorldRect(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    const home = lotCenter(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    expect(hit.w).toBe(lot.right - lot.left);
    expect(hit.h).toBe(lot.bottom - lot.top);
    expect(hit.x).toBe(home.x);
    expect(hit.y).toBe(home.y);
    expect(houseById("house-1")).toBeTruthy();
  });
});
