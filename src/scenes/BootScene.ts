import Phaser from "phaser";
import { doorGrade, driveGrade, shopGrade } from "../art/dayNightGrade";
import { DOORSTEP_PORCH } from "../art/doorstep";
import {
  applyDayNight,
  attachDayNight,
  DAY_NIGHT_PIPELINE,
  dayNightFrom,
  detachDayNight,
  registerDayNightPipeline,
} from "../art/dayNightPipeline";
import { ceilingPots } from "../maps/shopT0";
import { MS_PER_GAME_HOUR } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import { installMusicUnlock, preloadMusic } from "../audio/music";
import { prewarmCameraSfx } from "../audio/sfx";
import { registerCityTileAtlas } from "../art/cityTileAtlas";
import { registerPeopleAtlases } from "../art/peopleAtlas";
import { generateTextures } from "../pixelArt";
import { startSession } from "../session";
import { applyCanvasDisplayScale } from "../shell";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { clearBootWarmPending, setBootWarmPending } from "../ui/bootWarm";
import { isCityBuildComplete, resetCityBuildFlags } from "../ui/cityBuild";
import { markSceneWarm, resetSceneWarmFlags, sceneWarmTimeout } from "../ui/sceneWarm";
import { hideLoading, showLoading } from "../ui/loadingGate";
import { applyRenderBudgetToGame, getRenderBudget } from "../ui/renderBudget";
import { installTypekit } from "../ui/typekit";

/**
 * Wall-clock cap for the whole warm path. Phaser delayedCall is game-time and
 * freezes during sync Drive create, so it cannot guard orphaned showLoading.
 */
const WARM_BOOT_TIMEOUT_MS = 9000;
/** Shop/Drive/Door PostFX sample hours — noon + dusk + night under the gate. */
const WARM_SHOP_HOURS = [12, 16, 20.5] as const;
const WARM_SCENE_HOURS = [12, 20.5] as const;
const WARM_DRIVE_FOCUS = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };

