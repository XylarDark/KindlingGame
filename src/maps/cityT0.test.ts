import { describe, expect, it } from "vitest";
import {
  CITY,
  MAP_COLS,
  MAP_ROWS,
  MAX_HOUSES,
  TILE,
  buildCityMap,
  cityBlocks,
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
    // All fourteen, by id — a lot that generates but cannot be driven to is the exact
    // silent failure spreading the lots across the map could introduce.
    expect(CITY.houses).toHaveLength(MAX_HOUSES);
    expect(CITY.houses.map((h) => h.id)).toEqual(
      Array.from({ length: MAX_HOUSES }, (_, i) => `house-${i + 1}`),
    );
    for (const house of CITY.houses) {
      const path = pathToHouse(CITY.shopSpawn, house.id);
      expect(path.length, house.id).toBeGreaterThan(1);
      expect(path[path.length - 1]).toEqual(house.stop);
      // Every cell of the route has to be drivable, not just its endpoints.
      for (const cell of path) {
        expect(CITY.walkable[cell.r]?.[cell.c], `${house.id} via ${cell.c},${cell.r}`).toBe(true);
      }
      // The stall is only a stall if the van can turn into it off a street.
      const touchesStreet = [
        { c: house.stop.c - 1, r: house.stop.r },
        { c: house.stop.c + 1, r: house.stop.r },
        { c: house.stop.c, r: house.stop.r - 1 },
        { c: house.stop.c, r: house.stop.r + 1 },
      ].some((n) => CITY.kinds[n.r]?.[n.c] === "road");
      expect(touchesStreet, `${house.id} stall is not on a street`).toBe(true);
    }
  });

  it("spreads the lots over every block, instead of filling the first row", () => {
    const blocks = cityBlocks();
    expect(blocks.length).toBeGreaterThanOrEqual(12);
    const counts = blocks.map(
      (b) =>
        CITY.houses.filter(
          (h) => h.house.r >= b.r0 && h.house.r <= b.r1 && h.house.c >= b.c0 && h.house.c <= b.c1,
        ).length,
    );
    // The old row-major scan hit MAX_HOUSES inside block row one and left the rest of
    // the city — two thirds of the phone minimap — blank. Every block now has a lot.
    expect(counts.every((n) => n >= 1), `per-block counts: ${counts.join(",")}`).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(MAX_HOUSES);

    // And they reach the far edges, not just one lot token-placed per block.
    const rows = CITY.houses.map((h) => h.house.r);
    const cols = CITY.houses.map((h) => h.house.c);
    expect(Math.max(...rows) - Math.min(...rows)).toBeGreaterThan(MAP_ROWS / 2);
    expect(Math.max(...cols) - Math.min(...cols)).toBeGreaterThan(MAP_COLS / 2);
  });

  it("builds the same city every time — the minimap bakes its static layer on that", () => {
    const a = buildCityMap();
    const b = buildCityMap();
    expect(a.houses).toEqual(b.houses);
    expect(a.shopSpawn).toEqual(b.shopSpawn);
    expect(a.kinds).toEqual(b.kinds);
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
