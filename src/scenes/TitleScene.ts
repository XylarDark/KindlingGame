import Phaser from "phaser";
import { doorGrade, driveGrade } from "../art/dayNightGrade";
import { DOORSTEP_PORCH } from "../art/doorstep";
import { applyDayNight, attachDayNight, dayNightFrom } from "../art/dayNightPipeline";
import { MS_PER_GAME_HOUR } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import { startSessionMusic, unlockAudio } from "../audio/music";
import { COUNTER_SIGN } from "../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { beginPlay, shouldShowHowTo } from "../session";
import { takeBootWarmPending } from "../ui/bootWarm";
import { isCityBuildComplete } from "../ui/cityBuild";
import { markSceneWarm, sceneWarmTimeout } from "../ui/sceneWarm";
import { maybeEnterFullscreenOnStart } from "../ui/displayPrefs";
import { addHudButton, addPanel, HUD_BUTTON_MIN_H } from "../ui/chrome";
import { HOWTO_HINT, HOWTO_STEPS, PAUSE_HINT, WELCOME_HINT, WELCOME_TITLE } from "../ui/copy";
import { setPwaIdle } from "../pwaUpdate";
import { presentInstallCoach } from "../ui/installCoach";
import { hideLoading, showLoading } from "../ui/loadingGate";
import { getRenderBudget } from "../ui/renderBudget";
import { SIGN_FRAME_W, signPlaqueRings } from "../ui/signPlaque";
import { addSignText } from "../ui/signText";
import { addUiText } from "../ui/text";
import { Color, MENU_TYPE_FIT, MSG_TYPE_FIT, scaleMsgBox, scaleMsgPad, scaleMsgPx, Type } from "../ui/theme";
import { fitTypeToWidth } from "../ui/typekit";
import { designHudInset, readCssSafeArea, VIEWFIT_EVENT } from "../ui/viewFit";

/**
 * Welcome + how-to: dedicated 2× readability bump in design space.
 * Separate from MSG_SCALE / MOBILE_TEXT_SCALE — those screens are the first read.
 */
export const TITLE_INTRO_SCALE = 2.0;

/** Pre-bump welcome sizes (kept as the 1.0 baseline for the intro scale). */
const WELCOME_TITLE_BASE_PX = 36.3;
const WELCOME_HINT_BASE_PX = 21.8;

function introPx(basePx: number): string {
  return `${Math.round(basePx * TITLE_INTRO_SCALE * 10) / 10}px`;
}

function introN(n: number): number {
  return Math.round(n * TITLE_INTRO_SCALE);
}

/** How-to stack lift so the tap hint clears the counter sign behind it. */
const HOWTO_LIFT = introN(44);
/** Gap from the design edge to the pause plaque's frame, before safe insets. */
const PAUSE_MARGIN = 48;

const WARM_DRIVE_FOCUS = { x: GAME_WIDTH / 2, y: GAME_HEIGHT / 2 };

export class TitleScene extends Phaser.Scene {
  private started = false;
  private phase: "welcome" | "howto" | "paused" = "paused";
  private welcomeLayer: Phaser.GameObjects.GameObject[] = [];
  private pauseHint?: Phaser.GameObjects.Text;
  private pausePlaque?: Phaser.GameObjects.Graphics;
  /** Blocks begin() until deferred drive/door warm finishes — no mid-shift launch. */
  private deferredWarm: Promise<void> | null = null;

  constructor() {
    super("title");
  }

  create(): void {
    this.scene.bringToTop();
    this.scene.pause("shop");
    this.scene.pause("hud");
    this.input.setTopOnly(true);
    // Title is idle for PWA — waiting workers may activate + reload here only.
    setPwaIdle(true);

    // If Boot aborted before drive/door sleep, finish under the gate (never orphan showLoading).
    this.deferredWarm = this.finishDeferredWarm();

    // Mobile / early play: coach install for a chrome-free session (no-op if standalone
    // or already dismissed). HTML overlay sits above the Phaser canvas.
    presentInstallCoach();

    const showOverlays = shouldShowHowTo();
    this.phase = showOverlays ? "welcome" : "paused";

    this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Color.ink, showOverlays ? 0.56 : 0.001)
      .setDepth(40)
      .setInteractive()
      .on("pointerdown", () => {
        unlockAudio(this.game);
        this.advance();
      });