export class BootScene extends Phaser.Scene {
  private warmAborted = false;
  private warmDriveOk = false;
  private warmDoorOk = false;

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
    prewarmCameraSfx(this.game);
    void this.bootReady();
  }

  private async bootReady(): Promise<void> {
    const started = performance.now();
    this.warmAborted = false;
    this.warmDriveOk = false;
    this.warmDoorOk = false;
    clearBootWarmPending();
    resetSceneWarmFlags();
    resetCityBuildFlags();
    const abortTimer = globalThis.setTimeout(() => {
      this.warmAborted = true;
    }, WARM_BOOT_TIMEOUT_MS);
    try {
      await this.runBootWarm();
    } finally {
      globalThis.clearTimeout(abortTimer);
      this.warmAborted = true;
      const warmBootMs = Math.round(performance.now() - started);
      const degraded = !this.warmDriveOk || !this.warmDoorOk;
      if (degraded) {
        setBootWarmPending({ drive: !this.warmDriveOk, door: !this.warmDoorOk });
        console.debug("boot: warm degraded", {
          warmBootMs,
          drive: this.warmDriveOk,
          door: this.warmDoorOk,
        });
      } else {
        clearBootWarmPending();
        console.debug("boot: warmBootMs", { warmBootMs });
      }
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
    registerCityTileAtlas(this);
    // Flush baked tiles before people atlas — GPU upload must land before RT.pack on phones.
    await this.flushTextures();
    registerPeopleAtlases(this);
    // One frame for atlas sheets only; packed sources are removed to avoid double-stamp OOM.
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

    await this.warmShopPostFx();
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
        document.fonts.load("600 19px Inter"),
        document.fonts.load("600 20px Inter"),
        document.fonts.load("600 25px Inter"),
        document.fonts.load("700 13px Inter"),
        document.fonts.load("700 15px Inter"),
        document.fonts.load("700 20px Inter"),
        document.fonts.load("700 24px Inter"),
        document.fonts.load("700 31px Inter"),
        document.fonts.load("700 36px Inter"),
        document.fonts.load("700 44px Inter"),
        document.fonts.load("700 48px Inter"),
        document.fonts.load("700 51px Inter"),
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
    // Two frames so GPU upload lands on slow phones (one frame was often a no-op).
    await this.waitFrames(2);
    for (const img of stamps) img.destroy();
  }

  private async warmBootPipeline(): Promise<void> {
    if (this.warmAborted) return;
    const cam = this.cameras.main;
    const keepAttached = getRenderBudget().postFx;
    // Mid tier keeps PostFX off at play, but still compile once so mid→high promote is hitch-free.
    registerDayNightPipeline(this.game);
    if (this.game.renderer.type !== Phaser.WEBGL) return;
    let pipe = dayNightFrom(cam);
    if (!pipe) {
      cam.setPostPipeline(DAY_NIGHT_PIPELINE);
      pipe = dayNightFrom(cam);
    }
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
    if (!keepAttached) detachDayNight(cam);
  }

  /**
   * Compile shop-camera PostFX before first fetch — boot pipeline alone uses the boot camera.
   */
  private async warmShopPostFx(): Promise<void> {
    if (this.warmAborted) return;
    const shop = this.scene.get("shop");
    const cam = shop?.cameras?.main;
    if (!cam) return;
    const keepAttached = getRenderBudget().postFx;
    attachDayNight(cam);
    for (const hour of WARM_SHOP_HOURS) {
      if (this.warmAborted) return;
      const gameMs = (hour - 9) * MS_PER_GAME_HOUR;
      applyDayNight(dayNightFrom(cam), shopGrade(skyAt(gameMs), ceilingPots()), {
        x: 0,
        y: 0,
        width: GAME_WIDTH,
        height: GAME_HEIGHT,
      });
      await this.waitFrames(1);
    }
    await this.waitFrames(1);
    if (!keepAttached) detachDayNight(cam);
  }

  /**
   * First-create drive/door under the loading gate so mid-shift only wakes them.
   * Deadline-checked in-body — never Promise.race a path that can orphan showLoading.
   */
  private async warmAndSleepScene(key: "drive" | "door"): Promise<void> {
    if (this.warmAborted) return;
    const deadline = performance.now() + sceneWarmTimeout(key);
    if (this.scene.isSleeping(key)) {
      markSceneWarm(key);
      if (key === "drive") this.warmDriveOk = true;
      else this.warmDoorOk = true;
      return;
    }
    if (!this.scene.isActive(key)) this.scene.launch(key);
    while (!this.warmAborted && performance.now() < deadline) {
      if (this.scene.isActive(key) || this.scene.isSleeping(key)) break;
      await this.waitFrames(1);
    }
    if (this.warmAborted || performance.now() >= deadline) return;
    if (key === "drive") {
      while (!this.warmAborted && performance.now() < deadline) {
        if (isCityBuildComplete()) break;
        await this.waitFrames(1);
      }
      if (this.warmAborted || performance.now() >= deadline) return;
    }
    const scene = this.scene.get(key);
    const cam = scene?.cameras?.main;
    if (cam) {
      attachDayNight(cam);
      const view = { x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT };
      for (const hour of WARM_SCENE_HOURS) {
        if (this.warmAborted || performance.now() >= deadline) return;
        const sky = skyAt((hour - 9) * MS_PER_GAME_HOUR);
        const grade =
          key === "drive" ? driveGrade(sky, WARM_DRIVE_FOCUS, []) : doorGrade(sky, DOORSTEP_PORCH);
        applyDayNight(dayNightFrom(cam), grade, view);
        await this.waitFrames(1);
      }
      await this.waitFrames(1);
    }
    if (this.warmAborted || performance.now() >= deadline) return;
    if (this.scene.isActive(key) && !this.scene.isSleeping(key)) {
      this.scene.sleep(key);
    }
    if (this.scene.isSleeping(key)) {
      markSceneWarm(key);
      if (key === "drive") this.warmDriveOk = true;
      else this.warmDoorOk = true;
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
