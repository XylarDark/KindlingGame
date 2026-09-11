import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { clearPathCache, findPath } from "./pathfinding";
import { CITY, houseById, pathToHouse, roadTextureKey } from "../maps/cityT0";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const pathfindingSrc = readFileSync(join(root, "src/sim/pathfinding.ts"), "utf8").replace(/\r\n/g, "\n");

describe("pathfinding", () => {
  it("uses a binary heap — no open.sort per pop", () => {
    expect(pathfindingSrc).toContain("class MinHeap");
    expect(pathfindingSrc).not.toContain("open.sort");
  });

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

  it("caches shop→house paths for repeat lookups", () => {
    clearPathCache();
    const house = CITY.houses[0]!;
    const first = findPath(CITY.walkable, CITY.shopSpawn, house.stop);
    expect(first.length).toBeGreaterThan(1);
    const second = findPath(CITY.walkable, CITY.shopSpawn, house.stop);
    expect(second).toEqual(first);
    clearPathCache();
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
    expect(keys.has("tex-road-hn") || keys.has("tex-road-hs")).toBe(true);
    expect(keys.has("tex-road-vw") || keys.has("tex-road-ve")).toBe(true);
    expect(
      keys.has("tex-road-x-nw") ||
        keys.has("tex-road-x-ne") ||
        keys.has("tex-road-x-sw") ||
        keys.has("tex-road-x-se"),
    ).toBe(true);
  });
});
