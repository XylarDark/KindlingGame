import Phaser from "phaser";
import { startSessionMusic, unlockAudio } from "../audio/music";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { beginPlay, shouldShowHowTo } from "../session";
import { addHudButton, addPanel, HUD_BUTTON_MIN_H } from "../ui/chrome";
import { HOWTO_HINT, HOWTO_STEPS, PAUSE_HINT, WELCOME_HINT, WELCOME_TITLE } from "../ui/copy";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { fitTypeToWidth } from "../ui/typekit";
import { designSafeInset, readCssSafeArea, VIEWFIT_EVENT, viewFromScale } from "../ui/viewFit";

/** Welcome copy runs well over the shared ramp — it is the first thing read. */
const WELCOME_TITLE_SIZE = "36.3px";
const WELCOME_HINT_SIZE = "21.8px";
/** How-to stack lift, keeping its tap hint off the counter sign behind it. */
const HOWTO_LIFT = 44;

export class TitleScene extends Phaser.Scene {
  private started = false;
  private phase: "welcome" | "howto" | "paused" = "paused";
  private welcomeLayer: Phaser.GameObjects.GameObject[] = [];
  private pauseHint?: Phaser.GameObjects.Text;

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
      this.pauseHint = addUiText(this, GAME_WIDTH / 2, GAME_HEIGHT - 48, PAUSE_HINT, {
        size: Type.title,
        color: Color.inkHex,
        backgroundColor: Color.creamHex,
        padding: { x: 36, y: 14 },
        fontStyle: "700",
        lineSpacing: 0,
        strokeThickness: 0,
        maxWidth: GAME_WIDTH - 96,
        maxHeight: 68,
      })
        .setOrigin(0.5, 1)
        .setDepth(43);
      this.layoutPauseHint();
      const relayout = (): void => this.layoutPauseHint();
      this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
      this.game.events.on(VIEWFIT_EVENT, relayout);
      this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(VIEWFIT_EVENT, relayout));
    }

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.repeat) return;
      unlockAudio(this.game);
      this.advance();
    });
  }

  private layoutPauseHint(): void {
    if (!this.pauseHint) return;
    const inset = designSafeInset(viewFromScale(this.scale), readCssSafeArea(document.getElementById("game-root")));
    const pauseInset = 48 + Math.max(inset.left, inset.right);
    this.pauseHint.setPosition(GAME_WIDTH / 2, GAME_HEIGHT - 48 - inset.bottom);
    fitTypeToWidth(this.pauseHint, GAME_WIDTH - pauseInset * 2);
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
