import { describe, expect, it } from "vitest";
import { CITY, TILE } from "./cityT0";
import { cityAccessPaths, cityProps, cityStreetLamps } from "./cityDecor";

describe("city decorations", () => {
  it("places street lamps and parks cars only on driveways", () => {
    const lamps = cityStreetLamps();
    const props = cityProps();
    expect(lamps.length).toBeGreaterThan(6);
    expect(props.some((p) => p.key.startsWith("tex-car"))).toBe(true);
    expect(props.some((p) => p.key === "tex-mailbox")).toBe(true);
    expect(props.some((p) => p.key.startsWith("tex-tree"))).toBe(true);
    expect(props.some((p) => p.key === "tex-garage")).toBe(true);
    const parkingKeys = new Set(
      [...CITY.houses.flatMap((h) => h.parking), ...CITY.shopLot.parking].map((p) => `${p.c},${p.r}`),
    );
    for (const prop of props.filter((p) => p.key.startsWith("tex-car"))) {
      const cellC = Math.floor(prop.x / TILE);
      const cellR = Math.floor(prop.y / TILE);
      expect(parkingKeys.has(`${cellC},${cellR}`), `car at ${cellC},${cellR}`).toBe(true);
    }
    const spawn = `${CITY.shopSpawn.c},${CITY.shopSpawn.r}`;
    const stopKeys = new Set(CITY.houses.map((h) => `${h.stop.c},${h.stop.r}`));
    expect(spawn).toBeTruthy();
    expect(stopKeys.size).toBe(CITY.houses.length);
    expect(cityStreetLamps()).toEqual(lamps);
    expect(cityProps().length).toBe(props.length);
  });

  it("builds an access path for every house style", () => {
    const paths = cityAccessPaths();
    expect(paths).toHaveLength(CITY.houses.length);
    expect(paths.every((p) => p.points.length >= 2 && p.width > 0)).toBe(true);
    expect(paths.some((p) => p.kind === "drive")).toBe(true);
    expect(paths.some((p) => p.kind === "walk")).toBe(true);
    expect(paths.some((p) => p.kind === "flag")).toBe(true);
  });

  it("routes access on the lawn — not through parking stall centers", () => {
    const paths = cityAccessPaths();
    CITY.houses.forEach((house, i) => {
      const path = paths[i]!;
      for (const pad of house.parking) {
        const center = { x: pad.c * TILE + TILE / 2, y: pad.r * TILE + TILE / 2 };
        for (const pt of path.points) {
          const gap = Math.hypot(pt.x - center.x, pt.y - center.y);
          expect(gap, `${house.id} ${house.access} vs ${pad.c},${pad.r}`).toBeGreaterThanOrEqual(TILE * 0.4);
        }
      }
      // Orthogonal only: each leg is axis-aligned.
      for (let j = 1; j < path.points.length; j++) {
        const a = path.points[j - 1]!;
        const b = path.points[j]!;
        expect(Math.abs(a.x - b.x) < 12 || Math.abs(a.y - b.y) < 12).toBe(true);
      }
    });
  });
});
