import { describe, expect, it } from "vitest";
import { CITY } from "./cityT0";
import { cityProps, cityStreetLamps } from "./cityDecor";

describe("city decorations", () => {
  it("places street lamps and furniture without moving shop spawn or house stops", () => {
    const lamps = cityStreetLamps();
    const props = cityProps();
    expect(lamps.length).toBeGreaterThan(6);
    expect(props.some((p) => p.key.startsWith("tex-car"))).toBe(true);
    expect(props.some((p) => p.key === "tex-mailbox")).toBe(true);
    expect(props.some((p) => p.key.startsWith("tex-tree"))).toBe(true);
    const spawn = `${CITY.shopSpawn.c},${CITY.shopSpawn.r}`;
    const stopKeys = new Set(CITY.houses.map((h) => `${h.stop.c},${h.stop.r}`));
    expect(spawn).toBeTruthy();
    expect(stopKeys.size).toBe(CITY.houses.length);
    expect(cityStreetLamps()).toEqual(lamps);
    expect(cityProps().length).toBe(props.length);
  });
});
