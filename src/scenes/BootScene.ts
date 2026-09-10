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
 * Wall-clock cap for the whole warm path. Phaser delayedCall is game-time and
 * freezes during sync Drive create, so it cannot guard orphaned showLoading.
 */
const WARM_BOOT_TIMEOUT_MS = 8000;
/** Per-scene create+render budget; mid-shift still launches if we skip. */
const WARM_SCENE_TIMEOUT_MS = 2500;

export class BootScene extends Phaser.Scene {
  private warmAborted = false;

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
    this.warmAborted = false;
    const abortTimer = globalThis.setTimeout(() => {
      this.warmAborted = true;
    }, WARM_BOOT_TIMEOUT_MS);
    try {
      await this.runBootWarm();
    } finally {
      globalThis.clearTimeout(abortTimer);
      this.warmAborted = true;
      const warmBootMs = Math.round(performance.now() - started);
      console.debug("boot: warmBootMs", { warmBootMs });
      hideLoading();
    }
    this.scene.start("title");
    applyRenderBudgetToGame(this.game);
    applyCanvasDisplayScale(this.game);
  }

  /** Stage labels only while warm is still allowed — never after abort/Title. */
  private showBootStage(stage: string): void {
    if (this.warmAborted) return;
    showLoading({ mode: "boot", stage });
  }

  private async runBootWarm(): Promise<void> {
    await this.waitForFonts();
    if (this.warmAborted) return;
    this.showBootStage("Art");
    generateTextures(this);
    await this.flushTextures();
    if (this.warmAborted) return;

    startSession();
    this.scene.launch("shop");
    this.scene.launch("hud");
    await this.waitUntilSceneReady("shop");
    await this.waitUntilSceneReady("hud");
    if (this.warmAborted) return;

    this.showBootStage("Shaders");
    await this.warmBootPipeline();
    if (this.warmAborted) return;

    this.showBootStage("Map");
    await this.warmAndSleepScene("drive");
    if (this.warmAborted) return;

    this.showBootStage("Door");
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
      this.wallSleep(1500),
    ]);
  }

  /** Stamp every texture for one full frame so GPU upload actually lands. */
  private async flushTextures(): Promise<void> {
    if (this.warmAborted) return;
    const keys = this.textures.getTextureKeys().filter((k) => k !== "__DEFAULT" && k !== "__MISSING");
    const stamps: Phaser.GameObjects.Image[] = [];
    for (const key of keys) {
      stamps.push(this.add.image(-64, -64, key).setAlpha(0).setVisible(true));
    }
    await this.waitFrames(1);
    for (const img of stamps) img.destroy();
  }

  private async warmBootPipeline(): Promise<void> {
    if (this.warmAborted || !getRenderBudget().postFx) return;
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
   * Wall-clock capped so a slow phone cannot stick the gate on Map/Door forever.
   */
  private async warmAndSleepScene(key: "drive" | "door"): Promise<void> {
    if (this.warmAborted) return;
    await Promise.race([this.warmAndSleepSceneBody(key), this.wallSleep(WARM_SCENE_TIMEOUT_MS)]);
  }

  private async warmAndSleepSceneBody(key: "drive" | "door"): Promise<void> {
    if (this.warmAborted) return;
    if (this.scene.isSleeping(key)) this.scene.wake(key);
    else if (!this.scene.isActive(key)) this.scene.launch(key);
    await this.waitUntilSceneReady(key);
    if (this.warmAborted) return;
    const scene = this.scene.get(key);
    if (scene?.cameras?.main && getRenderBudget().postFx) {
      attachDayNight(scene.cameras.main);
    }
    await this.waitFrames(2);
    if (this.warmAborted) return;
    if (this.scene.isActive(key) && !this.scene.isSleeping(key)) {
      this.scene.sleep(key);
    }
  }

  private async waitUntilSceneReady(key: string): Promise<void> {
    const deadline = performance.now() + 2500;
    while (!this.warmAborted && performance.now() < deadline) {
      if (this.scene.isActive(key) || this.scene.isSleeping(key)) return;
      await this.waitFrames(1);
    }
  }

  private async waitFrames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      if (this.warmAborted) return;
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          resolve();
        };
        this.game.events.once(Phaser.Core.Events.POST_RENDER, finish);
        // Wall clock — Phaser delayedCall freezes while sync create blocks the thread.
        globalThis.setTimeout(finish, 80);
      });
    }
  }

  private wallSleep(ms: number): Promise<void> {
    return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
  }
}
