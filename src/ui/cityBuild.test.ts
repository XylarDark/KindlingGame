import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import {
  CITY_BUILD_ROWS_PER_CHUNK,
  isCityBuildComplete,
  markCityBuildComplete,
  resetCityBuildFlags,
} from "./cityBuild";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("cityBuild flags", () => {
  beforeEach(() => resetCityBuildFlags());

  it("tracks drive map build completion", () => {
    expect(isCityBuildComplete()).toBe(false);
    markCityBuildComplete();
    expect(isCityBuildComplete()).toBe(true);
    resetCityBuildFlags();
    expect(isCityBuildComplete()).toBe(false);
  });

  it("chunks rows in small batches for incremental warm", () => {
    expect(CITY_BUILD_ROWS_PER_CHUNK).toBeGreaterThan(0);
    expect(CITY_BUILD_ROWS_PER_CHUNK).toBeLessThanOrEqual(8);
  });
});

describe("chunked city wiring guards", () => {
  it("DriveScene builds the map incrementally and gates update until ready", () => {
    const drive = read("src/scenes/DriveScene.ts");
    expect(drive).toContain("buildCityChunked");
    expect(drive).toContain("CITY_BUILD_ROWS_PER_CHUNK");
    expect(drive).toContain("yieldToRenderer");
    expect(drive).toContain("markCityBuildComplete");
    expect(drive).toContain("if (!this.cityBuildReady) return");
    expect(drive).toContain("bakeStaticCityMap");
    expect(drive).not.toContain("private drawCity(): void");
  });

  it("Boot and Title warm wait for city build before sleeping drive", () => {
    const boot = read("src/scenes/BootScene.ts");
    const title = read("src/scenes/TitleScene.ts");
    expect(boot).toContain("isCityBuildComplete");
    expect(boot).toContain("resetCityBuildFlags");
    expect(title).toContain("isCityBuildComplete");
  });
});
