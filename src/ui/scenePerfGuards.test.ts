import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("scene perf guards", () => {
  it("Drive skips redundant night glow when PostFX is on", () => {
    const src = read("src/scenes/DriveScene.ts");
    const glow = src.slice(src.indexOf("private paintNightGlow"), src.indexOf("private returnToShop"));
    expect(glow).toContain("if (getRenderBudget().postFx) return");
  });

  it("Drive and Door skip PRE_RENDER / paint when inactive", () => {
    const drive = read("src/scenes/DriveScene.ts");
    const door = read("src/scenes/DoorScene.ts");
    expect(drive).toContain("if (!this.sys.isActive()) return");
    expect(door).toContain("onPreRenderDayNight");
    expect(door).toContain("if (!this.sys.isActive()) return");
    const doorSync = door.slice(door.indexOf("private sync(snap"), door.indexOf("private paintDoorDayNight"));
    expect(doorSync).not.toContain("applyDayNight");
  });

  it("Hud locks render tier on coarse — tick only on desktop", () => {
    const hud = read("src/scenes/HudScene.ts");
    expect(hud).toContain("tickRenderBudget");
    expect(hud).not.toContain("syncRenderStress");
    expect(hud).not.toContain("applyRenderBudgetToGame");
  });

  it("driveGrade avoids full lamp sort", () => {
    const grade = read("src/art/dayNightGrade.ts");
    const drive = grade.slice(grade.indexOf("export function driveGrade"), grade.indexOf("export function doorGrade"));
    expect(drive).toContain("nearestLamps");
    expect(drive).not.toContain(".sort(");
  });

  it("Drive caps traffic sprite pool with a fixed constant", () => {
    const drive = read("src/scenes/DriveScene.ts");
    expect(drive).toContain("TRAFFIC_SPRITE_CAP");
    const update = drive.slice(drive.indexOf("update(): void"), drive.indexOf("private paintDayNight"));
    expect(update).toContain("TRAFFIC_SPRITE_CAP");
  });

  it("Drive and Door use fixed phone Graphics FX without tier invalidation", () => {
    const drive = read("src/scenes/DriveScene.ts");
    const door = read("src/scenes/DoorScene.ts");
    expect(drive).not.toContain("phoneFxQuality");
    expect(door).not.toContain("phoneFxQuality");
    expect(door).not.toContain("lastFxQuality");
    const glow = drive.slice(drive.indexOf("private paintNightGlow"), drive.indexOf("private returnToShop"));
    expect(glow).toContain("lastGlowKey");
    expect(glow).not.toContain("quality");
  });

  it("Hud reuses a capped score pop pool instead of destroy-per-flash", () => {
    const hud = read("src/scenes/HudScene.ts");
    expect(hud).toContain("SCORE_POP_POOL");
    expect(hud).toContain("warmScorePopPool");
    expect(hud).toContain("acquireScorePop");
    expect(hud).toContain("releaseScorePop");
    const pop = hud.slice(hud.indexOf("private spawnScorePop"), hud.indexOf("private syncResults"));
    expect(pop).not.toContain("label.destroy()");
  });

  it("Door dirty-guards prompt setText", () => {
    const door = read("src/scenes/DoorScene.ts");
    expect(door).toContain("lastPrompt");
    const sync = door.slice(door.indexOf("private sync(snap"), door.indexOf("private paintDoorDayNight"));
    expect(sync).toContain("if (promptLine !== this.lastPrompt)");
  });

  it("Shop dirty-guards bag texture and TV pulse bands", () => {
    const shop = read("src/scenes/ShopScene.ts");
    expect(shop).toContain("lastTvKey");
    expect(shop).toContain("if (this.bagRack.texture.key !== bagTex)");
    expect(shop).toContain("getSim().gameMs()");
  });

  it("Hud skips pre-tick snapshot and dirty-guards ID/pad/phone map", () => {
    const hud = read("src/scenes/HudScene.ts");
    const update = hud.slice(hud.indexOf("update(_time"), hud.indexOf("private layoutHud"));
    expect(update).toContain("isAutoDriving()");
    expect(update).not.toContain("const pre = sim.snapshot()");
    expect(hud).toContain("lastIdTextKey");
    expect(hud).toContain("lastPadFlash");
    expect(hud).toContain("lastPhoneMapKey");
  });

  it("every gameplay scene re-syncs camera zoom on create (RenderBudget race fix)", () => {
    for (const rel of [
      "src/scenes/ShopScene.ts",
      "src/scenes/DriveScene.ts",
      "src/scenes/DoorScene.ts",
      "src/scenes/HudScene.ts",
      "src/scenes/TitleScene.ts",
    ]) {
      const src = read(rel);
      expect(src).toContain("syncSceneRenderCamera(this)");
    }
  });

  it("Drive skips redundant traffic setTexture when key unchanged", () => {
    const drive = read("src/scenes/DriveScene.ts");
    const update = drive.slice(drive.indexOf("update(): void"), drive.indexOf("private paintDayNight"));
    expect(update).toContain("if (sprite.texture.key !== car.key) sprite.setTexture(car.key)");
  });

  it("Shop bakes static interior into RenderTextures", () => {
    const shop = read("src/scenes/ShopScene.ts");
    expect(shop).toContain("bakeStaticShop");
    expect(shop).toContain("shopBakeLayers");
    expect(shop).toContain("drawShopInterior(this)");
  });

  it("Door bakes static facade into a RenderTexture", () => {
    const door = read("src/scenes/DoorScene.ts");
    expect(door).toContain("bakeDoorFacade");
    expect(door).toContain("paintDoorstepStatic");
    expect(door).toContain("skyVisualDirtyKey");
  });

  it("Boot registers atlases after generateTextures and flushes before people pack", () => {
    const boot = read("src/scenes/BootScene.ts");
    expect(boot).toContain("registerCityTileAtlas");
    expect(boot).toContain("registerPeopleAtlases");
    const art = boot.indexOf("generateTextures(this)");
    const cityAtlas = boot.indexOf("registerCityTileAtlas(this)");
    const firstFlush = boot.indexOf("await this.flushTextures()", cityAtlas);
    const peopleAtlas = boot.indexOf("registerPeopleAtlases(this)");
    expect(art).toBeGreaterThan(-1);
    expect(cityAtlas).toBeGreaterThan(art);
    expect(firstFlush).toBeGreaterThan(cityAtlas);
    expect(peopleAtlas).toBeGreaterThan(firstFlush);
  });

  it("Drive uses cityTileImageKey for ground tiles", () => {
    const drive = read("src/scenes/DriveScene.ts");
    expect(drive).toContain("cityTileImageKey");
    expect(drive).toContain("strokeRect");
  });
});
