import Phaser from "phaser";
import { getMusicPrefs, setMusicEnabled, setMusicVolume, syncMusicToClock } from "../audio/music";
import { playCameraClick, playUiSfx } from "../audio/sfx";
import { clampInput } from "../input/controls";
import { enableItemHit, syncItemHit } from "../input/hit";
import { CITY, MAP_PX_H, MAP_PX_W, TILE, houseById, tileToWorld } from "../maps/cityT0";
import { COUNTER_SIGN } from "../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH, NPC_INTERACT_COOLDOWN_MS, SCORE_DELIVERY_LATE, SCORE_DELIVERY_ON_TIME, SCORE_FAIL, SCORE_INSTORE, SCORE_PICKUP } from "../sim/constants";
import { getSim, startSession } from "../session";
import type { SimSnapshot } from "../sim/gameSim";
import type { ShiftResults } from "../sim/shiftResults";
import { tutorialHints } from "../sim/tutorialHints";
import { addHudButton, addPanel } from "../ui/chrome";
import { END_SHIFT_CAPTION, END_SHIFT_LABEL, RESULTS_NEW_DAY, RESULTS_TITLE } from "../ui/copy";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { refitType } from "../ui/typekit";
import { designSafeInset, HUD_TOUCH_MIN_DESIGN, readCssSafeArea, VIEWFIT_EVENT, viewFromScale } from "../ui/viewFit";

/** Readouts sit either side of the counter sign, 10% over the display ramp. */
const HUD_READOUT_PX = 40;
const HUD_CAPTION_PX = 18;
const HUD_SIGN_GAP = 28;
/** Corner fallback keeps clear of the ceiling band on the road and at doors. */
const HUD_CORNER_TOP = 76;
const HUD_SCORE_GAP = 16;

/**
 * No chip behind the readouts, so the ink outline is what separates them from
 * both the bright shop wall and the night street — heavier than a hairline.
 */
function readoutOutline(px: number): { stroke: string; strokeThickness: number } {
  return { stroke: Color.inkHex, strokeThickness: Math.max(2, Math.round(px * 0.12)) };
}

const SETTINGS_W = 440;
const SETTINGS_H = 560;
/** Settings panel runs 10% over the shared ramp — it is read at arm's length. */
const SET_TITLE_PX = "22px";
const SET_BODY_PX = "17.6px";
const SET_HINT_PX = "14.3px";
const VOL_TRACK = { x: 24, y: 168, w: 312, h: 16 };
/** Delivery phone — screen room for two-line status + title. */
const PHONE_W = 268;
const PHONE_H = 328;
const PHONE_COG_GAP = 16;
const PHONE_SCREEN = { x: -108, y: -128, w: 216, h: 248 };
const RESULTS_W = 740;
const RESULTS_H = 640;
/**
 * ID card runs 20% over the shared ramp — the name/DOB read is the gate on the
 * sale, taken at a glance on a phone held at arm's length.
 */
const ID_TITLE_PX = "19.2px";
const ID_NAME_PX = "24px";
const ID_DOB_PX = "19.2px";
const ID_HINT_PX = "15.6px";
/** Card, ring, and line offsets grew with the type so the four lines keep their gaps. */
const ID_CARD_W = 672;
const ID_CARD_H = 384;
const ID_RING_PAD = 12;

