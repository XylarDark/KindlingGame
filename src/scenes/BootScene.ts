import Phaser from "phaser";
import { generateTextures } from "../pixelArt";

export class BootScene extends Phaser.Scene {
  constructor() {
    super("boot");
  }

  create(): void {
    void this.waitForFonts().then(() => {
      generateTextures(this);
      this.scene.start("title");
    });
  }

  private async waitForFonts(): Promise<void> {
    if (!document.fonts?.load) return;
    await Promise.race([
      Promise.all([
        document.fonts.load("700 11px Inter"),
        document.fonts.load("16px Inter"),
        document.fonts.load("600 16px Inter"),
        document.fonts.load("700 16px Inter"),
      ]),
      new Promise<void>((resolve) => this.time.delayedCall(1500, resolve)),
    ]);
  }
}
