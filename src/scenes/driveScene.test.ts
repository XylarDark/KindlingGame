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
    expect(src).toContain("stopId !== this.lastLotGlowKey");
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

  it("skips shop caption plaque work when not driving", () => {
    expect(src).toContain("if (!driving)");
    expect(src).toContain("Skip plaque setText");
    expect(src).toContain("shopCaptionHost.setVisible(false)");
  });

  it("never shows sign plaques with empty copy", () => {
    expect(src).toContain("setSignCopy(this.pinLabel");
    expect(src).toContain("setSignCopy(this.vanBanner");
    expect(src).toContain("setSignCopy(this.shopCaption");
    expect(src).not.toMatch(/pinLabel\.setVisible\(true\)/);
  });

  it("animates the pin from gameMs with no idle tweens", () => {
    expect(src).not.toContain("this.tweens.add");
    expect(src).toContain("PIN_CYCLE_MS");
    expect(src).toContain("Math.sin((snap.gameMs / PIN_CYCLE_MS)");
    const update = src.slice(src.indexOf("update(): void"), src.indexOf("private syncDriveLabelScale"));
    expect(update).toContain("pinActive = !!stopId && this.sys.isActive()");
    expect(update).not.toMatch(/pinLabel\.setAlpha\(0\.85 \+/);
    expect(update).not.toMatch(/shopCaption\.setAlpha\(flashShop/);
  });

  it("keeps drive sign copy on plaques with screen-stable scale", () => {
    expect(src).toContain("addSignText");
    expect(src).toContain("setSignCopy");
    expect(src).toContain("mountDriveSign");
    expect(src).toContain("pinLabelHost");
    expect(src).toContain("syncDriveLabelScale");
    expect(src).toContain("syncSignPlaque");
    expect(src).toContain("setFixedSize(0, 0)");
    expect(src).toContain("fitTypeToBox(this.vanBanner");
    expect(src).toContain("this.pin.displayHeight");
    expect(src).toContain("this.vehicle.displayHeight");
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
