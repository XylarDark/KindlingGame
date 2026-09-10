import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("DriveScene grade throttle and dirty guards", () => {
  const src = read("DriveScene.ts");

  it("throttles applyDayNight with shouldApplyGrade (diag rank #3)", () => {
    expect(src).toContain("shouldApplyGrade");
    expect(src).toContain("lastGradeKey");
    expect(src).toContain("lastGradeMs");
    expect(src).toContain("DRIVE_GRADE_MIN_MS");
    expect(src).toContain("DRIVE_FOCUS_GRID");
    const paint = src.slice(src.indexOf("private paintDayNight"), src.indexOf("private paintNightGlow"));
    expect(paint).toContain("shouldApplyGrade");
    expect(paint).toContain("applyDayNight");
  });

  it("dirty-guards pinLabel setText and lot glow redraw", () => {
    expect(src).toContain("lastPinWho");
    expect(src).toContain("if (who !== this.lastPinWho)");
    expect(src).toContain("lastLotGlowKey");
    expect(src).toContain("if (stopId !== this.lastLotGlowKey)");
  });

  it("skips paintDayNight when inactive and dirty-guards van banner + shop caption", () => {
    const paint = src.slice(src.indexOf("private paintDayNight"), src.indexOf("private paintNightGlow"));
    expect(paint).toContain("if (!this.sys.isActive()) return");
    expect(src).toContain("lastVanToast");
    expect(src).toContain("if (snap.toast !== this.lastVanToast)");
    expect(src).toContain("lastShopCaptionKey");
    expect(src).toContain("if (captionKey !== this.lastShopCaptionKey)");
  });

  it("removes PRE_RENDER day/night on SHUTDOWN", () => {
    expect(src).toContain("onPreRenderDayNight");
    expect(src).toContain("events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight)");
  });

  it("builds the city map in chunked rows under warm", () => {
    expect(src).toContain("buildCityChunked");
    expect(src).toContain("drawCityTileRows");
    expect(src).toContain("yieldToRenderer");
    expect(src).toContain("cityBuildReady");
  });

  it("bakes static ground/props into RenderTextures and keeps movers live", () => {
    expect(src).toContain("bakeStaticCityMap");
    expect(src).toContain("staticBakeList");
    expect(src).toContain("CITY_BAKE_CELL");
    expect(src).toContain("renderTexture");
    expect(src).toContain("disableCull = false");
    expect(src).toContain("TRAFFIC_CULL_PAD");
    // Interactive shop + movers must not be on the bake destroy list as the only path.
    expect(src).toContain("enableItemHit(this.shopImg)");
    expect(src).toContain("this.vehicle");
    expect(src).toContain("trafficSprites");
  });
});

describe("DoorScene grade throttle", () => {
  it("gates applyDayNight in PRE_RENDER like Drive (~80ms / dirty sky)", () => {
    const src = read("DoorScene.ts");
    expect(src).toContain("shouldApplyGrade");
    expect(src).toContain("lastGradeKey");
    expect(src).toContain("paintDoorDayNight");
    expect(src).toContain("onPreRenderDayNight");
    const block = src.slice(src.indexOf("private paintDoorDayNight"), src.indexOf("function doorFlashPhase"));
    expect(block).toContain("shouldApplyGrade");
    expect(block).toContain("applyDayNight");
    expect(block).toContain("if (!this.sys.isActive()) return");
  });
});
