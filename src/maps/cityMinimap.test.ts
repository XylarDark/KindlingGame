import { describe, expect, it } from "vitest";
import {
  CITY_ASPECT,
  cityMinimapGeometry,
  fitCityPanel,
  minimapProjection,
  type WorldRect,
} from "./cityMinimap";
import { CITY, MAP_PX_H, MAP_PX_W, TILE, isEWStreet, isNSStreet } from "./cityT0";

/** `MAX_HOUSES` in cityT0 is private; the map is specced to fourteen lots. */
const MAX_HOUSES = 14;

const area = (r: WorldRect): number => (r.right - r.left) * (r.bottom - r.top);

const overlaps = (a: WorldRect, b: WorldRect): boolean =>
  a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

describe("minimapProjection", () => {
  const box = { x: 100, y: 40, w: 224, h: 224 / CITY_ASPECT };

  it("maps the city corners onto the panel corners", () => {
    const p = minimapProjection(box);
    expect(p.toMap(0, 0).x).toBeCloseTo(box.x, 6);
    expect(p.toMap(0, 0).y).toBeCloseTo(box.y, 6);
    expect(p.toMap(MAP_PX_W, MAP_PX_H).x).toBeCloseTo(box.x + box.w, 6);
    expect(p.toMap(MAP_PX_W, MAP_PX_H).y).toBeCloseTo(box.y + box.h, 6);
  });

  it("uses one scale on both axes, so the city is not stretched", () => {
    const p = minimapProjection({ x: 0, y: 0, w: 300, h: 100 });
    const wide = p.toMap(MAP_PX_W, 0).x - p.toMap(0, 0).x;
    const tall = p.toMap(0, MAP_PX_H).y - p.toMap(0, 0).y;
    expect(wide / tall).toBeCloseTo(CITY_ASPECT, 6);
  });

  it("centres the city when the box does not carry its aspect", () => {
    const p = minimapProjection({ x: 0, y: 0, w: 300, h: 300 });
    expect(p.ox).toBeCloseTo(0, 6);
    expect(p.oy).toBeGreaterThan(0);
  });

  it("returns integer rects, so adjoining fills share an edge", () => {
    const p = minimapProjection(box);
    const a = p.rect({ left: 0, top: 0, right: TILE, bottom: TILE });
    const b = p.rect({ left: TILE, top: 0, right: TILE * 2, bottom: TILE });
    expect(Number.isInteger(a.x)).toBe(true);
    expect(Number.isInteger(a.w)).toBe(true);
    expect(a.x + a.w).toBe(b.x);
  });

  it("never collapses a rect to nothing at phone scale", () => {
    const p = minimapProjection(box);
    const hairline = p.rect({ left: 0, top: 0, right: 1, bottom: 1 });
    expect(hairline.w).toBeGreaterThanOrEqual(1);
    expect(hairline.h).toBeGreaterThanOrEqual(1);
  });
});

describe("fitCityPanel", () => {
  it("gives back the city's aspect from a wider space", () => {
    const panel = fitCityPanel({ x: 0, y: 0, w: 204, h: 108 });
    expect(panel.w / panel.h).toBeCloseTo(CITY_ASPECT, 6);
    expect(panel.h).toBeLessThanOrEqual(108);
  });

  it("gives back the city's aspect from a taller space", () => {
    const panel = fitCityPanel({ x: 0, y: 0, w: 224, h: 400 });
    expect(panel.w / panel.h).toBeCloseTo(CITY_ASPECT, 6);
    expect(panel.w).toBeLessThanOrEqual(224);
  });

  it("centres the panel and stays inside the space offered", () => {
    const avail = { x: 10, y: 20, w: 224, h: 200 };
    const panel = fitCityPanel(avail);
    expect(panel.x).toBeGreaterThanOrEqual(avail.x);
    expect(panel.y).toBeGreaterThanOrEqual(avail.y);
    expect(panel.x + panel.w).toBeLessThanOrEqual(avail.x + avail.w + 1e-9);
    expect(panel.y + panel.h).toBeLessThanOrEqual(avail.y + avail.h + 1e-9);
    expect(panel.x - avail.x).toBeCloseTo(avail.x + avail.w - (panel.x + panel.w), 6);
  });

  it("wastes nothing when the space already carries the city's aspect", () => {
    const avail = { x: 0, y: 0, w: 224, h: 224 / CITY_ASPECT };
    const panel = fitCityPanel(avail);
    expect(panel.w).toBeCloseTo(avail.w, 6);
    expect(panel.h).toBeCloseTo(avail.h, 6);
  });
});