export class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private scoreCaption!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private padRing!: Phaser.GameObjects.Graphics;
  private padKnob!: Phaser.GameObjects.Arc;
  private padLabel!: Phaser.GameObjects.Text;
  private phone!: Phaser.GameObjects.Container;
  private phoneBody!: Phaser.GameObjects.Image;
  private phoneHit!: Phaser.GameObjects.Rectangle;
  private phoneFlash!: Phaser.GameObjects.Rectangle;
  private phoneMap!: Phaser.GameObjects.Graphics;
  private phoneTitle!: Phaser.GameObjects.Text;
  private phoneStatus!: Phaser.GameObjects.Text;
  private idDim!: Phaser.GameObjects.Rectangle;
  private idPanel!: Phaser.GameObjects.Container;
  private idName!: Phaser.GameObjects.Text;
  private idDob!: Phaser.GameObjects.Text;
  private idHint!: Phaser.GameObjects.Text;
  private idTitle!: Phaser.GameObjects.Text;
  private idBg!: Phaser.GameObjects.Rectangle;
  private idFlashRing!: Phaser.GameObjects.Rectangle;
  private flash!: Phaser.GameObjects.Rectangle;
  private toastText!: Phaser.GameObjects.Text;
  private coverText!: Phaser.GameObjects.Text;
  private sawPhoto = false;
  private idWasShowing = false;
  private idCardArmedAt = 0;
  private padCenter = { x: 196, y: GAME_HEIGHT - 220 };
  private pointerId: number | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cog!: Phaser.GameObjects.Image;
  private cogCaption!: Phaser.GameObjects.Text;
  private settingsDim!: Phaser.GameObjects.Rectangle;
  private settingsPanel!: Phaser.GameObjects.Container;
  private musicValue!: Phaser.GameObjects.Text;
  private volumeFill!: Phaser.GameObjects.Rectangle;
  private volumeKnob!: Phaser.GameObjects.Arc;
  private volumePct!: Phaser.GameObjects.Text;
  private volumeHit!: Phaser.GameObjects.Rectangle;
  private draggingVol = false;
  private settingsOpen = false;
  private resultsDim!: Phaser.GameObjects.Rectangle;
  private resultsPanel!: Phaser.GameObjects.Container;
  private resultsTitle!: Phaser.GameObjects.Text;
  private resultsScore!: Phaser.GameObjects.Text;
  private resultsBreakdown!: Phaser.GameObjects.Text;
  private resultsVerdict!: Phaser.GameObjects.Text;
  private resultsClock!: Phaser.GameObjects.Text;
  private resultsVisible = false;
  private endShiftBtn!: Phaser.GameObjects.Container;
  private lastScoreFlashId = 0;
  private lastSfxId = 0;
  private scorePopLayer!: Phaser.GameObjects.Container;
  private readoutsInShop = true;
  private readoutCorner = { left: 28, right: GAME_WIDTH - 28, top: HUD_CORNER_TOP };

  constructor() {
    super("hud");
  }

  create(): void {
    this.input.setTopOnly(false);

    // Readouts sit over bright shop walls AND dark night streets, so contrast comes
    // from an ink outline on the glyphs rather than a chip behind them.
    this.scoreText = addUiText(this, 0, 0, "", {
      size: `${HUD_READOUT_PX}px`,
      color: Color.creamHex,
      fontStyle: "700",
      align: "right",
      maxWidth: 360,
      maxHeight: 62,
      ...readoutOutline(HUD_READOUT_PX),
    })
      .setOrigin(1, 0.5)
      .setDepth(20);
    this.scoreCaption = addUiText(this, 0, 0, "SCORE", {
      size: `${HUD_CAPTION_PX}px`,
      color: Color.creamHex,
      fontStyle: "700",
      align: "right",
      letterSpacing: 2,
      maxWidth: 200,
      maxHeight: 34,
      ...readoutOutline(HUD_CAPTION_PX),
    })
      .setOrigin(1, 0.5)
      .setDepth(20);
    this.scorePopLayer = this.add.container(0, 0).setDepth(30);

    this.clockText = addUiText(this, 0, 0, "", {
      size: `${HUD_READOUT_PX}px`,
      color: Color.creamHex,
      fontStyle: "700",
      maxWidth: 360,
      maxHeight: 62,
      ...readoutOutline(HUD_READOUT_PX),
    })
      .setOrigin(0, 0.5)
      .setDepth(20);

    this.phoneBody = this.add
      .image(0, 0, "tex-phone")
      .setDisplaySize(PHONE_W, PHONE_H);
    this.phoneFlash = this.add
      .rectangle(0, 0, PHONE_W + 10, PHONE_H + 10, Color.lime, 0)
      .setStrokeStyle(4, Color.lime, 1);
    this.phoneMap = this.add.graphics();
    this.phoneTitle = addUiText(this, 0, PHONE_SCREEN.y + 28, "KINDLING\nDELIVERY", {
      size: Type.body,
      color: Color.limeHex,
      fontStyle: "700",
      align: "center",
      lineSpacing: 4,
      strokeThickness: 0,
      letterSpacing: 0,
      noWrap: true,
      maxWidth: PHONE_SCREEN.w - 28,
      maxHeight: 52,
    }).setOrigin(0.5);
    this.phoneStatus = addUiText(this, 0, PHONE_SCREEN.y + PHONE_SCREEN.h - 40, "Tap to call", {
      size: Type.body,
      color: Color.creamHex,
      fontStyle: "600",
      align: "center",
      lineSpacing: 4,
      strokeThickness: 0,
      padding: { x: 10, y: 6 },
      noWrap: true,
      maxWidth: PHONE_SCREEN.w - 16,
      maxHeight: 72,
    }).setOrigin(0.5);
    this.phoneHit = this.add
      .rectangle(0, 0, PHONE_W - 8, PHONE_H - 8, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    this.phoneHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.phone = this.add
      .container(GAME_WIDTH - 160, GAME_HEIGHT - 220, [
        this.phoneFlash,
        this.phoneBody,
        this.phoneMap,
        this.phoneTitle,
        this.phoneStatus,
        this.phoneHit,
      ])
      .setDepth(22)
      .setVisible(false);

    this.toastText = addUiText(this, GAME_WIDTH / 2, GAME_HEIGHT - 36, "", {
      size: Type.body,
      color: Color.creamHex,
      backgroundColor: Color.bannerInk,
      padding: { x: 18, y: 10 },
      align: "center",
      fontStyle: "600",
      maxWidth: 720,
      maxHeight: 64,
    })
      .setOrigin(0.5, 1)
      .setDepth(20);

    // Out on the road the shop is off-screen, so the counter reports in under the score.
    this.coverText = addUiText(this, 0, 0, "", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: Color.bannerInk,
      padding: { x: 12, y: 6 },
      fontStyle: "600",
      noWrap: true,
      maxWidth: 560,
      maxHeight: 40,
    })
      .setOrigin(0, 0)
      .setDepth(20)
      .setVisible(false);

    this.idDim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0806, 0.55)
      .setDepth(24)
      .setVisible(false);
    this.idDim.setInteractive({ useHandCursor: false });
    this.idDim.on("pointerdown", (p: Phaser.Input.Pointer) => p.event.stopPropagation());

    this.idName = addUiText(this, 0, -34, "", {
      size: ID_NAME_PX,
      color: Color.inkHex,
      align: "center",
      fontStyle: "600",
      strokeThickness: 0,
      maxWidth: 600,
      maxHeight: 48,
    }).setOrigin(0.5);
    this.idTitle = addUiText(this, 0, -142, "CUSTOMER ID", {
      size: ID_TITLE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      maxWidth: 600,
      maxHeight: 34,
    }).setOrigin(0.5);
    this.idDob = addUiText(this, 0, 26, "", {
      size: ID_DOB_PX,
      color: "#3a2418",
      strokeThickness: 0,
      maxWidth: 600,
      maxHeight: 34,
    }).setOrigin(0.5);
    this.idHint = addUiText(this, 0, 106, "Tap the card to confirm 19+", {
      size: ID_HINT_PX,
      color: "#3d7a45",
      fontStyle: "600",
      strokeThickness: 0,
      maxWidth: 600,
      maxHeight: 44,
    }).setOrigin(0.5);
    this.idFlashRing = this.add
      .rectangle(0, 0, ID_CARD_W + ID_RING_PAD, ID_CARD_H + ID_RING_PAD, 0x000000, 0)
      .setStrokeStyle(8, Color.lime, 1);
    this.idBg = this.add.rectangle(0, 0, ID_CARD_W, ID_CARD_H, 0xf4e8c1, 0.97).setStrokeStyle(6, 0x3d7a45);
    enableItemHit(this.idBg);
    this.idBg.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.idPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      this.idFlashRing,
      this.idBg,
      this.idTitle,
      this.idName,
      this.idDob,
      this.idHint,
    ]);
    this.idPanel.setDepth(25).setVisible(false);

    this.flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0).setDepth(24);

    this.padRing = this.add.graphics().setDepth(19);
    this.drawPad();
    this.padKnob = this.add.circle(this.padCenter.x, this.padCenter.y, 40, Color.cream, 0.92).setDepth(20);
    this.padLabel = addUiText(this, this.padCenter.x, this.padCenter.y - 128, "Heading to stop…", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: Color.bannerInk,
      padding: { x: 10, y: 6 },
      fontStyle: "600",
      maxWidth: 240,
      maxHeight: 40,
    })
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.padRing.setVisible(false);
    this.padKnob.setVisible(false);
    this.padLabel.setVisible(false);

    const kb = this.input.keyboard;
    this.keys = kb
      ? (kb.addKeys("W,A,S,D,E,UP,DOWN,LEFT,RIGHT,SPACE") as Record<string, Phaser.Input.Keyboard.Key>)
      : {};
    kb?.on("keydown-E", () => getSim().queueInteract());
    kb?.on("keydown-SPACE", () => getSim().queueInteract());

    this.input.addPointer(2);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onPointerUp(p));

    this.makeSettings();
    this.makeResults();
    this.layoutHud();
    const relayout = (): void => this.layoutHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
    this.game.events.on(VIEWFIT_EVENT, relayout);
    this.events.on(Phaser.Scenes.Events.PAUSE, () => {
      this.toastText.setVisible(false);
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(VIEWFIT_EVENT, relayout));

    this.paintHud(getSim().snapshot());
  }

  update(_time: number, delta: number): void {
    const sim = getSim();
    const snap = sim.snapshot();
    if (!snap.autoDriving) {
      const { dx, dy } = this.readInput();
      sim.setPlayerInput(dx, dy);
    } else {
      sim.setPlayerInput(0, 0);
    }
    sim.tick(delta);
    this.paintHud(sim.snapshot());
  }

  private layoutHud(): void {
    const inset = designSafeInset(viewFromScale(this.scale), readCssSafeArea(document.getElementById("game-root")));
    const left = 28 + inset.left;
    const right = GAME_WIDTH - 28 - inset.right;
    const bottom = GAME_HEIGHT - 40 - inset.bottom;
    this.readoutCorner = { left, right, top: HUD_CORNER_TOP + inset.top };
    this.placeReadouts();
    const cogSize = HUD_TOUCH_MIN_DESIGN;
    const cogX = GAME_WIDTH - 24 - inset.right;
    const cogY = GAME_HEIGHT - 20 - inset.bottom;
    this.cog.setPosition(cogX, cogY);
    this.cog.setDisplaySize(cogSize, cogSize);
    syncItemHit(this.cog);
    this.cogCaption.setPosition(cogX - cogSize / 2, cogY - cogSize - 8);
    this.settingsPanel.setPosition(cogX - SETTINGS_W, cogY - cogSize - 32 - SETTINGS_H);

    // Keep the phone clear of the settings cog (bottom-right).
    const cogLeft = cogX - cogSize;
    const cogTop = cogY - cogSize;
    const phoneRight = Math.min(GAME_WIDTH - 16 - inset.right, cogLeft - PHONE_COG_GAP);
    const phoneBottom = Math.min(GAME_HEIGHT - 16 - inset.bottom, cogTop - PHONE_COG_GAP);
    this.phone.setPosition(phoneRight - PHONE_W * 0.5, phoneBottom - PHONE_H * 0.5);
    this.phoneBody.setDisplaySize(PHONE_W, PHONE_H);
    // Toast stays clear of the cog column.
    this.toastText.setPosition(GAME_WIDTH / 2 - 40, bottom);
    this.padCenter = { x: 196 + inset.left, y: GAME_HEIGHT - 220 - inset.bottom };
    this.drawPad();
    this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    this.padLabel.setPosition(this.padCenter.x, this.padCenter.y - 128);
  }

  /**
   * In the shop the readouts flank the counter sign; out on the road there is no
   * sign to flank, so they fall back to the screen corners.
   */
  private placeReadouts(): void {
    // The label tracks the value's measured width, so extra digits push it further
    // out instead of ever running under it. Re-run whenever the value text changes.
    const valueW = this.scoreText.width;
    if (this.readoutsInShop) {
      const signLeft = COUNTER_SIGN.x - COUNTER_SIGN.w / 2 - HUD_SIGN_GAP;
      const signRight = COUNTER_SIGN.x + COUNTER_SIGN.w / 2 + HUD_SIGN_GAP;
      this.scoreText.setOrigin(1, 0.5).setPosition(signLeft, COUNTER_SIGN.y);
      this.scoreCaption.setOrigin(1, 0.5).setPosition(signLeft - valueW - HUD_SCORE_GAP, COUNTER_SIGN.y);
      this.clockText.setOrigin(0, 0.5).setPosition(signRight, COUNTER_SIGN.y);
      this.scorePopLayer.setPosition(signLeft, COUNTER_SIGN.y - 46);
      return;
    }
    // Corner fallback reads the same way, but digits grow right into open screen.
    const { left, right, top } = this.readoutCorner;
    this.scoreCaption.setOrigin(0, 0.5).setPosition(left, top);
    const valueX = left + this.scoreCaption.width + HUD_SCORE_GAP;
    this.scoreText.setOrigin(0, 0.5).setPosition(valueX, top);
    this.clockText.setOrigin(1, 0.5).setPosition(right, top);
    this.scorePopLayer.setPosition(valueX + valueW + 16, top);
  }

  private paintHud(snap: SimSnapshot): void {
    const scoreLabel = String(snap.score);
    const scoreResized = scoreLabel !== this.scoreText.text;
    this.scoreText.setText(scoreLabel);
    this.clockText.setText(snap.clockLabel);
    const inShop = snap.playerRole !== "driver";
    const modeChanged = inShop !== this.readoutsInShop;
    this.readoutsInShop = inShop;
    if (scoreResized || modeChanged) this.placeReadouts();
    this.consumeScoreFlash(snap);
    this.consumeSfx(snap);
    this.syncResults(snap);
    if (snap.shiftEnded) {
      this.toastText.setVisible(false);
      this.coverText.setVisible(false);
      this.phone.setVisible(false);
      this.phoneHit.disableInteractive();
      this.idDim.setVisible(false);
      this.idPanel.setVisible(false);
      this.padRing.setVisible(false);
      this.padKnob.setVisible(false);
      this.padLabel.setVisible(false);
      this.syncDoorScene(snap);
      syncMusicToClock(snap.gameMs);
      return;
    }
    const next = tutorialHints(snap)[0];
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(snap.gameMs / 160));
    const flashNext = this.settingsOpen || this.resultsVisible ? null : next;

    const drop = snap.dropoff;
    const showPhone = snap.playerRole === "driver" && (drop.phase === "atCurb" || drop.phase === "calling");
    const atDoor = drop.phase === "atDoor";
    const flashPhone = flashNext?.kind === "phone";

    this.phone.setVisible(showPhone);
    if (showPhone) {
      if (!this.phoneHit.input) this.phoneHit.setInteractive({ useHandCursor: true });
      else this.phoneHit.input.enabled = true;
    } else {
      this.phoneHit.disableInteractive();
    }
    const callName = drop.customerName ?? "customer";
    const phoneLine =
      drop.phase === "calling" ? `Calling…\n${callName}` : `Tap to call\n${callName}`;
    this.phoneStatus.setText(phoneLine);
    if (showPhone) {
      this.phone.setAlpha(1);
      this.phoneBody.setAlpha(drop.phase === "calling" ? 0.92 : 1);
      this.phoneFlash.setVisible(flashPhone && drop.phase !== "calling");
      if (flashPhone && drop.phase !== "calling") {
        this.phoneFlash.setStrokeStyle(4 + Math.round(3 * pulse), Color.lime, 0.55 + 0.45 * pulse);
        this.phoneStatus.setColor(Color.inkHex);
        this.phoneStatus.setBackgroundColor(Color.limeHex);
      } else {
        this.phoneFlash.setVisible(false);
        this.phoneStatus.setColor(drop.phase === "calling" ? Color.neonHex : Color.creamHex);
        this.phoneStatus.setBackgroundColor("#101418");
      }
      this.phoneStatus.setPadding(10, 6, 10, 6);
      refitType(this.phoneStatus);
      this.paintPhoneMap(snap);
    } else {
      this.phoneFlash.setVisible(false);
      this.phoneMap.clear();
    }

    const showId = !!drop.idCard && drop.idAsked;
    if (showId && !this.idWasShowing) {
      this.idCardArmedAt = snap.gameMs + NPC_INTERACT_COOLDOWN_MS;
    }
    this.idWasShowing = showId;
    const idLive = showId && snap.gameMs >= this.idCardArmedAt;
    const flashId = flashNext?.kind === "idCard";
    this.idDim.setVisible(showId);
    if (showId) {
      if (!this.idDim.input) this.idDim.setInteractive({ useHandCursor: false });
      else this.idDim.input.enabled = true;
    } else {
      this.idDim.disableInteractive();
    }
    this.idPanel.setVisible(showId);
    this.idPanel.setAlpha(1);
    if (idLive) {
      if (!this.idBg.input) enableItemHit(this.idBg);
      else this.idBg.input.enabled = true;
    } else {
      this.idBg.disableInteractive();
    }
    // Pulse border only — keep ID text fully readable.
    this.idFlashRing.setVisible(idLive && flashId);
    if (idLive && flashId) {
      this.idFlashRing.setStrokeStyle(6 + Math.round(4 * pulse), Color.lime, 0.55 + 0.45 * pulse);
      this.idFlashRing.setAlpha(1);
    }
    this.idBg.setAlpha(1);
    this.idTitle.setAlpha(1);
    this.idName.setAlpha(1);
    this.idDob.setAlpha(1);
    this.idHint.setAlpha(1);
    if (drop.idCard) {
      this.idName.setText(drop.idCard.name);
      const band = drop.idCard.ageOk ? "19+" : "UNDER 19";
      this.idDob.setText(`DOB  ${drop.idCard.dob}   ·   ${band}`);
      this.idHint.setText(drop.idCard.ageOk ? "Tap the card to confirm 19+" : "Under 19 — tap to deny and leave");
      this.idHint.setColor(drop.idCard.ageOk ? "#3d7a45" : Color.dangerHex);
      this.idBg.setStrokeStyle(6, drop.idCard.ageOk ? 0x3d7a45 : 0xc45a3a);
    }

    if (drop.photoTaken && !this.sawPhoto) {
      this.sawPhoto = true;
      playCameraClick(this.game);
      this.flash.setAlpha(0.85);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 220 });
    }
    if (!drop.photoTaken) this.sawPhoto = false;

    this.toastText.setText(snap.toast);
    const driving = snap.playerRole === "driver" && !atDoor;
    // Drive prompts float over the van; ID/phone keep their own UI.
    const driveBanner = driving && !!snap.toast;
    this.toastText.setVisible(!!snap.toast && !showId && snap.dropoff.phase !== "atDoor" && !showPhone && !driveBanner);
    this.paintCover(snap);
    const showPad =
      driving &&
      !showPhone &&
      !showId &&
      !this.settingsOpen &&
      !this.resultsVisible &&
      snap.autoDriving;
    this.padRing.setVisible(showPad);
    this.padKnob.setVisible(showPad);
    this.padLabel.setVisible(showPad);
    if (showPad) {
      this.padLabel.setText(snap.run?.nextStopId ? "Auto · nudge pad" : "Auto · nudge to shop");
      this.drawPad(!!flashNext && flashNext.kind === "gpsPin");
      if (this.pointerId === null) this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    } else if (this.pointerId !== null) {
      this.pointerId = null;
    }
    this.syncDriveScene(snap);
    this.syncDoorScene(snap);
    syncMusicToClock(snap.gameMs);
  }

  /**
   * The key lead keeps trading while the player drives, but the shop scene is asleep for
   * the whole run. Without this line the only sign of it is an unexplained score pop.
   */
  private paintCover(snap: SimSnapshot): void {
    const cover = snap.shopCover;
    const show = cover.active && !this.settingsOpen && !this.resultsVisible && !snap.dropoff.idCard;
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
    this.coverText.setText(`COUNTER  ·  ${cover.line}${tally ? `  ·  ${tally}` : ""}`);
    this.coverText.setPosition(this.readoutCorner.left, this.readoutCorner.top + 40);
    refitType(this.coverText);
  }

  private syncDriveScene(snap: SimSnapshot): void {
    if (snap.playerRole !== "driver") return;
    if (this.scene.isActive("shop") && !this.scene.isSleeping("shop")) this.scene.sleep("shop");
    if (snap.dropoff.phase === "atDoor") return;
    if (this.scene.isSleeping("drive")) this.scene.wake("drive");
    else if (!this.scene.isActive("drive")) this.scene.launch("drive");
  }

  private makeSettings(): void {
    this.settingsDim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Color.ink, 0.45)
      .setDepth(40)
      .setVisible(false);
    this.armSettingsDim(false);
    this.settingsDim.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.closeSettings();
    });

    const panelX = GAME_WIDTH - 24 - SETTINGS_W;
    const panelY = GAME_HEIGHT - 24 - 168 - SETTINGS_H;
    const bg = addPanel(this, 0, 0, SETTINGS_W, SETTINGS_H, {
      radius: 4,
      fill: Color.card,
      stroke: Color.woodTrim,
      depth: 41,
    });
    const title = addUiText(this, 24, 16, "SETTINGS", {
      size: SET_TITLE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      maxWidth: SETTINGS_W - 48,
      maxHeight: 36,
    });
    const musicLabel = addUiText(this, 24, 64, "Music", {
      size: SET_BODY_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      maxWidth: 180,
      maxHeight: 28,
    });
    this.musicValue = addUiText(this, SETTINGS_W - 28, 72, "", {
      size: SET_TITLE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      maxWidth: 140,
      maxHeight: 32,
    }).setOrigin(1, 0.5);
    const musicHit = this.add
      .rectangle(SETTINGS_W / 2, 76, SETTINGS_W - 24, 48, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    musicHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      setMusicEnabled(!getMusicPrefs().enabled, this.game);
      this.refreshMusicControls();
    });

    const volumeLabel = addUiText(this, 24, 124, "Volume", {
      size: SET_BODY_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      maxWidth: 180,
      maxHeight: 28,
    });
    this.volumePct = addUiText(this, SETTINGS_W - 28, 132, "", {
      size: SET_BODY_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      maxWidth: 100,
      maxHeight: 28,
    }).setOrigin(1, 0.5);
    const track = this.add.rectangle(VOL_TRACK.x, VOL_TRACK.y, VOL_TRACK.w, VOL_TRACK.h, 0xd8c8b0).setOrigin(0, 0.5);
    this.volumeFill = this.add.rectangle(VOL_TRACK.x, VOL_TRACK.y, 8, VOL_TRACK.h, Color.leaf).setOrigin(0, 0.5);
    this.volumeKnob = this.add.circle(VOL_TRACK.x, VOL_TRACK.y, 12, Color.woodTrim);
    this.volumeHit = this.add
      .rectangle(VOL_TRACK.x + VOL_TRACK.w / 2, VOL_TRACK.y, VOL_TRACK.w, 44, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    this.volumeHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.draggingVol = true;
      this.setVolumeFromPointer(p);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.draggingVol) this.setVolumeFromPointer(p);
    });
    this.input.on("pointerup", () => {
      this.draggingVol = false;
    });
    this.input.on("pointerupoutside", () => {
      this.draggingVol = false;
    });

    const endShift = addHudButton(this, 24, 200, END_SHIFT_LABEL, () => this.endShiftEarly(), {
      originX: 0,
      originY: 0,
      variant: "primary",
      minWidth: SETTINGS_W - 48,
      caption: END_SHIFT_CAPTION,
      labelSize: SET_TITLE_PX,
      captionSize: SET_HINT_PX,
      depth: 41,
    });
    this.endShiftBtn = endShift;

    const reset = addHudButton(this, 24, 348, "RESET DAY TO 9:00 AM", () => this.resetDayToNine(), {
      originX: 0,
      originY: 0,
      variant: "amber",
      minWidth: SETTINGS_W - 48,
      caption: "Clock back to 9 AM · clears the door stop",
      labelSize: SET_TITLE_PX,
      captionSize: SET_HINT_PX,
      depth: 41,
    });
    const resetHint = addUiText(this, 24, 496, "Packed bags stay. Late timers start over.", {
      size: SET_HINT_PX,
      color: Color.muteHex,
      fontStyle: "600",
      strokeThickness: 0,
      maxWidth: SETTINGS_W - 48,
      maxHeight: 36,
    });

    this.settingsPanel = this.add.container(panelX, panelY, [
      bg,
      title,
      musicLabel,
      this.musicValue,
      musicHit,
      volumeLabel,
      this.volumePct,
      track,
      this.volumeFill,
      this.volumeKnob,
      this.volumeHit,
      endShift,
      reset,
      resetHint,
    ]);
    this.settingsPanel.setDepth(41).setVisible(false);

    const cogX = GAME_WIDTH - 24;
    const cogY = GAME_HEIGHT - 20;
    const cogSize = HUD_TOUCH_MIN_DESIGN;
    this.cog = this.add.image(cogX, cogY, "tex-cog").setOrigin(1, 1).setDisplaySize(cogSize, cogSize).setDepth(42);
    enableItemHit(this.cog);
    const toggleSettings = (p: Phaser.Input.Pointer): void => {
      p.event.stopPropagation();
      if (this.settingsOpen) this.closeSettings();
      else this.openSettings();
    };
    this.cog.on("pointerdown", toggleSettings);
    this.cogCaption = addUiText(this, cogX - cogSize / 2, cogY - cogSize - 8, "Settings", {
      size: SET_BODY_PX,
      color: Color.creamHex,
      backgroundColor: Color.bannerInk,
      padding: { x: 12, y: 6 },
      fontStyle: "600",
      align: "center",
      maxWidth: 240,
      maxHeight: 36,
    })
      .setOrigin(0.5, 1)
      .setDepth(42);
    enableItemHit(this.cogCaption);
    this.cogCaption.on("pointerdown", toggleSettings);
    this.refreshMusicControls();
  }

  private armSettingsDim(on: boolean): void {
    // The dim spans the whole screen, so it must not exist as a hit target while
    // the panel is closed or it swallows every click behind it.
    if (on) this.settingsDim.setInteractive({ useHandCursor: false });
    else this.settingsDim.disableInteractive();
  }

  /** Design-space panel rect — the dim spans the screen, so its local coords are design coords. */
  private overSettingsPanel(x: number, y: number): boolean {
    const { x: px, y: py } = this.settingsPanel;
    return x >= px && x <= px + SETTINGS_W && y >= py && y <= py + SETTINGS_H;
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.settingsDim.setVisible(true);
    this.armSettingsDim(true);
    this.settingsPanel.setVisible(true);
    this.refreshMusicControls();
    this.refreshEndShiftButton();
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.settingsDim.setVisible(false);
    this.armSettingsDim(false);
    this.settingsPanel.setVisible(false);
  }

  private refreshEndShiftButton(): void {
    const can = getSim().snapshot().canEndShiftEarly;
    this.endShiftBtn.setAlpha(can ? 1 : 0.45);
  }

  private refreshMusicControls(): void {
    const prefs = getMusicPrefs();
    this.musicValue.setText(prefs.enabled ? "ON" : "OFF");
    this.musicValue.setColor(prefs.enabled ? "#3d6a44" : Color.muteHex);
    const t = prefs.volume;
    this.volumeFill.width = Math.max(8, VOL_TRACK.w * t);
    this.volumeKnob.setPosition(VOL_TRACK.x + VOL_TRACK.w * t, VOL_TRACK.y);
    this.volumePct.setText(`${Math.round(t * 100)}%`);
  }

  private setVolumeFromPointer(p: Phaser.Input.Pointer): void {
    const bounds = this.volumeHit.getBounds();
    const t = Phaser.Math.Clamp((p.x - bounds.left) / Math.max(1, bounds.width), 0, 1);
    setMusicVolume(t, this.game);
    this.refreshMusicControls();
  }

  private resetDayToNine(): void {
    getSim().resetToMorning();
    syncMusicToClock(0);
    this.closeSettings();
    this.hideResults();
    this.refreshMusicControls();
    this.ensureShopVisible();
  }

  private endShiftEarly(): void {
    if (!getSim().endShiftEarly()) return;
    this.closeSettings();
    this.paintHud(getSim().snapshot());
  }

  private makeResults(): void {
    this.resultsDim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Color.ink, 0.62)
      .setDepth(50)
      .setInteractive()
      .setVisible(false);
    this.resultsDim.disableInteractive();
    this.resultsDim.on("pointerdown", (p: Phaser.Input.Pointer) => p.event.stopPropagation());

    const x = Math.floor((GAME_WIDTH - RESULTS_W) / 2);
    const y = Math.floor((GAME_HEIGHT - RESULTS_H) / 2);
    const bg = addPanel(this, 0, 0, RESULTS_W, RESULTS_H, {
      radius: 4,
      fill: Color.card,
      stroke: Color.woodTrim,
      depth: 51,
    });
    this.resultsTitle = addUiText(this, RESULTS_W / 2, 28, "", {
      size: Type.title,
      color: Color.inkHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      maxWidth: RESULTS_W - 64,
      maxHeight: 48,
    }).setOrigin(0.5, 0);
    this.resultsClock = addUiText(this, RESULTS_W / 2, 78, "", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "600",
      align: "center",
      strokeThickness: 0,
      maxWidth: RESULTS_W - 64,
      maxHeight: 28,
    }).setOrigin(0.5, 0);
    this.resultsScore = addUiText(this, RESULTS_W / 2, 118, "", {
      size: Type.display,
      color: Color.inkHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      maxWidth: RESULTS_W - 64,
      maxHeight: 52,
    }).setOrigin(0.5, 0);
    const scoreCap = addUiText(this, RESULTS_W / 2, 176, "SHIFT SCORE", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      maxWidth: RESULTS_W - 64,
      maxHeight: 28,
    }).setOrigin(0.5, 0);
    this.resultsBreakdown = addUiText(this, RESULTS_W / 2, 220, "", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "600",
      align: "center",
      strokeThickness: 0,
      lineSpacing: 8,
      maxWidth: RESULTS_W - 80,
      maxHeight: 168,
    }).setOrigin(0.5, 0);
    this.resultsVerdict = addUiText(this, RESULTS_W / 2, 408, "", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      maxWidth: RESULTS_W - 96,
      maxHeight: 48,
    }).setOrigin(0.5, 0);

    const newDay = addHudButton(this, RESULTS_W / 2 - 12, 472, RESULTS_NEW_DAY.label, () => this.onNewDay(), {
      originX: 1,
      originY: 0,
      variant: "primary",
      minWidth: 280,
      caption: RESULTS_NEW_DAY.caption,
      depth: 52,
    });
    const titleBtn = addHudButton(this, RESULTS_W / 2 + 12, 472, RESULTS_TITLE.label, () => this.onTitle(), {
      originX: 0,
      originY: 0,
      variant: "amber",
      minWidth: 240,
      caption: RESULTS_TITLE.caption,
      depth: 52,
    });

    this.resultsPanel = this.add.container(x, y, [
      bg,
      this.resultsTitle,
      this.resultsClock,
      this.resultsScore,
      scoreCap,
      this.resultsBreakdown,
      this.resultsVerdict,
      newDay,
      titleBtn,
    ]);
    this.resultsPanel.setDepth(51).setVisible(false);
  }

  private consumeScoreFlash(snap: SimSnapshot): void {
    const flash = snap.scoreFlash;
    if (!flash || flash.id === this.lastScoreFlashId) return;
    this.lastScoreFlashId = flash.id;
    this.spawnScorePop(flash.delta);
  }

  private consumeSfx(snap: SimSnapshot): void {
    const cue = snap.sfxCue;
    if (!cue || cue.id === this.lastSfxId) return;
    this.lastSfxId = cue.id;
    playUiSfx(this.game, cue.kind);
  }

  private spawnScorePop(delta: number): void {
    const positive = delta >= 0;
    const label = addUiText(this, 0, 0, positive ? `+${delta}` : String(delta), {
      size: Type.heading,
      color: positive ? Color.neonHex : Color.dangerHex,
      fontStyle: "700",
      strokeThickness: 0,
      backgroundColor: Color.bannerInkSoft,
      padding: { x: 10, y: 4 },
      maxWidth: 160,
      maxHeight: 40,
    }).setOrigin(this.readoutsInShop ? 1 : 0, 0.5);
    // Pop rises outboard of the score so it never crosses the sign or the caption.
    this.placeReadouts();
    this.scorePopLayer.add(label);
    this.tweens.add({
      targets: this.scoreText,
      scale: { from: 1.18, to: 1 },
      duration: 280,
      ease: "Back.easeOut",
    });
    this.tweens.add({
      targets: label,
      y: { from: 0, to: -56 },
      alpha: { from: 1, to: 0 },
      duration: 900,
      ease: "Cubic.easeOut",
      onComplete: () => label.destroy(),
    });
  }

  private syncResults(snap: SimSnapshot): void {
    if (!snap.shiftEnded || !snap.shiftResults) {
      this.hideResults();
      return;
    }
    this.showResults(snap.shiftResults);
  }

  private showResults(results: ShiftResults): void {
    this.resultsVisible = true;
    this.resultsDim.setVisible(true).setInteractive();
    this.resultsPanel.setVisible(true);
    this.resultsTitle.setText(results.title);
    this.resultsClock.setText(`Clock ${results.clockLabel}`);
    this.resultsScore.setText(String(results.score));
    this.resultsBreakdown.setText(formatBreakdown(results));
    this.resultsVerdict.setText(results.verdict);
    this.scene.bringToTop();
  }

  private hideResults(): void {
    this.resultsVisible = false;
    this.resultsDim.setVisible(false).disableInteractive();
    this.resultsPanel.setVisible(false);
  }

  private onNewDay(): void {
    getSim().startNewDay();
    syncMusicToClock(0);
    this.hideResults();
    this.closeSettings();
    this.ensureShopVisible();
    this.paintHud(getSim().snapshot());
  }

  private onTitle(): void {
    startSession();
    this.hideResults();
    this.closeSettings();
    this.ensureShopVisible();
    if (this.scene.isActive("title")) this.scene.stop("title");
    this.scene.launch("title");
  }

  private ensureShopVisible(): void {
    if (this.scene.isActive("door") && !this.scene.isSleeping("door")) this.scene.sleep("door");
    if (this.scene.isActive("drive") && !this.scene.isSleeping("drive")) this.scene.sleep("drive");
    if (this.scene.isSleeping("shop")) this.scene.wake("shop");
    else if (!this.scene.isActive("shop")) this.scene.launch("shop");
  }

  private drawPad(flash = false): void {
    const { x, y } = this.padCenter;
    this.padRing.clear();
    this.padRing.fillStyle(Color.ink, 0.4);
    this.padRing.fillCircle(x, y, 108);
    this.padRing.lineStyle(flash ? 6 : 5, Color.lime, flash ? 1 : 0.85);
    this.padRing.strokeCircle(x, y, 108);
    this.padRing.lineStyle(3, flash ? Color.cream : Color.cream, flash ? 0.7 : 0.35);
    this.padRing.strokeCircle(x, y, 76);
  }

  /** Mini city map on the delivery phone screen. */
  private paintPhoneMap(snap: SimSnapshot): void {
    const g = this.phoneMap;
    g.clear();
    const mapX = PHONE_SCREEN.x + 6;
    const mapY = PHONE_SCREEN.y + 64;
    const mapW = PHONE_SCREEN.w - 12;
    const mapH = PHONE_SCREEN.h - 140;
    g.fillStyle(0x1a2228, 1);
    g.fillRoundedRect(mapX, mapY, mapW, mapH, 6);
    g.lineStyle(1, 0x2e3a44, 1);
    g.strokeRoundedRect(mapX, mapY, mapW, mapH, 6);

    // App chrome behind title / status
    g.fillStyle(0x0c1014, 1);
    g.fillRect(PHONE_SCREEN.x + 4, PHONE_SCREEN.y + 6, PHONE_SCREEN.w - 8, 56);
    g.fillRect(PHONE_SCREEN.x + 4, PHONE_SCREEN.y + PHONE_SCREEN.h - 72, PHONE_SCREEN.w - 8, 66);

    const scale = Math.min(mapW / MAP_PX_W, mapH / MAP_PX_H);
    const ox = mapX + (mapW - MAP_PX_W * scale) * 0.5;
    const oy = mapY + (mapH - MAP_PX_H * scale) * 0.5;
    const toMap = (wx: number, wy: number): { x: number; y: number } => ({
      x: ox + wx * scale,
      y: oy + wy * scale,
    });

    // Roads
    g.fillStyle(0x3a4248, 1);
    const kinds = CITY.kinds;
    const step = Math.max(1, Math.floor(TILE * scale) < 1.2 ? 2 : 1);
    for (let r = 0; r < kinds.length; r += step) {
      for (let c = 0; c < kinds[r]!.length; c += step) {
        const k = kinds[r]![c];
        if (k !== "road" && k !== "parking") continue;
        const p = toMap(c * TILE, r * TILE);
        const s = Math.max(1.2, TILE * scale * step);
        g.fillRect(p.x, p.y, s, s);
      }
    }

    // Kindling shop
    const shop = CITY.shopLot;
    const shopPt = toMap(shop.origin.c * TILE, shop.origin.r * TILE);
    g.fillStyle(Color.lime, 0.9);
    g.fillRect(shopPt.x, shopPt.y, Math.max(3, shop.w * TILE * scale), Math.max(3, shop.h * TILE * scale));

    // Destination pin
    const stopId = snap.run?.nextStopId ?? snap.dropoff.houseId;
    if (stopId) {
      const house = houseById(stopId);
      if (house) {
        const stop = tileToWorld(house.stop);
        const pin = toMap(stop.x, stop.y);
        g.fillStyle(Color.amber, 1);
        g.fillCircle(pin.x, pin.y, 4);
        g.lineStyle(1.5, Color.cream, 1);
        g.strokeCircle(pin.x, pin.y, 4);
      }
    }

    // Van
    const van = toMap(snap.vehicle.x, snap.vehicle.y);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(van.x, van.y, 3.5);
    g.fillStyle(Color.neon, 1);
    g.fillCircle(van.x, van.y, 2.2);
  }

  private syncDoorScene(snap: SimSnapshot): void {
    const wantDoor = snap.playerRole === "driver" && snap.dropoff.phase === "atDoor";
    const showId = !!snap.dropoff.idCard && snap.dropoff.idAsked && !snap.dropoff.idChecked;
    const doorUp = this.scene.isActive("door") && !this.scene.isSleeping("door");
    if (wantDoor && !doorUp) {
      this.scene.sleep("drive");
      if (this.scene.isSleeping("door")) this.scene.wake("door");
      else this.scene.launch("door");
    } else if (!wantDoor && doorUp) {
      this.scene.sleep("door");
      if (snap.playerRole === "driver" && this.scene.isSleeping("drive")) this.scene.wake("drive");
    }
    if (wantDoor) {
      // ID modal lives on the HUD; bag/customer taps live on the door — flip who is on top.
      if (showId) {
        this.scene.bringToTop("door");
        this.scene.bringToTop();
      } else {
        this.scene.bringToTop();
        this.scene.bringToTop("door");
      }
    } else {
      this.scene.bringToTop();
    }
  }

  private readInput(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) dx -= 1;
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) dx += 1;
    if (this.keys.W?.isDown || this.keys.UP?.isDown) dy -= 1;
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) dy += 1;

    if (this.pointerId !== null) {
      const pointers = [this.input.pointer1, this.input.pointer2, this.input.activePointer].filter(
        (pt): pt is Phaser.Input.Pointer => !!pt,
      );
      const p = pointers.find((pt) => pt.id === this.pointerId) ?? this.input.activePointer;
      dx = Phaser.Math.Clamp((p.x - this.padCenter.x) / 88, -1, 1);
      dy = Phaser.Math.Clamp((p.y - this.padCenter.y) / 88, -1, 1);
      this.padKnob.setPosition(this.padCenter.x + dx * 48, this.padCenter.y + dy * 48);
    } else {
      this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    }
    return clampInput(dx, dy);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.padRing.visible) return;
    const d = Phaser.Math.Distance.Between(p.x, p.y, this.padCenter.x, this.padCenter.y);
    if (d <= HUD_TOUCH_MIN_DESIGN) this.pointerId = p.id;
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.pointerId === p.id) this.pointerId = null;
  }
}

function formatBreakdown(results: ShiftResults): string {
  const b = results.breakdown;
  const lines = [
    `In-store  ×${b.inStore}   ·   +${b.inStore * SCORE_INSTORE}`,
    `Pickups  ×${b.pickups}   ·   +${b.pickups * SCORE_PICKUP}`,
    `On-time drops  ×${b.deliveriesOnTime}   ·   +${b.deliveriesOnTime * SCORE_DELIVERY_ON_TIME}`,
    `Late drops  ×${b.deliveriesLate}   ·   ${b.deliveriesLate * SCORE_DELIVERY_LATE}`,
    `Fails  ×${b.fails}   ·   ${b.fails * SCORE_FAIL}`,
  ];
  return lines.join("\n");
}
