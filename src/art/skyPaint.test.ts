import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { MS_PER_GAME_HOUR } from "../sim/constants";
import { skyAt } from "../sim/dayNight";

const here = dirname(fileURLToPath(import.meta.url));

describe("shared sky paint", () => {
  it("is used by the shop window and the door scene, not as a pot overlay", () => {
    const sky = readFileSync(join(here, "skyPaint.ts"), "utf8");
    const shop = readFileSync(join(here, "shopInterior.ts"), "utf8");
    const door = readFileSync(join(here, "doorstep.ts"), "utf8");
    expect(sky).toContain("export function paintSky");
    expect(sky).toContain("sky.zenith");
    expect(sky).toContain("sky.sunAlpha");
    expect(shop).toContain('from "./skyPaint"');
    expect(shop).toContain("paintSky(");
    expect(door).toContain('from "./skyPaint"');
    expect(door).toContain("paintSky(");
    expect(shop).toContain("Do not paint streetDoorGlass");
  });

  it("keeps morning brighter than late night so both scenes share one clock", () => {
    const morning = skyAt(0);
    const night = skyAt(13 * MS_PER_GAME_HOUR);
    expect(morning.zenith).toBeGreaterThan(night.zenith);
    expect(night.mapOverlayAlpha).toBeGreaterThan(morning.mapOverlayAlpha);
    expect(night.lampAlpha).toBeGreaterThan(morning.lampAlpha);
  });
});
