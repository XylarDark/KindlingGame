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

/** Cap so a stuck shader compile never blanks forever. */
const WARM_BOOT_TIMEOUT_MS = 2000;

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
      await this.waitForFonts();
      showLoading({ mode: "boot", stage: "Art" });
      generateTextures(this);
      showLoading({ mode: "boot", stage: "Shaders" });
      await this.warmGpu();
    } finally {
      const warmBootMs = Math.round(performance.now() - started);
      console.debug("boot: warmBootMs", { warmBootMs });
      hideLoading();
    }
    startSession();
    this.scene.launch("shop");
    this.scene.launch("hud");
    this.scene.start("title");
    // READY may have already run — re-apply scale now that scenes exist.
    applyRenderBudgetToGame(this.game);
    applyCanvasDisplayScale(this.game);
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

  /**
   * Touch textures and compile DayNight once off the critical play path.
   * Race against a timeout so a stuck compile cannot hang Title forever.
   */
  private async warmGpu(): Promise<void> {
    await Promise.race([
      this.runWarmGpu(),
      new Promise<void>((resolve) => this.time.delayedCall(WARM_BOOT_TIMEOUT_MS, resolve)),
    ]);
  }

  private async runWarmGpu(): Promise<void> {
    this.touchTextures();
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
    // One frame so WebGL compiles the fragment shader before shop/drive.
    await new Promise<void>((resolve) => {
      this.game.events.once(Phaser.Core.Events.POST_STEP, () => resolve());
      this.time.delayedCall(100, resolve);
    });
  }

  private touchTextures(): void {
    const keys = this.textures.getTextureKeys().filter((k) => k !== "__DEFAULT" && k !== "__MISSING");
    for (const key of keys) {
      const img = this.add.image(-64, -64, key).setAlpha(0).setVisible(true);
      img.destroy();
    }
  }
}
