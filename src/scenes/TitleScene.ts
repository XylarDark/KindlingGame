import Phaser from "phaser";
import { drawShopCounter, drawShopInterior } from "../art/shopInterior";
import {
  BAG_STACK,
  BAG_SCALE,
  CUSTOMER_SPOT,
  CUSTOMER_BUBBLE_Y,
  DOOR,
  DRIVER,
  KEYLEAD,
  PEOPLE_SCALE,
  TABLET,
  TV_W,
  strainPos,
  strainSlotH,
  tabletLayout,
} from "../maps/shopT0";
import { GAME_WIDTH } from "../sim/constants";
import { createCatalog } from "../sim/catalog";
import { startSession } from "../session";
import { addHudButton, addPanel } from "../ui/chrome";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";

const STEPS = [
  {
    title: "Walk-ins",
    body: "They tell you the strain. Tap that TV — the budtender grabs it from the back — then tap them. No bag.",
  },
  {
    title: "Tickets",
    body: "Tap the flashing order, grab a bag, tap the TV, wait, then bag → receipt → bag.",
  },
  {
    title: "Hit the road",
    body: "Follow GPS to the house, call, walk to the door, photo, ID, then hand off the bag.",
  },
];

export class TitleScene extends Phaser.Scene {
  private started = false;

  constructor() {
    super("title");
  }

  create(): void {
    this.drawShop();
    this.drawHowTo();

    this.input.once("pointerdown", () => this.begin());
    this.input.keyboard?.once("keydown", () => this.begin());
  }

  private drawShop(): void {
    drawShopInterior(this);

    this.add.image(BAG_STACK.x, BAG_STACK.y, "tex-bag").setOrigin(0.5, 1).setScale(BAG_SCALE).setDepth(8);

    this.add.image(KEYLEAD.x, KEYLEAD.y, "tex-keylead").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);
    drawShopCounter(this);

    const tab = tabletLayout();
    addUiText(this, TABLET.x, tab.screenTop + tab.headerH / 2, "ORDERS", {
      size: Type.heading,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    })
      .setOrigin(0.5)
      .setDepth(9);
    addUiText(this, TABLET.x, tab.screenTop + tab.headerH + (tab.screenH - tab.headerH) / 2, "No pickup or delivery\nWalk-ins use the counter", {
      size: Type.caption,
      color: Color.creamHex,
      align: "center",
      wordWrap: { width: tab.screenW - 28 },
      fontStyle: "600",
      strokeThickness: 0,
      lineSpacing: 8,
    })
      .setOrigin(0.5)
      .setDepth(9);

    createCatalog(1).forEach((sku, i) => {
      const p = strainPos(i);
      const slotH = strainSlotH();
      this.add.rectangle(p.x, p.y, TV_W - 12, slotH - 4, sku.color, 0.35).setDepth(5);
      addUiText(this, p.x, p.y, sku.name, {
        size: Type.caption,
        color: Color.creamHex,
        align: "center",
        wordWrap: { width: TV_W - 20 },
        fontStyle: "700",
        lineSpacing: 0,
      })
        .setOrigin(0.5)
        .setDepth(6);
    });

    this.add.image(DRIVER.x, DRIVER.y, "tex-driver-sit").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);

    const enterX = DOOR.x + 16;
    this.add.image(enterX, CUSTOMER_SPOT.y, "tex-customer").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(4);
    addUiText(this, enterX, CUSTOMER_BUBBLE_Y, "Coming in…", {
      size: Type.caption,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 8, y: 4 },
      fontStyle: "600",
    })
      .setOrigin(0.5)
      .setDepth(6);
  }

  private drawHowTo(): void {
    const cardW = 420;
    const cardH = 184;
    const gap = 28;
    const rowW = cardW * 3 + gap * 2;
    const startX = (GAME_WIDTH - rowW) / 2;
    const cardY = 744;

    STEPS.forEach((step, i) => {
      const x = startX + i * (cardW + gap);
      const cx = x + cardW / 2;
      addPanel(this, x, cardY, cardW, cardH, {
        radius: 4,
        alpha: 1,
        fill: 0xfffaf3,
        stroke: Color.woodTrim,
        depth: 10,
      });
      addUiText(this, cx, cardY + 18, `0${i + 1}  ${step.title}`, {
        size: Type.heading,
        color: Color.inkHex,
        fontStyle: "700",
        strokeThickness: 0,
      })
        .setOrigin(0.5, 0)
        .setDepth(11);
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
        .setDepth(11);
    });

    const play = addHudButton(this, GAME_WIDTH / 2, 944, "OPEN THE SHOP", () => this.begin(), {
      originX: 0.5,
      originY: 0,
      variant: "primary",
      minWidth: 380,
      depth: 12,
    });

    this.tweens.add({
      targets: play,
      alpha: { from: 1, to: 0.82 },
      yoyo: true,
      repeat: -1,
      duration: 1100,
      ease: "Sine.inOut",
    });

    addUiText(this, GAME_WIDTH / 2, 1012, "tap, click, or press any key", {
      size: Type.caption,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 14, y: 6 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 0)
      .setDepth(12);
  }

  private begin(): void {
    if (this.started) return;
    this.started = true;
    startSession();
    this.scene.launch("shop");
    this.scene.launch("hud");
    this.scene.stop();
  }
}
