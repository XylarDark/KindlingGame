import Phaser from "phaser";
import { registerDayNightPipeline } from "../art/dayNightPipeline";
import { installMusicUnlock, preloadMusic } from "../audio/music";
import { generateTextures } from "../pixelArt";
import { startSession } from "../session";
import { applyCanvasDisplayScale } from "../shell";
import { applyRenderBudgetToGame } from "../ui/renderBudget";
import { installTypekit } from "../ui/typekit";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  preload(): void {
    preloadMusic(this);
  }

  create(): void {
    installTypekit(this.game);
    registerDayNightPipeline(this.game);
    installMusicUnlock(this.game);
    void this.waitForFonts().then(() => {
      generateTextures(this);
      startSession();
      this.scene.launch("shop");
      this.scene.launch("hud");
      this.scene.start("title");
      // READY may have already run — re-apply scale now that scenes exist.
      applyRenderBudgetToGame(this.game);
      applyCanvasDisplayScale(this.game);
    });
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
}
