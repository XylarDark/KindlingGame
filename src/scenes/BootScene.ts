import Phaser from "phaser";
import { attachDayNight, registerDayNightPipeline } from "../art/dayNightPipeline";
import { installMusicUnlock, preloadMusic } from "../audio/music";
import { generateTextures } from "../pixelArt";
import { startSession } from "../session";
import { applyCanvasDisplayScale } from "../shell";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { hideLoading, showLoading } from "../ui/loadingGate";
import { applyRenderBudgetToGame, getRenderBudget } from "../ui/renderBudget";
import { installTypekit } from "../ui/typekit";

/**
 * Cap so a stuck compile / create never blanks forever. Drive city draw can take
 * a beat on cold phones — longer than the old shader-only warm.
 */
const WARM_BOOT_TIMEOUT_MS = 4000;

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    preloadMusic(this);
  }

  create(): void {
    showLoading({ mode: "boot", stage: "Fonts" });
    installTypekit(this.game);
    registerDayNightPipeline(this.game);
    installMusicUnlock(this.game);
    void this.bootReady();
  }

  private async bootReady(): Promise<void> {
    const started = performance.now();
    try {
      await Promise.race([
        this.runBootWarm(),
        new Promise<void>((resolve) => this.time.delayedCall(WARM_BOOT_TIMEOUT_MS, resolve)),
      ]);
    } finally {
      const warmBootMs = Math.round(performance.now() - started);
      console.debug("boot: warmBootMs", { warmBootMs });
      hideLoading();
    }
    this.scene.start("title");
    applyRenderBudgetToGame(this.game);
    applyCanvasDisplayScale(this.game);
  }

  private async runBootWarm(): Promise<void> {
    await this.waitForFonts();
    showLoading({ mode: "boot", stage: "Art" });
    generateTextures(this);
    await this.flushTextures();

    startSession();
    this.scene.launch("shop");
    this.scene.launch("hud");
    await this.waitUntilSceneReady("shop");
    await this.waitUntilSceneReady("hud");

    showLoading({ mode: "boot", stage: "Shaders" });
    await this.warmBootPipeline();

    showLoading({ mode: "boot", stage: "Map" });
    await this.warmAndSleepScene("drive");

    showLoading({ mode: "boot", stage: "Door" });
    await this.warmAndSleepScene("door");
  }

  private async waitForFonts(): Promise<void> {
    if (!document.fonts?.load) return;
    await Promise.race([
      Promise.all([
        document.fonts.load("400 13px Inter"),
        document.fonts.load("600 15px Inter"),
        document.fonts.load("600 20px Inter"),
        document.fonts.load("700 13px Inter"),
        document.fonts.load("700 15px Inter"),
        document.fonts.load("700 20px Inter"),
        document.fonts.load("700 24px Inter"),
        document.fonts.load("700 36px Inter"),
        document.fonts.load("700 48px Inter"),
      ]),
      new Promise<void>((resolve) => this.time.delayedCall(1500, resolve)),
    ]);
  }

  /** Stamp every texture for one full frame so GPU upload actually lands. */
  private async flushTextures(): Promise<void> {
    const keys = this.textures.getTextureKeys().filter((k) => k !== "__DEFAULT" && k !== "__MISSING");
    const stamps: Phaser.GameObjects.Image[] = [];
    for (const key of keys) {
      stamps.push(this.add.image(-64, -64, key).setAlpha(0).setVisible(true));
    }
    await this.waitFrames(1);
    for (const img of stamps) img.destroy();
  }

  private async warmBootPipeline(): Promise<void> {
    if (!getRenderBudget().postFx) return;
    const cam = this.cameras.main;
    const pipe = attachDayNight(cam);
    if (pipe) {
      pipe.setGrade(
        {
          tint: [1, 1, 1],
          gradeStrength: 0,
          ambient: [1, 1, 1],
          ambientMul: 1,
          lights: [
            {
              kind: "lamp",
              x: GAME_WIDTH / 2,
              y: GAME_HEIGHT / 2,
              color: 0xffe0a0,
              radius: 200,
              intensity: 0.4,
            },
          ],
        },
        { x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT },
      );
    }
    await this.waitFrames(2);
  }

  /**
   * First-create drive/door under the loading gate so mid-shift only wakes them.
   * Must actually render (≥2 frames) so PostFX bootFX and city textures flush.
   */
  private async warmAndSleepScene(key: "drive" | "door"): Promise<void> {
    if (this.scene.isSleeping(key)) this.scene.wake(key);
    else if (!this.scene.isActive(key)) this.scene.launch(key);
    await this.waitUntilSceneReady(key);
    const scene = this.scene.get(key);
    if (scene?.cameras?.main && getRenderBudget().postFx) {
      attachDayNight(scene.cameras.main);
    }
    await this.waitFrames(2);
    if (this.scene.isActive(key) && !this.scene.isSleeping(key)) {
      this.scene.sleep(key);
    }
  }

  private async waitUntilSceneReady(key: string): Promise<void> {
    const deadline = performance.now() + 2500;
    while (performance.now() < deadline) {
      if (this.scene.isActive(key) || this.scene.isSleeping(key)) return;
      await this.waitFrames(1);
    }
  }

  private async waitFrames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await new Promise<void>((resolve) => {
        this.game.events.once(Phaser.Core.Events.POST_RENDER, () => resolve());
        this.time.delayedCall(80, resolve);
      });
    }
  }
}