describe("cityMinimapGeometry", () => {
  const geo = cityMinimapGeometry();

  it("draws every house lot — the old map drew none of them", () => {
    expect(geo.houses).toHaveLength(CITY.houses.length);
    expect(geo.houses.length).toBeGreaterThan(0);
    expect(geo.houses.length).toBeLessThanOrEqual(MAX_HOUSES);
    expect(geo.stalls).toHaveLength(geo.houses.length);
    expect(geo.houses.map((h) => h.id)).toEqual(geo.stalls.map((s) => s.id));
  });

  it("keeps every feature inside the city bounds", () => {
    const all = [
      ...geo.streetsEW,
      ...geo.streetsNS,
      ...geo.blocks,
      ...geo.houses.map((h) => h.rect),
      ...geo.stalls.map((s) => s.rect),
      geo.shop,
      ...geo.shopStalls,
    ];
    for (const r of all) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.right).toBeLessThanOrEqual(MAP_PX_W);
      expect(r.bottom).toBeLessThanOrEqual(MAP_PX_H);
      expect(area(r)).toBeGreaterThan(0);
    }
  });

  it("emits streets as whole bands, matching the procedural predicates", () => {
    expect(geo.streetsEW).toHaveLength(4);
    expect(geo.streetsNS).toHaveLength(5);
    for (const band of geo.streetsEW) {
      for (let r = band.top / TILE; r < band.bottom / TILE; r++) expect(isEWStreet(r)).toBe(true);
      // Two-lane: exactly two tile rows per band, as one rect with no seam.
      expect(band.bottom - band.top).toBe(TILE * 2);
    }
    for (const band of geo.streetsNS) {
      for (let c = band.left / TILE; c < band.right / TILE; c++) expect(isNSStreet(c)).toBe(true);
      expect(band.right - band.left).toBe(TILE * 2);
    }
  });

  it("covers every interior tile with either a block or a street", () => {
    const inside = (r: WorldRect, c: number, row: number): boolean =>
      c * TILE >= r.left && (c + 1) * TILE <= r.right && row * TILE >= r.top && (row + 1) * TILE <= r.bottom;
    for (let r = geo.interior.top / TILE; r < geo.interior.bottom / TILE; r++) {
      for (let c = geo.interior.left / TILE; c < geo.interior.right / TILE; c++) {
        const onStreet = isEWStreet(r) || isNSStreet(c);
        const drawn = onStreet
          ? [...geo.streetsEW, ...geo.streetsNS].some((band) => inside(band, c, r))
          : geo.blocks.some((block) => inside(block, c, r));
        expect(drawn, `tile ${c},${r} is undrawn`).toBe(true);
      }
    }
  });

  it("does not lay a block on top of a street", () => {
    for (const block of geo.blocks) {
      for (const street of [...geo.streetsEW, ...geo.streetsNS]) {
        expect(overlaps(block, street)).toBe(false);
      }
    }
  });

  it("puts the destination pin on the house lot, not the parking stall", () => {
    // The old map marked `house.stop`; a lot is a many-tile rect, a stall is not.
    for (let i = 0; i < geo.houses.length; i++) {
      const house = geo.houses[i]!;
      const stall = geo.stalls[i]!;
      expect(area(house.rect)).toBeGreaterThan(TILE * TILE);
      expect(area(house.rect)).toBeGreaterThan(area(stall.rect));
    }
  });

  it("draws the shop from its lot, the same way houses are drawn", () => {
    expect(geo.shop.right - geo.shop.left).toBe(CITY.shopLot.w * TILE);
    expect(geo.shop.bottom - geo.shop.top).toBe(CITY.shopLot.h * TILE);
    expect(geo.shopStalls).toHaveLength(CITY.shopLot.parking.length);
  });

  it("is cheap enough to bake once: a few hundred rects, not 1120 a frame", () => {
    const rects =
      geo.streetsEW.length +
      geo.streetsNS.length +
      geo.blocks.length +
      geo.houses.length +
      geo.stalls.length +
      1 +
      geo.shopStalls.length;
    expect(rects).toBeLessThan(120);
  });

  it("is deterministic, so the static layer can be baked once", () => {
    expect(cityMinimapGeometry()).toEqual(geo);
  });
});
