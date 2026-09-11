import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("scene lifetime guards", () => {
  it("world scenes sleep drive/door when keyLead is in the shop", () => {
    const hud = read("src/scenes/HudScene.ts");
    const sync = hud.slice(hud.indexOf("private syncDriveScene"), hud.indexOf("private makeResults"));
    expect(sync).toContain('this.lastDriveSceneKey !== "__shop__"');
    expect(sync).toContain("ensureShopVisible()");
  });

  it("Drive, Door, and Shop detach PostFX on sleep and gate PRE_RENDER when asleep", () => {
    for (const rel of ["src/scenes/DriveScene.ts", "src/scenes/DoorScene.ts", "src/scenes/ShopScene.ts"]) {
      const src = read(rel);
      expect(src).toContain("wireSceneDayNightLifecycle");
      expect(src).toMatch(/isSleeping\(\)/);
      expect(src).toContain("events.off(Phaser.Scenes.Events.PRE_RENDER");
    }
  });

  it("main syncDayNightCameras skips inactive or sleeping world scenes", () => {
    const main = read("src/main.ts");
    expect(main).toContain("scene.sys.isActive()");
    expect(main).toContain("scene.sys.isSleeping()");
    expect(main).toContain("detachDayNight(cam)");
  });

  it("sign plaque pump skips PRE_RENDER when the host scene is asleep", () => {
    const sign = read("src/ui/signText.ts");
    const pump = sign.slice(sign.indexOf("private onPreRender"), sign.indexOf("private hookText"));
    expect(pump).toContain("isSleeping()");
  });

  it("boot graph excludes drive/door; loadWorldScenes registers them after shop warm", () => {
    const config = read("src/config.ts");
    expect(config).not.toContain("DriveScene");
    expect(config).not.toContain("DoorScene");
    const boot = read("src/scenes/BootScene.ts");
    expect(boot).toContain("loadWorldScenes");
    const world = read("src/scenes/worldScenes.ts");
    expect(world).toContain('import("./DriveScene")');
    expect(world).toContain('import("./DoorScene")');
  });
});
