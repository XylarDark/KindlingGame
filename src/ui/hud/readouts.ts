import Phaser from "phaser";
import { houseTitle } from "../../maps/cityT0";
import { COUNTER_SIGN } from "../../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH } from "../../sim/constants";
import type { SimSnapshot } from "../../sim/gameSim";
import { formatSlaClock, isSlaUrgent } from "../copy";
import { parseFontPx, retypeSize } from "../typekit";
import {
  addSignText,
  setSignAccent,
  setSignCopy,
  setSignPosition,
  signContainer,
  syncSignPlaque,
} from "../signText";
import { addUiText } from "../text";
import { Color, HUD_READOUT_PX, HUD_SCORE_PX, HUD_TYPE_FIT, scaleChromePx, scaleMsgBox, scaleMsgPx } from "../theme";
import { Type } from "../theme";
import { worldToScreen } from "../worldProject";
import type { SafeInset } from "../viewFit";
import { HUD_CORNER_TOP, HUD_SCORE_GAP, HUD_SIGN_GAP, readoutOutline, SCORE_POP_POOL } from "./constants";

export interface ReadoutCorner {
  left: number;
  right: number;
  top: number;
}

export interface HudReadoutsChrome {
  cog: Phaser.GameObjects.Image;
  settingsOpen: boolean;
  resultsVisible: boolean;
  setCogCaptionShown(shown: boolean): void;
  releaseScorePop(label: Phaser.GameObjects.Text): void;
}

/**
 * Score, clock, cover, and door-title readouts. Shop mode anchors to the counter
 * KINDLING plaque via screen projection; corner mode is the road fallback.
 */
export class HudReadouts {
  scoreText!: Phaser.GameObjects.Text;
  scoreCaption!: Phaser.GameObjects.Text;
  clockText!: Phaser.GameObjects.Text;
  coverText!: Phaser.GameObjects.Text;
  doorTitleText!: Phaser.GameObjects.Text;
  scorePopLayer!: Phaser.GameObjects.Container;

  private captionPx = HUD_SCORE_PX;
  readoutsInShop = true;
  readoutCorner: ReadoutCorner = { left: 28, right: GAME_WIDTH - 28, top: HUD_CORNER_TOP };
  private lastDoorTitle = "";
  private lastReadoutsHidden: boolean | null = null;
  private scorePopPool: Phaser.GameObjects.Text[] = [];
  private scorePopFree: Phaser.GameObjects.Text[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    this.scoreText = addUiText(this.scene, 0, 0, "", {
      size: scaleChromePx(HUD_SCORE_PX),
      color: Color.creamHex,
      fontStyle: "700",
      align: "right",
      ...HUD_TYPE_FIT,
      maxWidth: 360,
      maxHeight: 68,
      ...readoutOutline(HUD_SCORE_PX),
    })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(20);

    this.scoreCaption = addUiText(this.scene, 0, 0, "SCORE", {
      size: scaleChromePx(HUD_SCORE_PX),
      color: Color.creamHex,
      fontStyle: "700",
      align: "right",
      letterSpacing: 2,
      ...HUD_TYPE_FIT,
      maxWidth: 220,
      maxHeight: 68,
      ...readoutOutline(HUD_SCORE_PX),
    })
      .setOrigin(1, 0.5)
      .setScrollFactor(0)
      .setDepth(20);

    this.scorePopLayer = this.scene.add.container(0, 0).setDepth(30);
    this.warmScorePopPool();

    this.clockText = addUiText(this.scene, 0, 0, "", {
      size: scaleChromePx(HUD_READOUT_PX),
      color: Color.creamHex,
      fontStyle: "700",
      ...HUD_TYPE_FIT,
      maxWidth: 360,
      maxHeight: 62,
      ...readoutOutline(HUD_READOUT_PX),
    })
      .setOrigin(0, 0.5)
      .setScrollFactor(0)
      .setDepth(20);

    this.coverText = addSignText(this.scene, 0, 0, "", {
      size: scaleMsgPx(13),
      fontStyle: "600",
      noWrap: true,
      maxWidth: scaleMsgBox(280),
      maxHeight: scaleMsgBox(40),
    })
      .setOrigin(0, 0)
      .setDepth(20)
      .setVisible(false);

    this.doorTitleText = addSignText(this.scene, 0, 0, "", {
      size: scaleMsgPx(16),
      fontStyle: "700",
      noWrap: true,
      maxWidth: scaleMsgBox(900),
      maxHeight: scaleMsgBox(48),
    })
      .setOrigin(0, 0.5)
      .setDepth(20)
      .setVisible(false);
  }

