import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { beginPlay, shouldShowHowTo } from "../session";
import { addHudButton, addPanel, HUD_BUTTON_MIN_H } from "../ui/chrome";
import { HOWTO_HINT, PAUSE_HINT, WELCOME_HINT, WELCOME_TITLE } from "../ui/copy";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { fitTypeToWidth } from "../ui/typekit";

const STEPS = [
  {
    title: "Walk-ins",
    body: "They tell you the strain. Tap that TV — the budtender grabs it from the back — then tap them. No bag.",
  },
  {
    title: "Tickets",
    body: "Tap the flashing tablet, then that strain, then a bag. Pickups wait here. Deliveries go with the driver.",
  },
  {
    title: "Hit the road",
    body: "Follow GPS, call from the curb, then photo, check ID, and hand off the bag at the door. Packed deliveries on the counter all go with you.",
  },
];

export class TitleScene extends Phaser.Scene {
  private started = false;
  private phase: "welcome" | "howto" | "paused" = "paused";
  private welcomeLayer: Phaser.GameObjects.GameObject[] = [];

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
      .on("pointerdown", () => this.advance());

    if (showOverlays) this.drawWelcome();
    else {
      const pauseInset = 48;
      const pause = addUiText(this, GAME_WIDTH / 2, GAME_HEIGHT - 48, PAUSE_HINT, {
        size: Type.title,
        color: Color.inkHex,
        backgroundColor: Color.creamHex,
        padding: { x: 36, y: 16 },
        fontStyle: "700",
        lineSpacing: 0,
        strokeThickness: 0,
      })
        .setOrigin(0.5, 1)
        .setDepth(43);
      fitTypeToWidth(pause, GAME_WIDTH - pauseInset * 2);
    }

    this.input.keyboard?.on("keydown", (event: KeyboardEvent) => {
      if (event.repeat) return;
      this.advance();
    });
  }

  private drawWelcome(): void {
    const cardW = 920;
    const cardH = 188;
    const x = Math.floor((GAME_WIDTH - cardW) / 2);
    const y = Math.floor((GAME_HEIGHT - cardH) / 2);

    this.welcomeLayer.push(
      addPanel(this, x, y, cardW, cardH, {
        radius: 4,
        alpha: 1,
        fill: 0xfffaf3,
        stroke: Color.woodTrim,
        depth: 41,
      }),
    );

    this.welcomeLayer.push(
      addUiText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 - 22, WELCOME_TITLE, {
        size: Type.title,
        color: Color.inkHex,
        fontStyle: "700",
        align: "center",
        strokeThickness: 0,
      })
        .setOrigin(0.5)
        .setDepth(42),
    );
    this.welcomeLayer.push(
      addUiText(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 28, WELCOME_HINT, {
        size: Type.body,
        color: Color.inkHex,
        fontStyle: "600",
        align: "center",
        strokeThickness: 0,
      })
        .setOrigin(0.5)
        .setDepth(42),
    );
  }

  private clearWelcome(): void {
    for (const obj of this.welcomeLayer) obj.destroy();
    this.welcomeLayer = [];
  }

  private drawHowTo(): void {
    const cardW = 420;
    const cardH = 184;
    const gap = 28;
    const rowW = cardW * 3 + gap * 2;
    const btnH = HUD_BUTTON_MIN_H + 28;
    const stackGap = 16;
    const hintGap = 8;
    const hintH = 28;
    const blockH = cardH + stackGap + btnH + hintGap + hintH;
    const startX = Math.floor((GAME_WIDTH - rowW) / 2);
    const cardY = Math.floor((GAME_HEIGHT - blockH) / 2);

    STEPS.forEach((step, i) => {
      const x = startX + i * (cardW + gap);
      const cx = x + cardW / 2;
      addPanel(this, x, cardY, cardW, cardH, {
        radius: 4,
        alpha: 1,
        fill: 0xfffaf3,
        stroke: Color.woodTrim,
        depth: 41,
      });
      addUiText(this, cx, cardY + 18, `0${i + 1}  ${step.title}`, {
        size: Type.heading,
        color: Color.inkHex,
        fontStyle: "700",
        strokeThickness: 0,
      })
        .setOrigin(0.5, 0)
        .setDepth(42);
      addUiText(this, cx, cardY + 60, step.body, {
        size: Type.body,
        color: Color.inkHex,
        fontStyle: "600",
        align: "center",
        wordWrap: { width: cardW - 48 },
        lineSpacing: 8,
        strokeThickness: 0,
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
      padding: { x: 12, y: 4 },
      fontStyle: "700",
      lineSpacing: 0,
      strokeThickness: 0,
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
    this.scene.resume("shop");
    this.scene.resume("hud");
    this.scene.stop();
  }
}
