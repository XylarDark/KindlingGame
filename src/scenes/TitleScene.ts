import Phaser from "phaser";
import { startSessionMusic, unlockAudio } from "../audio/music";
import { COUNTER_SIGN } from "../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { beginPlay, shouldShowHowTo } from "../session";
import { addHudButton, addPanel, HUD_BUTTON_MIN_H } from "../ui/chrome";
import { HOWTO_HINT, HOWTO_STEPS, PAUSE_HINT, WELCOME_HINT, WELCOME_TITLE } from "../ui/copy";
import { SIGN_FRAME_W, signPlaqueRings } from "../ui/signPlaque";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { fitTypeToWidth } from "../ui/typekit";
import { designSafeInset, readCssSafeArea, VIEWFIT_EVENT, viewFromScale } from "../ui/viewFit";

/** Welcome copy runs well over the shared ramp — it is the first thing read. */
const WELCOME_TITLE_SIZE = "36.3px";
const WELCOME_HINT_SIZE = "21.8px";
/** How-to stack lift, keeping its tap hint off the counter sign behind it. */
const HOWTO_LIFT = 44;
/** Gap from the design edge to the pause plaque's frame, before safe insets. */
const PAUSE_MARGIN = 48;

export class TitleScene extends Phaser.Scene {
  private started = false;
  private phase: "welcome" | "howto" | "paused" = "paused";
  private welcomeLayer: Phaser.GameObjects.GameObject[] = [];
  private pauseHint?: Phaser.GameObjects.Text;
  private pausePlaque?: Phaser.GameObjects.Graphics;

  constructor() {
    super("title");
  }

  create(): void {
    this.scene.bringToTop();
    this.scene.pause("shop");
    this.scene.pause("hud");
    this.input.setTopOnly(true);

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
    const inset = designSafeInset(viewFromScale(this.scale), readCssSafeArea(document.getElementById("game-root")));
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
    const cardW = 920;
    const cardH = 216;
    const x = Math.floor((GAME_WIDTH - cardW) / 2);
    const y = Math.floor((GAME_HEIGHT - cardH) / 2);
    const innerW = cardW - 96;

    this.welcomeLayer.push(
      addPanel(this, x, y, cardW, cardH, {
        radius: 6,
        alpha: 1,
        fill: Color.card,
        stroke: Color.woodTrim,
        depth: 41,
      }),
    );

    const accent = this.add.graphics().setDepth(42);
    accent.fillStyle(Color.leaf, 1);
    accent.fillRoundedRect(x + 10, y + 14, 8, cardH - 28, 4);
    accent.fillStyle(Color.lime, 0.55);
    accent.fillRoundedRect(x + 12, y + 18, 4, cardH - 36, 2);
    this.welcomeLayer.push(accent);

    this.welcomeLayer.push(
      addUiText(this, GAME_WIDTH / 2 + 8, y + 72, WELCOME_TITLE, {
        size: WELCOME_TITLE_SIZE,
        color: Color.inkHex,
        fontStyle: "700",
        align: "center",
        strokeThickness: 0,
        maxWidth: innerW,
        maxHeight: 56,
      })
        .setOrigin(0.5, 0.5)
        .setDepth(42),
    );
    this.welcomeLayer.push(
      addUiText(this, GAME_WIDTH / 2 + 8, y + 144, WELCOME_HINT, {
        size: WELCOME_HINT_SIZE,
        color: Color.inkHex,
        fontStyle: "600",
        align: "center",
        strokeThickness: 0,
        maxWidth: innerW,
        maxHeight: 60,
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
    const cardW = 440;
    const cardH = 216;
    const gap = 28;
    const rowW = cardW * 3 + gap * 2;
    const btnH = HUD_BUTTON_MIN_H + 28;
    const stackGap = 18;
    const hintGap = 12;
    const hintH = 32;
    const blockH = cardH + stackGap + btnH + hintGap + hintH;
    const startX = Math.floor((GAME_WIDTH - rowW) / 2);
    // Sit the stack above dead centre so the tap hint clears the counter sign.
    const cardY = Math.floor((GAME_HEIGHT - blockH) / 2) - HOWTO_LIFT;
    const bodyTop = 92;
    const bodyH = cardH - bodyTop - 18;

    HOWTO_STEPS.forEach((step, i) => {
      const x = startX + i * (cardW + gap);
      const cx = x + cardW / 2;

      addPanel(this, x, cardY, cardW, cardH, {
        radius: 6,
        alpha: 1,
        fill: Color.card,
        stroke: Color.woodTrim,
        depth: 41,
      });

      const band = this.add.graphics().setDepth(42);
      band.fillStyle(Color.leaf, 1);
      band.fillRoundedRect(x + 12, cardY + 12, cardW - 24, 6, 3);
      band.fillStyle(Color.lime, 0.45);
      band.fillRoundedRect(x + 14, cardY + 13, cardW - 28, 3, 2);

      const badge = this.add.graphics().setDepth(42);
      badge.fillStyle(Color.leaf, 1);
      badge.fillCircle(cx, cardY + 44, 18);
      badge.lineStyle(2, 0x2a4a28, 1);
      badge.strokeCircle(cx, cardY + 44, 18);

      addUiText(this, cx, cardY + 44, String(i + 1), {
        size: Type.heading,
        color: Color.creamHex,
        fontStyle: "700",
        strokeThickness: 0,
        maxWidth: 34,
        maxHeight: 34,
      })
        .setOrigin(0.5)
        .setDepth(43);

      addUiText(this, cx, cardY + 66, step.title, {
        size: Type.heading,
        color: Color.inkHex,
        fontStyle: "700",
        strokeThickness: 0,
        maxWidth: cardW - 40,
        maxHeight: 28,
      })
        .setOrigin(0.5, 0)
        .setDepth(42);

      addUiText(this, cx, cardY + bodyTop, step.body, {
        size: Type.body,
        color: Color.inkHex,
        fontStyle: "600",
        align: "center",
        strokeThickness: 0,
        maxWidth: cardW - 52,
        maxHeight: bodyH,
      })
        .setOrigin(0.5, 0)
        .setDepth(42);
    });

    const play = addHudButton(this, GAME_WIDTH / 2, cardY + cardH + stackGap, "OPEN THE SHOP", () => this.begin(), {
      originX: 0.5,
      originY: 0,
      variant: "primary",
      minWidth: 380,
      depth: 43,
      caption: "Begin the 9 AM shift",
    });

    this.tweens.add({
      targets: play,
      alpha: { from: 1, to: 0.82 },
      yoyo: true,
      repeat: -1,
      duration: 1100,
      ease: "Sine.inOut",
    });

    addUiText(this, GAME_WIDTH / 2, play.y + btnH + hintGap, HOWTO_HINT, {
      size: Type.caption,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 16, y: 7 },
      fontStyle: "700",
      lineSpacing: 0,
      strokeThickness: 0,
      maxWidth: 640,
      maxHeight: 32,
    })
      .setOrigin(0.5, 0)
      .setDepth(43);
  }

  private advance(): void {
    if (this.started) return;
    if (this.phase === "welcome") {
      this.clearWelcome();
      this.phase = "howto";
      this.drawHowTo();
      return;
    }
    this.begin();
  }

  private begin(): void {
    if (this.started) return;
    this.started = true;
    beginPlay();
    startSessionMusic(this.game);
    this.scene.resume("shop");
    this.scene.resume("hud");
    this.scene.stop();
  }
}