  layoutReadoutColumn(inset: SafeInset): void {
    const left = 28 + inset.left;
    const right = GAME_WIDTH - 28 - inset.right;
    this.readoutCorner = { left, right, top: HUD_CORNER_TOP + inset.top };
    setSignPosition(this.coverText, left, this.readoutCorner.top + 40);
    setSignPosition(this.doorTitleText, left, this.readoutCorner.top + 44);
  }

  /**
   * Project the counter-sign row through the live shop camera. HUD stays at zoom 1 while
   * the shop may render at renderScale, so raw COUNTER_SIGN coords drift off the plaque
   * on phones unless they are screen-projected like drive callouts.
   */
  counterSignReadoutAnchors(): { signLeft: number; signRight: number; y: number } {
    const shop = this.scene.scene.get("shop") as Phaser.Scene | undefined;
    if (shop?.sys.isActive()) {
      const cam = shop.cameras.main;
      const y = COUNTER_SIGN.y;
      const leftX = COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - HUD_SIGN_GAP;
      const rightX = COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + HUD_SIGN_GAP;
      return {
        signLeft: worldToScreen(cam, leftX, y).x,
        signRight: worldToScreen(cam, rightX, y).x,
        y: worldToScreen(cam, COUNTER_SIGN.x, y).y,
      };
    }
    return {
      signLeft: COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - HUD_SIGN_GAP,
      signRight: COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + HUD_SIGN_GAP,
      y: COUNTER_SIGN.y,
    };
  }

  placeReadouts(): void {
    this.matchCaptionToValue();
    const valueW = this.scoreText.width;
    if (this.readoutsInShop) {
      const { signLeft, signRight, y } = this.counterSignReadoutAnchors();
      this.scoreText.setOrigin(1, 0.5).setPosition(signLeft, y);
      this.scoreCaption.setOrigin(1, 0.5).setPosition(signLeft - valueW - HUD_SCORE_GAP, y);
      this.clockText.setOrigin(0, 0.5).setPosition(signRight, y);
      this.scorePopLayer.setPosition(signLeft, y - 46);
      return;
    }
    const { left, right, top } = this.readoutCorner;
    this.scoreCaption.setOrigin(0, 0.5).setPosition(left, top);
    const valueX = left + this.scoreCaption.width + HUD_SCORE_GAP;
    this.scoreText.setOrigin(0, 0.5).setPosition(valueX, top);
    this.clockText.setOrigin(1, 0.5).setPosition(right, top);
    this.scorePopLayer.setPosition(valueX + valueW + 16, top);
  }

  matchCaptionToValue(): void {
    const px = parseFontPx(this.scoreText.style.fontSize);
    if (px === this.captionPx) return;
    this.captionPx = px;
    const outline = readoutOutline(px);
    this.scoreCaption.setStroke(outline.stroke, outline.strokeThickness);
    retypeSize(this.scoreCaption, px);
  }

  paintReadoutChrome(atDoor: boolean, showId: boolean, chrome: HudReadoutsChrome): void {
    const hide = atDoor || showId;
    if (hide === this.lastReadoutsHidden) return;
    this.lastReadoutsHidden = hide;
    this.scoreText.setVisible(!hide);
    this.scoreCaption.setVisible(!hide);
    this.clockText.setVisible(!hide);
    chrome.cog.setVisible(!hide);
    this.scorePopLayer.setVisible(!hide);
    if (hide) {
      chrome.setCogCaptionShown(false);
      for (const label of this.scorePopPool) chrome.releaseScorePop(label);
    } else if (!chrome.settingsOpen) {
      chrome.setCogCaptionShown(true);
    }
  }

  paintDoorTitle(snap: SimSnapshot, atDoor: boolean, drop: SimSnapshot["dropoff"]): void {
    if (!atDoor || !drop.houseId) {
      if (this.lastDoorTitle !== "") {
        this.lastDoorTitle = "";
        this.doorTitleText.setVisible(false);
      }
      return;
    }
    const destOrder = snap.orders.find((o) => o.destinationId === drop.houseId && o.status === "onRun");
    const sla = destOrder ? formatSlaClock(destOrder.slaRemainingMs) : "";
    const runNote = (snap.run?.orderIds.length ?? 0) > 1 ? `  ·  ${snap.run!.orderIds.length} bags in the car` : "";
    const title = `${drop.customerName ?? "Customer"}  ·  ${houseTitle(drop.houseId)}${sla ? `  ·  ${sla}` : ""}${runNote}`;
    const show = title.trim().length > 0;
    this.doorTitleText.setVisible(show);
    if (!show) return;
    if (title !== this.lastDoorTitle) {
      this.lastDoorTitle = title;
      setSignCopy(this.doorTitleText, title);
    }
    setSignAccent(this.doorTitleText, destOrder && isSlaUrgent(destOrder.slaRemainingMs) ? Color.danger : undefined);
    syncSignPlaque(this.doorTitleText);
  }

