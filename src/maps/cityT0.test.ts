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

  it("covers the Kindling building with a generous return hitbox", () => {
    const hit = shopWorldHit();
    const lot = lotWorldRect(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    const home = lotCenter(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    expect(hit.w).toBeGreaterThan(lot.right - lot.left);
    expect(hit.h).toBeGreaterThan(lot.bottom - lot.top);
    expect(Math.abs(hit.x - home.x)).toBeLessThan(TILE);
    expect(hit.x - hit.w / 2).toBeLessThanOrEqual(lot.left);
    expect(hit.x + hit.w / 2).toBeGreaterThanOrEqual(lot.right);
    expect(hit.y - hit.h / 2).toBeLessThanOrEqual(lot.top);
    expect(hit.y + hit.h / 2).toBeGreaterThanOrEqual(lot.bottom);
    expect(houseById("house-1")).toBeTruthy();
  });
});
