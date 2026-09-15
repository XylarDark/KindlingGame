import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("Phase 4 — boot residency", () => {
  it("defers mid-tier backbuffer resize until boot warm finishes on coarse phones", () => {
    const budget = read("src/ui/renderBudget.ts");
    const boot = read("src/scenes/BootScene.ts");
    expect(budget).toContain("isBootRenderGateActive");
    expect(budget).toMatch(/if \(isBootRenderGateActive\(\)\) return;/);
    const title = read("src/scenes/TitleScene.ts");
    expect(title).toContain("releaseBootRenderGate()");
    expect(title).toContain("applyRenderBudgetToGame(this.game)");
    expect(title).toContain("registerTypeAtlas(this)");
    expect(boot).not.toContain("registerTypeAtlas");
    const ready = boot.slice(boot.indexOf("private async bootReady"), boot.indexOf("private showBootStage"));
    expect(ready).not.toContain("applyRenderBudgetToGame");
  });

  it("cold boot shows the loading gate before Phaser and hides it before Title", () => {
    const main = read("src/main.ts");
    const boot = read("src/scenes/BootScene.ts");
    const showAt = main.indexOf('showLoading({ mode: "boot"');
    const gameAt = main.indexOf("new Phaser.Game(config)");
    expect(showAt).toBeGreaterThan(-1);
    expect(gameAt).toBeGreaterThan(showAt);
    expect(boot).toContain("hideLoading()");
    expect(boot).toContain('this.scene.start("title")');
    const ready = boot.slice(boot.indexOf("private async bootReady"), boot.indexOf("private showBootStage"));
    expect(ready.indexOf("hideLoading()")).toBeLessThan(ready.indexOf('this.scene.start("title")'));
  });

  it("Boot first-creates drive and door under the gate then sleeps them", () => {
    const boot = read("src/scenes/BootScene.ts");
    expect(boot).toContain('warmAndSleepScene("drive")');
    expect(boot).toContain('warmAndSleepScene("door")');
    expect(boot).toContain("this.scene.sleep(key)");
    expect(boot).toContain("isCityBuildComplete()");
    expect(boot).toContain("warmDriveDeparturePaths()");
  });

  it("logs warmBootMs under a wall-clock cap and defers unfinished warm to Title", () => {
    const boot = read("src/scenes/BootScene.ts");
    expect(boot).toContain("WARM_BOOT_TIMEOUT_MS = 9000");
    expect(boot).toContain("warmBootMs");
    expect(boot).toContain("setBootWarmPending");
    const title = read("src/scenes/TitleScene.ts");
    expect(title).toContain("finishDeferredWarm");
    expect(title).toContain("takeBootWarmPending");
  });

  it("how-to enters the shop in one gesture via OPEN THE SHOP → begin()", () => {
    const title = read("src/scenes/TitleScene.ts");
    const howto = title.slice(title.indexOf("private drawHowTo"), title.indexOf("private async finishDeferredWarm"));
    expect(howto).toContain("OPEN THE SHOP");
    expect(howto).toContain("void this.begin()");
    expect(howto).toContain("this.dimOverlay.disableInteractive()");
    const advance = title.slice(title.indexOf("private async advanceAsync"), title.indexOf("private async begin"));
    expect(advance).toContain('if (this.phase === "howto") return');
  });

  it("mid-shift prefers wake over launch for warmed drive and door scenes", () => {
    const hud = read("src/scenes/HudScene.ts");
    expect(hud).toMatch(/isSleeping\("drive"\)\) this\.scene\.wake\("drive"\)/);
    expect(hud).toMatch(/isSleeping\("door"\)\) this\.scene\.wake\("door"\)/);
    const shop = read("src/scenes/ShopScene.ts");
    expect(shop).toMatch(/isSleeping\("drive"\)\) this\.scene\.wake\("drive"\)/);
  });

  it("does not destroy sleeping scene bakes for VRAM — Phase 3 tier sizing is enough", () => {
    const hud = read("src/scenes/HudScene.ts");
    const drive = read("src/scenes/DriveScene.ts");
    const door = read("src/scenes/DoorScene.ts");
    expect(hud).not.toContain("facadeBake");
    expect(hud).not.toContain("destroyFacade");
    expect(drive).not.toMatch(/sleep.*destroy.*RenderTexture/s);
    expect(door).not.toMatch(/sleep.*destroy.*facadeBake/s);
  });
});