  paintCover(
    snap: SimSnapshot,
    atDoor: boolean,
    settingsOpen: boolean,
    resultsVisible: boolean,
  ): void {
    const cover = snap.shopCover;
    const show =
      cover.active &&
      snap.playerRole === "keyLead" &&
      !atDoor &&
      !settingsOpen &&
      !resultsVisible &&
      !snap.dropoff.idCard;
    this.coverText.setVisible(show);
    if (!show) return;
    const tally = [
      cover.served ? `${cover.served} served` : null,
      cover.waiting ? `${cover.waiting} waiting` : null,
      cover.packed ? `${cover.packed} bagged` : null,
      cover.lost ? `${cover.lost} lost` : null,
    ]
      .filter(Boolean)
      .join("  ·  ");
    const line = `COUNTER  ·  ${cover.line}${tally ? `  ·  ${tally}` : ""}`;
    const maxW = this.coverMaxWidth();
    const clipped = this.clipCoverLine(line, maxW);
    if (this.coverText.text !== clipped) {
      setSignCopy(this.coverText, clipped);
    }
    syncSignPlaque(this.coverText);
  }

  coverMaxWidth(): number {
    const { left } = this.readoutCorner;
    const columnCap = Math.floor(GAME_WIDTH * 0.26);
    const scoreCap = this.scoreText.x + this.scoreText.width - left - 12;
    return Math.max(96, Math.min(columnCap, scoreCap, 280));
  }

  clipCoverLine(line: string, maxW: number): string {
    if (line.length <= 8) return line;
    let clipped = line;
    this.coverText.setText(clipped);
    while (clipped.length > 8 && this.coverText.width > maxW) {
      clipped = `${clipped.slice(0, clipped.length - 2).trimEnd()}…`;
      this.coverText.setText(clipped);
    }
    return clipped;
  }

  warmScorePopPool(): void {
    for (let i = 0; i < SCORE_POP_POOL; i++) {
      const label = addSignText(this.scene, 0, 0, "", {
        size: Type.heading,
        fontStyle: "700",
        padding: { x: 10, y: 4 },
        maxWidth: 160,
        maxHeight: 40,
      })
        .setOrigin(0, 0.5)
        .setVisible(false)
        .setAlpha(0);
      this.scorePopPool.push(label);
      this.scorePopFree.push(label);
      this.scorePopLayer.add(signContainer(label));
    }
  }

  acquireScorePop(delta: number): Phaser.GameObjects.Text {
    let label = this.scorePopFree.pop();
    if (!label) {
      label = this.scorePopPool[0]!;
      this.scene.tweens.killTweensOf(label);
      const idx = this.scorePopFree.indexOf(label);
      if (idx >= 0) this.scorePopFree.splice(idx, 1);
    }
    const positive = delta >= 0;
    label
      .setOrigin(this.readoutsInShop ? 1 : 0, 0.5)
      .setVisible(true)
      .setAlpha(1)
      .setY(0);
    label.setText(positive ? `+${delta}` : String(delta));
    setSignAccent(label, positive ? Color.leafBright : Color.danger);
    return label;
  }

  releaseScorePop(label: Phaser.GameObjects.Text): void {
    this.scene.tweens.killTweensOf(label);
    label.setVisible(false).setAlpha(0).setText("");
    if (!this.scorePopFree.includes(label)) this.scorePopFree.push(label);
  }

  spawnScorePop(delta: number): void {
    const label = this.acquireScorePop(delta);
    this.placeReadouts();
    this.scene.tweens.add({
      targets: this.scoreText,
      scale: { from: 1.18, to: 1 },
      duration: 280,
      ease: "Back.easeOut",
    });
    this.scene.tweens.add({
      targets: label,
      y: { from: 0, to: -56 },
      alpha: { from: 1, to: 0 },
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => this.releaseScorePop(label),
    });
  }
}
