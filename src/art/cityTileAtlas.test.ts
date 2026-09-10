import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { CITY_TILE_ATLAS_FRAMES, CITY_TILE_ATLAS_KEY } from "./cityTileAtlas";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "cityTileAtlas.ts"), "utf8");

describe("cityTileAtlas", () => {
  it("packs grass/road/parking keys into one atlas key", () => {
    expect(CITY_TILE_ATLAS_KEY).toBe("atlas-city-tiles");
    expect(CITY_TILE_ATLAS_FRAMES).toContain("tex-wall");
    expect(CITY_TILE_ATLAS_FRAMES).toContain("tex-parking");
    expect(CITY_TILE_ATLAS_FRAMES).toContain("tex-road-hn");
    expect(src).toContain("createCanvas");
    expect(src).toContain("canvasTex.add");
  });
});
