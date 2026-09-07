import { describe, expect, it } from "vitest";
import {
  CITY,
  TILE,
  doorstepWorld,
  houseById,
  lotCenter,
  lotWorldRect,
  pathToHouse,
  shopWorldHit,
} from "./cityT0";

describe("city map", () => {
  it("uses large tiles, driveways, and mixed house lots", () => {
    expect(TILE).toBeGreaterThanOrEqual(112);
    expect(CITY.houses.length).toBeGreaterThanOrEqual(12);
    const sizes = new Set(CITY.houses.map((h) => `${h.lotW}x${h.lotH}`));
    expect(sizes.size).toBeGreaterThan(1);
    expect(CITY.houses.every((h) => h.parking.length >= 1)).toBe(true);
    expect(CITY.houses.some((h) => h.access === "garage")).toBe(true);
    expect(CITY.houses.some((h) => h.access === "walkway")).toBe(true);
    expect(CITY.houses.some((h) => h.access === "curb")).toBe(true);
    expect(CITY.shopLot.parking.length).toBeGreaterThanOrEqual(3);
    expect(CITY.houses.some((h) => h.lotW >= 2 && h.lotH >= 2)).toBe(true);
    expect(CITY.kinds[CITY.shopSpawn.r]![CITY.shopSpawn.c]).toBe("parking");
    expect(CITY.walkable[CITY.shopSpawn.r]![CITY.shopSpawn.c]).toBe(true);
    for (const house of CITY.houses) {
      expect(CITY.kinds[house.stop.r]![house.stop.c], house.id).toBe("parking");
      expect(CITY.walkable[house.stop.r]![house.stop.c], house.id).toBe(true);
      expect(house.parking.some((p) => p.c === house.stop.c && p.r === house.stop.r)).toBe(true);
    }
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

  it("places doorsteps on the driveway-facing facade, not mid-lawn", () => {
    for (const house of CITY.houses) {
      const door = doorstepWorld(house);
      const lot = lotWorldRect(house.house, house.lotW, house.lotH);
      const edge =
        door.x <= lot.left + 24 ||
        door.x >= lot.right - 24 ||
        door.y <= lot.top + 24 ||
        door.y >= lot.bottom - 24;
      expect(edge, house.id).toBe(true);
      expect(door.x).toBeGreaterThanOrEqual(lot.left);
      expect(door.x).toBeLessThanOrEqual(lot.right);
      expect(door.y).toBeGreaterThanOrEqual(lot.top);
      expect(door.y).toBeLessThanOrEqual(lot.bottom);
    }
  });
});