    if (showOverlays) this.drawWelcome();
    else {
      // The plaque is painted from the hint's measured bounds, so no background
      // colour here — the graphics below own the white field as well as the frame.
      this.pausePlaque = this.add.graphics().setDepth(42);
      this.pauseHint = addUiText(this, COUNTER_SIGN.x, GAME_HEIGHT - PAUSE_MARGIN, PAUSE_HINT, {
        size: Type.title,
        color: Color.inkHex,
        padding: { x: 36, y: 14 },
        fontStyle: "700",
        // One line at every viewport today, but a tight safe area could wrap it.
        align: "center",
        lineSpacing: 0,
        strokeThickness: 0,
        ...MENU_TYPE_FIT,
        maxWidth: GAME_WIDTH - (PAUSE_MARGIN + SIGN_FRAME_W) * 2,
        maxHeight: 68,
      })
        .setOrigin(0.5, 1)
        .setDepth(43);
      this.layoutPauseHint();
      const relayout = (): void => this.layoutPauseHint();
      this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
      this.game.events.on(VIEWFIT_EVENT, relayout);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        this.game.events.off(VIEWFIT_EVENT, relayout);
        // The scale manager outlives the scene; a stale listener would relayout
        // a destroyed Text on the next resize.
        this.scale.off(Phaser.Scale.Events.RESIZE, relayout);
      });
    }

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.repeat) return;
      unlockAudio(this.game);
      this.advance();
    });
  }

  /**
   * Sit the hint on the shop's own axis — the counter plaque, key lead and TV
   * bank all centre on `COUNTER_SIGN.x`, so screen centre is the odd one out.
   * Falls back toward screen centre only when a safe inset would push the
   * plaque's frame off the edge.
   */
  private layoutPauseHint(): void {
    const hint = this.pauseHint;
    if (!hint) return;
    const inset = designHudInset(readCssSafeArea(document.getElementById("game-root")));
    const left = PAUSE_MARGIN + inset.left;
    const right = GAME_WIDTH - PAUSE_MARGIN - inset.right;
    // The frame rides outside the glyph box, so the type budget loses it twice.
    fitTypeToWidth(hint, right - left - SIGN_FRAME_W * 2);
    const half = hint.width / 2 + SIGN_FRAME_W;
    hint.setPosition(
      Phaser.Math.Clamp(COUNTER_SIGN.x, left + half, right - half),
      GAME_HEIGHT - PAUSE_MARGIN - inset.bottom,
    );
    this.paintPausePlaque();
  }

  /** Repaint the plaque against the hint's current measured bounds. */
  private paintPausePlaque(): void {
    const hint = this.pauseHint;
    const plaque = this.pausePlaque;
    if (!hint || !plaque) return;
    plaque.clear();
    const field = {
      x: hint.x - hint.width * hint.originX,
      y: hint.y - hint.height * hint.originY,
      w: hint.width,
      h: hint.height,
    };
    for (const ring of signPlaqueRings(field)) {
      plaque.fillStyle(ring.color, 1);
      plaque.fillRect(ring.x, ring.y, ring.w, ring.h);
    }
  }

  private drawWelcome(): void {
    // Width capped so a 1.5× card still clears the design edges with cream margin.
    const cardW = Math.min(introN(920), GAME_WIDTH - 80);
    const cardH = introN(216);
    const x = Math.floor((GAME_WIDTH - cardW) / 2);
    const y = Math.floor((GAME_HEIGHT - cardH) / 2);
    const padX = introN(48);
    const innerW = cardW - padX * 2;

    this.welcomeLayer.push(
      addPanel(this, x, y, cardW, cardH, {
        radius: introN(6),
        alpha: 1,
        fill: Color.card,
        stroke: Color.woodTrim,
        depth: 41,
      }),
    );

    const accent = this.add.graphics().setDepth(42);
    const accentW = introN(8);
    accent.fillStyle(Color.leaf, 1);
    accent.fillRoundedRect(x + introN(10), y + introN(14), accentW, cardH - introN(28), introN(4));
    accent.fillStyle(Color.lime, 0.55);
    accent.fillRoundedRect(x + introN(12), y + introN(18), introN(4), cardH - introN(36), introN(2));
    this.welcomeLayer.push(accent);

    this.welcomeLayer.push(
      addUiText(this, GAME_WIDTH / 2 + introN(8), y + Math.round(cardH * 0.33), WELCOME_TITLE, {
        size: introPx(WELCOME_TITLE_BASE_PX),
        color: Color.inkHex,
        fontStyle: "700",
        align: "center",
        strokeThickness: 0,
        ...MENU_TYPE_FIT,
        maxWidth: innerW,
        maxHeight: introN(56),
      })
        .setOrigin(0.5, 0.5)
        .setDepth(42),
    );
    this.welcomeLayer.push(
      addUiText(this, GAME_WIDTH / 2 + introN(8), y + Math.round(cardH * 0.67), WELCOME_HINT, {
        size: introPx(WELCOME_HINT_BASE_PX),
        color: Color.inkHex,
        fontStyle: "600",
        align: "center",
        strokeThickness: 0,
        ...MENU_TYPE_FIT,
        maxWidth: innerW,
        maxHeight: introN(60),
      })
        .setOrigin(0.5, 0.5)
        .setDepth(42),
    );
  }

  private clearWelcome(): void {
    for (const obj of this.welcomeLayer) obj.destroy();
    this.welcomeLayer = [];
  }

  private drawHowTo(): void {
    // Three cards must fit 1920 wide — width uses leftover after side margins + gaps,
    // while type/height take the full intro scale bump so nothing clips at 16:9 contain.
    const side = 36;
    const gap = Math.max(20, introN(20));
    const cardW = Math.floor((GAME_WIDTH - side * 2 - gap * 2) / 3);
    const cardH = introN(216);
    const rowW = cardW * 3 + gap * 2;
    const btnH = Math.max(HUD_BUTTON_MIN_H + introN(28), introN(HUD_BUTTON_MIN_H));
    const stackGap = introN(18);
    const hintGap = introN(12);
    const hintH = introN(32);
    const blockH = cardH + stackGap + btnH + hintGap + hintH;
    const startX = Math.floor((GAME_WIDTH - rowW) / 2);
    // Sit the stack above dead centre so the tap hint clears the counter sign.
    const cardY = Math.floor((GAME_HEIGHT - blockH) / 2) - HOWTO_LIFT;
    const bodyTop = introN(92);
    const bodyH = cardH - bodyTop - introN(18);
    const headingSize = introPx(20);
    const bodySize = introPx(16);
    const badgeR = introN(18);

    HOWTO_STEPS.forEach((step, i) => {
      const x = startX + i * (cardW + gap);
      const cx = x + cardW / 2;

      addPanel(this, x, cardY, cardW, cardH, {
        radius: introN(6),
        alpha: 1,
        fill: Color.card,
        stroke: Color.woodTrim,
        depth: 41,
      });

      const band = this.add.graphics().setDepth(42);
      band.fillStyle(Color.leaf, 1);
      band.fillRoundedRect(x + introN(12), cardY + introN(12), cardW - introN(24), introN(6), introN(3));
      band.fillStyle(Color.lime, 0.45);
      band.fillRoundedRect(x + introN(14), cardY + introN(13), cardW - introN(28), introN(3), introN(2));

      const badge = this.add.graphics().setDepth(42);
      badge.fillStyle(Color.leaf, 1);
      badge.fillCircle(cx, cardY + introN(44), badgeR);
      badge.lineStyle(2, 0x2a4a28, 1);
      badge.strokeCircle(cx, cardY + introN(44), badgeR);

      addUiText(this, cx, cardY + introN(44), String(i + 1), {
        size: headingSize,
        color: Color.creamHex,
        fontStyle: "700",
        strokeThickness: 0,
        ...MENU_TYPE_FIT,
        maxWidth: introN(34),
        maxHeight: introN(34),
      })
        .setOrigin(0.5)
        .setDepth(43);

      addUiText(this, cx, cardY + introN(66), step.title, {
        size: headingSize,
        color: Color.inkHex,
        fontStyle: "700",
        strokeThickness: 0,
        ...MENU_TYPE_FIT,
        maxWidth: cardW - introN(40),
        maxHeight: introN(28),
      })
        .setOrigin(0.5, 0)
        .setDepth(42);

      addUiText(this, cx, cardY + bodyTop, step.body, {
        size: bodySize,
        color: Color.inkHex,
        fontStyle: "600",
        align: "center",
        strokeThickness: 0,
        ...MENU_TYPE_FIT,
        maxWidth: cardW - introN(52),
        maxHeight: bodyH,
      })
        .setOrigin(0.5, 0)
        .setDepth(42);
    });

    const play = addHudButton(this, GAME_WIDTH / 2, cardY + cardH + stackGap, "OPEN THE SHOP", () => this.begin(), {
      originX: 0.5,
      originY: 0,
      variant: "primary",
      minWidth: introN(380),
      minHeight: btnH,
      depth: 43,
      caption: "Begin the 9 AM shift",
      labelSize: headingSize,
      captionSize: introPx(13),
      labelMaxHeight: introN(36),
      captionMaxHeight: introN(40),
    });

    this.tweens.add({
      targets: play,
      alpha: { from: 1, to: 0.82 },
      yoyo: true,
      repeat: -1,
      duration: 1100,
      ease: "Sine.inOut",
    });

    // How-to tap hint: base seed already on scaleMsg*; add the intro scale on top.
    const hintSeed = 13 * TITLE_INTRO_SCALE;
    addSignText(this, GAME_WIDTH / 2, play.y + btnH + hintGap, HOWTO_HINT, {
      size: scaleMsgPx(hintSeed),
      padding: scaleMsgPad({ x: introN(16), y: introN(7) }),
      fontStyle: "700",
      lineSpacing: 0,
      ...MSG_TYPE_FIT,
      maxWidth: scaleMsgBox(introN(640)),
      maxHeight: scaleMsgBox(introN(32)),
    })
      .setOrigin(0.5, 0)
      .setDepth(43);
  }

  /**
   * Boot wall-clock abort can leave drive/door cold. Warm them once more under the
   * loading gate before the player hits the road — gate always cleared in finally.
   */
  private async finishDeferredWarm(): Promise<void> {
    const pending = takeBootWarmPending();
    if (!pending) return;
    const keys: Array<"drive" | "door"> = [];
    if (pending.drive) keys.push("drive");
    if (pending.door) keys.push("door");
    if (keys.length === 0) return;
    showLoading({ mode: "boot", stage: keys[0] === "drive" ? "Map" : "Door" });
    try {
      for (const key of keys) {
        showLoading({ mode: "boot", stage: key === "drive" ? "Map" : "Door" });
        await this.warmAndSleepScene(key);
      }
    } finally {
      hideLoading();
    }
  }

  private async warmAndSleepScene(key: "drive" | "door"): Promise<void> {
    const deadline = performance.now() + sceneWarmTimeout(key);
    if (this.scene.isSleeping(key)) {
      markSceneWarm(key);
      return;
    }
    if (!this.scene.isActive(key)) this.scene.launch(key);
    while (performance.now() < deadline) {
      if (this.scene.isActive(key) || this.scene.isSleeping(key)) break;
      await this.waitFrames(1);
    }
    if (performance.now() >= deadline) return;
    if (key === "drive") {
      while (performance.now() < deadline) {
        if (isCityBuildComplete()) break;
        await this.waitFrames(1);
      }
      if (performance.now() >= deadline) return;
    }
    const scene = this.scene.get(key);
    const cam = scene?.cameras?.main;
    if (cam) {
      attachDayNight(cam);
      const nightMs = (20.5 - 9) * MS_PER_GAME_HOUR;
      const sky = skyAt(nightMs);
      const view = { x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT };
      const grade =
        key === "drive" ? driveGrade(sky, WARM_DRIVE_FOCUS, []) : doorGrade(sky, DOORSTEP_PORCH);
      applyDayNight(dayNightFrom(cam), grade, view);
      await this.waitFrames(2);
    }
    if (performance.now() >= deadline) return;
    if (this.scene.isActive(key) && !this.scene.isSleeping(key)) {
      this.scene.sleep(key);
    }
    if (this.scene.isSleeping(key)) markSceneWarm(key);
  }

  private async waitFrames(count: number): Promise<void> {
    for (let i = 0; i < count; i++) {
      await new Promise<void>((resolve) => {
        let done = false;
        const finish = (): void => {
          if (done) return;
          done = true;
          resolve();
        };
        this.game.events.once(Phaser.Core.Events.POST_RENDER, finish);
        globalThis.setTimeout(finish, 80);
      });
    }
  }

  private advance(): void {
    void this.advanceAsync();
  }

  private async advanceAsync(): Promise<void> {
    if (this.started) return;
    if (this.phase === "welcome") {
      this.clearWelcome();
      this.phase = "howto";
      this.drawHowTo();
      return;
    }
    await this.begin();
  }

  private async begin(): Promise<void> {
    if (this.started) return;
    if (this.deferredWarm) await this.deferredWarm;
    if (this.started) return;
    this.started = true;
    setPwaIdle(false);
    // User-gesture path: prefer fullscreen when the Settings toggle is on. A deny
    // or missing API must not block entering the shift.
    maybeEnterFullscreenOnStart();
    beginPlay();
    startSessionMusic(this.game);
    this.scene.resume("shop");
    this.scene.resume("hud");
    this.scene.stop();
  }
}
