import { describe, expect, it } from "vitest";
import { findPath } from "./pathfinding";
import { CITY, houseById, pathToHouse, roadTextureKey } from "../maps/cityT0";

describe("pathfinding", () => {
  it("finds a trivial path", () => {
    const grid = [
      [true, true, true],
      [true, false, true],
      [true, true, true],
    ];
    const path = findPath(grid, { c: 0, r: 0 }, { c: 2, r: 0 });
    expect(path[0]).toEqual({ c: 0, r: 0 });
    expect(path[path.length - 1]).toEqual({ c: 2, r: 0 });
  });

  it("builds a neighborhood with many reachable delivery addresses", () => {
    expect(CITY.houses.length).toBeGreaterThanOrEqual(12);
    expect(houseById("house-1")).toBeTruthy();
    expect(houseById("house-3")).toBeTruthy();
    for (const house of CITY.houses) {
      const path = pathToHouse(CITY.shopSpawn, house.id);
      expect(path.length, house.id).toBeGreaterThan(1);
      expect(path[path.length - 1]).toEqual(house.stop);
    }
  });

  it("picks distinct road tiles for corridors and intersections", () => {
    const keys = new Set<string>();
    for (let r = 0; r < CITY.kinds.length; r++) {
      for (let c = 0; c < CITY.kinds[r]!.length; c++) {
        const kind = CITY.kinds[r]![c];
        if (kind === "road" || kind === "shop") keys.add(roadTextureKey(CITY.kinds, r, c));
      }
    }
    expect(keys.has("tex-road")).toBe(true);
    expect(keys.has("tex-road-v")).toBe(true);
  });
});
