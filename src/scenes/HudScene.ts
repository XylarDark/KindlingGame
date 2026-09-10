import Phaser from "phaser";
import { getMusicPrefs, setMusicEnabled, setMusicVolume, syncMusicToClock } from "../audio/music";
import { loadDisplayPrefs, saveDisplayPrefs } from "../ui/displayPrefs";
import { openInstallCoachFromSettings } from "../ui/installCoach";
import { playCameraClick, playUiSfx } from "../audio/sfx";
import { applyPortraitTexture, portraitImageKey } from "../art/peopleAtlas";
import { PORTRAIT_H, PORTRAIT_W } from "../art/peopleSize";
import {
  PHONE_APP_CELLS,
  PHONE_CHASSIS_CELLS,
  PHONE_PX,
  PHONE_SCALE,
  PHONE_TEX,
  phoneDesignRect,
} from "../art/phoneArt";
import { clampInput } from "../input/controls";
import { enableItemHit, syncItemHit } from "../input/hit";
import { houseById, lotWorldRect } from "../maps/cityT0";
import { cityMinimapGeometry, fitCityPanel, minimapProjection, type WorldRect } from "../maps/cityMinimap";
import { COUNTER_SIGN } from "../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH, NPC_INTERACT_COOLDOWN_MS, SCORE_DELIVERY_LATE, SCORE_DELIVERY_ON_TIME, SCORE_FAIL, SCORE_INSTORE, SCORE_PICKUP } from "../sim/constants";
import { getSim, startSession } from "../session";
import { setPwaIdle } from "../pwaUpdate";
import { applyCanvasDisplayScale } from "../shell";
import type { SimSnapshot } from "../sim/gameSim";
import type { ShiftResults } from "../sim/shiftResults";
import { tutorialHints } from "../sim/tutorialHints";
import { addHudButton, addPanel } from "../ui/chrome";
import { END_SHIFT_CAPTION, END_SHIFT_LABEL, RESULTS_NEW_DAY, RESULTS_TITLE } from "../ui/copy";
import { addSignText, setSignAccent } from "../ui/signText";
import { addUiText } from "../ui/text";
import { settingsGeom, type SettingsGeom } from "../ui/settingsGeom";
import { applyRenderBudgetToGame, setRenderStressContext, syncSceneRenderCamera, tickRenderBudget } from "../ui/renderBudget";
import {
  Color,
  HUD_TYPE_FIT,
  MENU_TYPE_FIT,
  MSG_TYPE_FIT,
  scaleChromePx,
  scaleMsgBox,
  scaleMsgPad,
  scaleMsgPx,
  Type,
} from "../ui/theme";
import { parseFontPx, refitType, retypeSize } from "../ui/typekit";
import { designHudInset, HUD_TOUCH_MIN_DESIGN, readCssSafeArea, VIEWFIT_EVENT } from "../ui/viewFit";

/** Readouts sit either side of the counter sign, 10% over the display ramp. */
const HUD_READOUT_PX = 40;
/**
 * Cap one sim step so a long background pause does not jump the shift clock.
 * Must stay ≥ ~1s: capture/phone Chrome often runs well under 15 fps, and a tighter
 * cap (e.g. 100ms) re-introduces slow-motion whenever rawDelta exceeds the cap.
 */
const MAX_SIM_STEP_MS = 1_000;
/**
 * The score carries a further 10%: it is the number the player is playing for. Exported
 * because the shop tablet's ORDERS label is specified as "the same size as the score",
 * and a copy of the number over there would be a copy that drifts.
 */
export const HUD_SCORE_PX = 44;
const HUD_CAPTION_PX = 18;
/** Order banner runs 25% over the ramp — read across the room, mid-task. */
const hudToastPx = (): string => scaleMsgPx(20);
const HUD_SIGN_GAP = 28;
/** Corner fallback keeps clear of the ceiling band on the road and at doors. */
const HUD_CORNER_TOP = 76;
const HUD_SCORE_GAP = 16;
/** Reused score flash labels — avoids per-flash addSignText PRE_RENDER listener churn. */
const SCORE_POP_POOL = 3;

/**
 * No chip behind the readouts, so the ink outline is what separates them from
 * both the bright shop wall and the night street — heavier than a hairline.
 */
function readoutOutline(px: number): { stroke: string; strokeThickness: number } {
  return { stroke: Color.inkHex, strokeThickness: Math.max(2, Math.round(px * 0.12)) };
}

/** Vertical centre of a top-anchored settings row label, for the value opposite it. */
function rowMidY(label: Phaser.GameObjects.Text): number {
  return label.y + label.height / 2;
}

/**
 * Union band of a settings row's label and its right-aligned value. Measuring the row
 * rather than typing a height in is what keeps the row's hit box on its visible ink
 * when the type step moves.
 */
function rowBand(
  label: Phaser.GameObjects.Text,
  value: Phaser.GameObjects.Text,
  minHeight = 56,
): { mid: number; height: number } {
  const top = Math.min(label.y, value.y - value.height / 2);
  const bottom = Math.max(label.y + label.height, value.y + value.height / 2);
  const height = Math.max(bottom - top, minHeight);
  return { mid: (top + bottom) / 2, height };
}

/**
 * Settings panel. Width still uses the 0.75 scale; row/button height follows the
 * current contain scale so a phone hits 48 CSS px without a 900px desktop panel.
 */
const SET_PAD = 24;
const SET_BTN_SCALE = 0.75;
const SET_BTN_W = Math.round((440 - SET_PAD * 2) * SET_BTN_SCALE);
const SETTINGS_W = SET_BTN_W + SET_PAD * 2;
const VOL_KNOB_R = 12;
const VOL_TRACK_X = SET_PAD;
const VOL_TRACK_W = Math.round(312 * SET_BTN_SCALE);
const VOL_TRACK_H = 16;
const SET_HINT_H = 24;

/**
 * Panel type steps. Rows and the end-shift button take a bump because their boxes have
 * the room; the reset copy does not, and is left alone deliberately -- see makeSettings.
 */
const SET_TITLE_PX = "28px";
const SET_ROW_PX = "22px";
const SET_VALUE_PX = "24px";
const SET_BTN_LABEL_PX = "26px";
const SET_BTN_CAP_PX = "16px";
const SET_HINT_PX = "14.3px";

/**
 * The cog caption's own step, 25% over `HUD_CAPTION_PX`. It replaces a `SET_BODY_PX`
 * that only this label used. `HUD_CAPTION_PX` is now the seed for nothing else — the
 * SCORE caption runs at the score's step — so the two numbers are independent, and this
 * one is the one to move for the cog.
 */
const HUD_COG_CAPTION_PX = HUD_CAPTION_PX * 1.25;
const HUD_COG_CAPTION_PAD = { x: 12, y: 6 };
/**
 * Grown from the step rather than typed, because clamp-fit will shrink a seed the
 * box cannot hold: the old 36px box could not hold 22.5px type and would have
 * rendered it at ~19px while the constant claimed 22.5. One line of Inter measures
 * ~1.21x its px; 1.4 leaves headroom for the descender and the chip padding.
 */
const HUD_COG_CAPTION_BOX = {
  w: 240,
  h: Math.ceil(HUD_COG_CAPTION_PX * 1.4 + HUD_COG_CAPTION_PAD.y * 2),
};

/**
 * Delivery phone. Every dimension below is derived from `PHONE_SCALE` and the cell
 * grid in `phoneArt`, because the previous hand-written set drifted out of step with
 * the texture: the chassis, the glass and the app rect stopped agreeing with the
 * pixels they were supposed to sit on. Nothing here may be typed in independently.
 */
const PHONE_W = PHONE_TEX.w * PHONE_SCALE;
const PHONE_H = PHONE_TEX.h * PHONE_SCALE;
/**
 * The visible body, inside the margin the side buttons live in. Both the tap target
 * and the phone's screen placement are measured off this rather than the sprite box,
 * so the transparent button margin neither takes taps nor pads the gap to the cog.
 */
const PHONE_CHASSIS = phoneDesignRect(PHONE_CHASSIS_CELLS);
/** Where the delivery app may paint: glass, minus the baked status bar and home strip. */
const PHONE_APP = phoneDesignRect(PHONE_APP_CELLS);
const PHONE_COG_GAP = 16;
/**
 * App chrome: a title bar, the map, and a status bar the map is fitted around. These
 * were the one part of the phone the header comment above was wrong about — 34, 58 and
 * 4 were typed in, so growing `PHONE_SCALE` grew the glass and left the bars behind,
 * which reads as a bigger phone running a smaller app. Stated in cells instead, at the
 * fractions closest to the numbers they replace (2.5 cells was 34, 4 cells was 58).
 *
 * The status band is the tightest box on the phone: the two-line "Tap to call <name>"
 * measures 64px against the 64.4px this gives it, so it holds its authored 20px — at 58
 * it could not, and was being shrunk. Do not take height out of it without re-measuring.
 */
const PHONE_CELL = PHONE_PX * PHONE_SCALE;
const PHONE_HEADER_H = PHONE_CELL * 2.5;
const PHONE_STATUS_H = PHONE_CELL * 4;
const PHONE_MAP_GAP = PHONE_CELL * 0.25;
const PHONE_TITLE_PX = "20px";
const PHONE_STATUS_PX = "20px";
const padLabelPx = (): string => scaleMsgPx(16.25);

/**
 * The map panel carries the city's own 1.43:1 aspect. The old 204x108 panel was
 * 1.89:1, so a quarter of it was letterbox the city could never reach.
 */
const PHONE_MAP = ((): { x: number; y: number; w: number; h: number } => {
  const fitted = fitCityPanel({
    x: PHONE_APP.x + 6,
    y: PHONE_APP.y + PHONE_HEADER_H + PHONE_MAP_GAP,
    w: PHONE_APP.w - 12,
    h: PHONE_APP.h - PHONE_HEADER_H - PHONE_STATUS_H - PHONE_MAP_GAP * 2,
  });
  // Integers, so the baked static layer lands on whole texture pixels.
  return {
    x: Math.round(fitted.x),
    y: Math.round(fitted.y),
    w: Math.round(fitted.w),
    h: Math.round(fitted.h),
  };
})();

/** Four tones plus the shop's lime — any more and nothing reads at 197px wide. */
const MAP_INK = {
  outside: 0x141a1e,
  block: 0x2c3a30,
  street: 0x515a60,
  drive: 0x3e454a,
  house: 0xb89258,
} as const;

const RESULTS_W = 740;
const RESULTS_H = 640;

/**
 * ID card. Laid out as a real card: header band, portrait, labelled fields beside
 * it, signature strip, and a verdict band along the bottom. The type runs 20% over
 * the shared ramp — the name/DOB read is the gate on the sale, taken at a glance.
 */
const ID_CARD_W = 760;
const ID_CARD_H = 440;
const ID_RING_PAD = 16;
const ID_PAD = 24;
const ID_HEADER_H = 56;
/** Portrait box, in the card's own aspect so the baked photo is never stretched. */
const ID_PHOTO_W = 180;
const ID_PHOTO_H = Math.round((ID_PHOTO_W * PORTRAIT_H) / PORTRAIT_W);
const ID_PHOTO_FRAME = 4;
const ID_TITLE_PX = "19.2px";
const ID_KIND_PX = "15.6px";
const ID_NAME_PX = "31.2px";
const ID_LABEL_PX = "13.2px";
const ID_DOB_PX = "22.8px";
/** The verdict line is the one the player acts on, so it is the loudest thing here. */
const ID_HINT_PX = "24px";
const ID_SIG_PX = "13.2px";
const ID_OK_INK = 0x3d7a45;
const ID_DENY_INK = 0xc45a3a;
const ID_CARD_FILL = 0xf4e8c1;

/** Card-local x of the fields column: right of the portrait. */
const ID_FIELD_X = -ID_CARD_W / 2 + ID_PAD + ID_PHOTO_W + 28;
const ID_FIELD_W = ID_CARD_W / 2 - ID_PAD - ID_FIELD_X;

export class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private scoreCaption!: Phaser.GameObjects.Text;
  /** Last step the caption was set to, so a re-place that changes nothing costs nothing. */
  private captionPx = HUD_SCORE_PX;
  private clockText!: Phaser.GameObjects.Text;
  private padRing!: Phaser.GameObjects.Graphics;
  private padKnob!: Phaser.GameObjects.Arc;
  private padLabel!: Phaser.GameObjects.Text;
  private phone!: Phaser.GameObjects.Container;
  private phoneBody!: Phaser.GameObjects.Image;
  private phoneHit!: Phaser.GameObjects.Rectangle;
  private phoneChrome!: Phaser.GameObjects.Graphics;
  /** Static city, baked once. The city has no RNG, so it never needs redrawing. */
  private phoneMapBase!: Phaser.GameObjects.RenderTexture;
  private phoneMap!: Phaser.GameObjects.Graphics;
  private phoneTitle!: Phaser.GameObjects.Text;
  private phoneStatus!: Phaser.GameObjects.Text;
  private idDim!: Phaser.GameObjects.Rectangle;
  private idPanel!: Phaser.GameObjects.Container;
  private idName!: Phaser.GameObjects.Text;
  private idDob!: Phaser.GameObjects.Text;
  private idHint!: Phaser.GameObjects.Text;
  private idTitle!: Phaser.GameObjects.Text;
  private idKind!: Phaser.GameObjects.Text;
  private idNumber!: Phaser.GameObjects.Text;
  private idExpiry!: Phaser.GameObjects.Text;
  private idPhoto!: Phaser.GameObjects.Image;
  private idFurniture!: Phaser.GameObjects.Graphics;
  private idSignature!: Phaser.GameObjects.Graphics;
  private idBg!: Phaser.GameObjects.Rectangle;
  private idFlashRing!: Phaser.GameObjects.Rectangle;
  /** Last card drawn, so the furniture and signature are redrawn only on a change. */
  private idDrawnFor = "";
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
  private settingsBox!: SettingsGeom;
  private musicValue!: Phaser.GameObjects.Text;
  private fullscreenValue!: Phaser.GameObjects.Text;
  private volumeTrack!: Phaser.GameObjects.Rectangle;
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
  private scorePopPool: Phaser.GameObjects.Text[] = [];
  private scorePopFree: Phaser.GameObjects.Text[] = [];
  private readoutsInShop = true;
  private readoutCorner = { left: 28, right: GAME_WIDTH - 28, top: HUD_CORNER_TOP };
  /** Last shiftEnded passed to setPwaIdle — edge only, not every frame. */
  private pwaIdleShiftEnded = false;
  private lastClockLabel = "";
  private lastToast = "";
  private lastPhoneLine = "";
  private lastPhoneAccentKey = "";
  private lastIdTextKey = "";
  private lastPadLabel = "";
  private lastPadFlash: boolean | null = null;
  private lastPhoneMapKey = "";

  constructor() {
    super("hud");
  }

  create(): void {
    this.input.setTopOnly(false);
    syncSceneRenderCamera(this);

    // Readouts sit over bright shop walls AND dark night streets, so contrast comes
    // from an ink outline on the glyphs rather than a chip behind them.
    this.scoreText = addUiText(this, 0, 0, "", {
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
      .setDepth(20);
    // Seeded at the value's step, and kept there by matchCaptionToValue: the caption
    // reads as part of the number rather than a footnote under it. The box is the
    // value's height and wide enough for tracked caps at 44px (164px of glyphs), so
    // clamp-fit leaves the seed alone at the size it was authored for.
    this.scoreCaption = addUiText(this, 0, 0, "SCORE", {
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
      .setDepth(20);
    this.scorePopLayer = this.add.container(0, 0).setDepth(30);
    this.warmScorePopPool();

    this.clockText = addUiText(this, 0, 0, "", {
      size: scaleChromePx(HUD_READOUT_PX),
      color: Color.creamHex,
      fontStyle: "700",
      ...HUD_TYPE_FIT,
      maxWidth: 360,
      maxHeight: 62,
      ...readoutOutline(HUD_READOUT_PX),
    })
      .setOrigin(0, 0.5)
      .setDepth(20);

    this.phoneBody = this.add.image(0, 0, "tex-phone").setDisplaySize(PHONE_W, PHONE_H);
    this.phoneChrome = this.add.graphics();
    this.phoneMapBase = this.add.renderTexture(PHONE_MAP.x, PHONE_MAP.y, PHONE_MAP.w, PHONE_MAP.h).setOrigin(0, 0);
    this.bakePhoneMap();
    this.phoneMap = this.add.graphics();
    this.phoneTitle = addUiText(this, 0, PHONE_APP.y + PHONE_HEADER_H / 2, "KINDLING DELIVERY", {
      size: PHONE_TITLE_PX,
      color: Color.limeHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      letterSpacing: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: PHONE_APP.w - 16,
      maxHeight: PHONE_HEADER_H,
    }).setOrigin(0.5);
    this.phoneStatus = addSignText(this, 0, PHONE_APP.y + PHONE_APP.h - PHONE_STATUS_H / 2, "Tap to call", {
      size: PHONE_STATUS_PX,
      fontStyle: "600",
      align: "center",
      lineSpacing: 2,
      padding: { x: 10, y: 4 },
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: PHONE_APP.w - 12,
      maxHeight: PHONE_STATUS_H,
    }).setOrigin(0.5);
    // Hit area is the chassis: the transparent button margin must not take taps.
    this.phoneHit = this.add
      .rectangle(0, 0, PHONE_CHASSIS.w, PHONE_CHASSIS.h, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    this.phoneHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().pressDropoffConfirm();
    });
    this.phoneHit.on("pointerup", () => getSim().releaseDropoffConfirm());
    this.phoneHit.on("pointerupoutside", () => getSim().releaseDropoffConfirm());
    this.phone = this.add
      .container(GAME_WIDTH - 160, GAME_HEIGHT - 220, [
        this.phoneBody,
        this.phoneChrome,
        this.phoneMapBase,
        this.phoneMap,
        this.phoneTitle,
        this.phoneStatus,
        this.phoneHit,
      ])
      .setDepth(22)
      .setVisible(false);
    this.paintPhoneChrome();

    this.toastText = addSignText(this, GAME_WIDTH / 2, GAME_HEIGHT - 36, "", {
      size: hudToastPx(),
      padding: scaleMsgPad({ x: 22, y: 13 }),
      align: "center",
      fontStyle: "600",
      ...MSG_TYPE_FIT,
      maxWidth: scaleMsgBox(900),
      maxHeight: scaleMsgBox(80),
    })
      .setOrigin(0.5, 1)
      .setDepth(20);

    // Out on the road the shop is off-screen, so the counter reports in under the score.
    this.coverText = addSignText(this, 0, 0, "", {
      size: scaleMsgPx(13),
      padding: scaleMsgPad({ x: 12, y: 6 }),
      fontStyle: "600",
      noWrap: true,
      ...MSG_TYPE_FIT,
      maxWidth: scaleMsgBox(560),
      maxHeight: scaleMsgBox(40),
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

    this.buildIdCard();

    this.flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0).setDepth(24);

    this.padRing = this.add.graphics().setDepth(19);
    this.drawPad();
    this.padKnob = this.add.circle(this.padCenter.x, this.padCenter.y, 40, Color.cream, 0.92).setDepth(20);
    this.padLabel = addSignText(this, this.padCenter.x, this.padCenter.y - 128, "Heading to stop…", {
      size: padLabelPx(),
      padding: scaleMsgPad({ x: 13, y: 8 }),
      fontStyle: "600",
      ...MSG_TYPE_FIT,
      maxWidth: scaleMsgBox(300),
      maxHeight: scaleMsgBox(50),
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
    // Edge-triggered confirms — key-repeat and held keys must not skip bag/photo after CHECK ID.
    const onConfirmDown = (event: KeyboardEvent): void => {
      if (event.repeat) return;
      getSim().pressDropoffConfirm();
    };
    const onConfirmUp = (): void => {
      getSim().releaseDropoffConfirm();
    };
    kb?.on("keydown-E", onConfirmDown);
    kb?.on("keydown-SPACE", onConfirmDown);
    kb?.on("keyup-E", onConfirmUp);
    kb?.on("keyup-SPACE", onConfirmUp);

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

  /**
   * The ID card, built to read like a government-issued one: header band, portrait of
   * the person actually standing at the door, labelled fields beside it rather than
   * four centred lines, an ID number, a signature strip, and a verdict band.
   */
  private buildIdCard(): void {
    const halfW = ID_CARD_W / 2;
    const halfH = ID_CARD_H / 2;
    const headerMid = -halfH + ID_HEADER_H / 2;
    const photoX = -halfW + ID_PAD + ID_PHOTO_W / 2;
    const photoTop = -halfH + ID_HEADER_H + ID_PAD;

    this.idFlashRing = this.add
      .rectangle(0, 0, ID_CARD_W + ID_RING_PAD, ID_CARD_H + ID_RING_PAD, 0x000000, 0)
      .setStrokeStyle(8, Color.lime, 1);
    // Fully opaque: at 0.97 the doorstep's own prompt chip ghosted through the card.
    this.idBg = this.add.rectangle(0, 0, ID_CARD_W, ID_CARD_H, ID_CARD_FILL, 1).setStrokeStyle(6, ID_OK_INK);
    enableItemHit(this.idBg);
    this.idBg.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().pressDropoffConfirm();
    });
    this.idBg.on("pointerup", () => getSim().releaseDropoffConfirm());
    this.idBg.on("pointerupoutside", () => getSim().releaseDropoffConfirm());
    // Bands, guilloche lines, photo frame and field rules: redrawn only when the
    // verdict colour changes, so a held card costs nothing per frame.
    this.idFurniture = this.add.graphics();
    this.idSignature = this.add.graphics();

    this.idTitle = addUiText(this, -halfW + ID_PAD, headerMid, "PROVINCE OF KINDLING", {
      size: ID_TITLE_PX,
      color: Color.creamHex,
      fontStyle: "700",
      letterSpacing: 2,
      strokeThickness: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: ID_CARD_W * 0.6,
      maxHeight: ID_HEADER_H - 12,
    }).setOrigin(0, 0.5);
    this.idKind = addUiText(this, halfW - ID_PAD, headerMid, "IDENTITY CARD  ·  CLASS G", {
      size: ID_KIND_PX,
      color: Color.creamHex,
      fontStyle: "600",
      letterSpacing: 1,
      strokeThickness: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: ID_CARD_W * 0.4,
      maxHeight: ID_HEADER_H - 16,
    }).setOrigin(1, 0.5);

    const photoTex = portraitImageKey("tex-face-0");
    this.idPhoto = this.add
      .image(photoX, photoTop + ID_PHOTO_H / 2, photoTex.key, photoTex.frame)
      .setDisplaySize(ID_PHOTO_W, ID_PHOTO_H);

    this.idName = addUiText(this, ID_FIELD_X, 0, "", {
      size: ID_NAME_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...HUD_TYPE_FIT,
      maxWidth: ID_FIELD_W,
      maxHeight: 46,
    }).setOrigin(0, 0.5);
    this.idDob = addUiText(this, ID_FIELD_X, 0, "", {
      size: ID_DOB_PX,
      color: "#3a2418",
      fontStyle: "600",
      strokeThickness: 0,
      ...HUD_TYPE_FIT,
      maxWidth: ID_FIELD_W,
      maxHeight: 34,
    }).setOrigin(0, 0.5);
    this.idNumber = addUiText(this, ID_FIELD_X, 0, "", {
      size: ID_DOB_PX,
      color: "#3a2418",
      fontStyle: "600",
      letterSpacing: 1,
      strokeThickness: 0,
      ...HUD_TYPE_FIT,
      maxWidth: ID_FIELD_W,
      maxHeight: 34,
    }).setOrigin(0, 0.5);
    // Cream on the verdict colour rather than colour on cream: the deny line used to
    // be small red text on a cream card, the faintest thing on the busiest screen.
    this.idHint = addUiText(this, 0, halfH - ID_PAD - 20, "Tap the card to confirm 19+", {
      size: ID_HINT_PX,
      color: Color.creamHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: ID_CARD_W - ID_PAD * 4,
      maxHeight: 40,
    }).setOrigin(0.5);

    this.idExpiry = addUiText(this, ID_FIELD_X, 0, "", {
      size: ID_DOB_PX,
      color: "#3a2418",
      fontStyle: "600",
      strokeThickness: 0,
      ...HUD_TYPE_FIT,
      maxWidth: ID_FIELD_W,
      maxHeight: 34,
    }).setOrigin(0, 0.5);

    const labels = ["NAME", "DATE OF BIRTH", "ID NO.", "EXPIRES"].map((text) =>
      addUiText(this, ID_FIELD_X, 0, text, {
        size: ID_LABEL_PX,
        color: "#8a7a58",
        fontStyle: "700",
        letterSpacing: 2,
        strokeThickness: 0,
        noWrap: true,
        ...HUD_TYPE_FIT,
        maxWidth: ID_FIELD_W,
        maxHeight: 22,
      }).setOrigin(0, 0.5),
    );
    const sigLabel = addUiText(this, photoX, 0, "SIGNATURE", {
      size: ID_SIG_PX,
      color: "#8a7a58",
      fontStyle: "700",
      letterSpacing: 2,
      strokeThickness: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: ID_PHOTO_W,
      maxHeight: 20,
    }).setOrigin(0.5, 0);

    // Field rows: label sits on the value's shoulder, so each pair reads as one field.
    const rowTop = photoTop + 6;
    const rowStep = 74;
    labels.forEach((label, i) => {
      const y = rowTop + i * rowStep;
      label.setPosition(ID_FIELD_X, y);
      const value = [this.idName, this.idDob, this.idNumber, this.idExpiry][i]!;
      value.setPosition(ID_FIELD_X, y + 30);
    });
    const sigTop = photoTop + ID_PHOTO_H + 14;
    sigLabel.setPosition(photoX, sigTop + 44);

    this.idPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      this.idFlashRing,
      this.idBg,
      this.idFurniture,
      this.idPhoto,
      this.idSignature,
      this.idTitle,
      this.idKind,
      ...labels,
      this.idName,
      this.idDob,
      this.idNumber,
      this.idExpiry,
      sigLabel,
      this.idHint,
    ]);
    this.idPanel.setDepth(25).setVisible(false);
  }

  /**
   * Card chrome for one verdict. Cheap, but only redrawn when the card or its verdict
   * changes — `idDrawnFor` is the guard.
   */
  private paintIdCard(card: { name: string; dob: string; ageOk: boolean; age: number }, idNo: string): void {
    const key = `${card.name}|${card.dob}|${card.ageOk}|${idNo}`;
    if (key === this.idDrawnFor) return;
    this.idDrawnFor = key;

    const halfW = ID_CARD_W / 2;
    const halfH = ID_CARD_H / 2;
    const ink = card.ageOk ? ID_OK_INK : ID_DENY_INK;
    const photoX = -halfW + ID_PAD;
    const photoTop = -halfH + ID_HEADER_H + ID_PAD;
    const sigTop = photoTop + ID_PHOTO_H + 14;
    const g = this.idFurniture;

    g.clear();
    g.fillStyle(ink, 1);
    g.fillRect(-halfW, -halfH, ID_CARD_W, ID_HEADER_H);
    // Security tint under the fields — the flat cream read as paper, not as a card.
    g.fillStyle(ink, 0.06);
    g.fillRect(ID_FIELD_X - 16, photoTop - 8, ID_FIELD_W + 32, ID_PHOTO_H + 16);
    g.lineStyle(1, ink, 0.16);
    for (let y = photoTop; y < halfH - ID_PAD - 52; y += 12) {
      g.lineBetween(ID_FIELD_X - 16, y, ID_FIELD_X + ID_FIELD_W + 16, y);
    }
    // Photo frame, drawn as a plate under the portrait so the pixels sit in a bezel.
    g.fillStyle(ink, 1);
    g.fillRect(
      photoX - ID_PHOTO_FRAME,
      photoTop - ID_PHOTO_FRAME,
      ID_PHOTO_W + ID_PHOTO_FRAME * 2,
      ID_PHOTO_H + ID_PHOTO_FRAME * 2,
    );
    // Signature strip: an off-white band the way a laminated one looks.
    g.fillStyle(0xfdf6e0, 1);
    g.fillRect(photoX, sigTop, ID_PHOTO_W, 42);
    g.lineStyle(1, ink, 0.35);
    g.strokeRect(photoX, sigTop, ID_PHOTO_W, 42);
    // Verdict band along the foot.
    g.fillStyle(ink, 1);
    g.fillRect(-halfW + ID_PAD, halfH - ID_PAD - 40, ID_CARD_W - ID_PAD * 2, 40);

    this.idSignature.clear();
    this.idSignature.lineStyle(2.5, 0x2a3550, 0.85);
    drawSignature(this.idSignature, card.name, photoX + 12, sigTop + 26, ID_PHOTO_W - 24);
  }

  update(_time: number, _delta: number): void {
    const sim = getSim();
    // Avoid a full snapshot before tick — input only needs the auto-drive bit.
    if (!sim.isAutoDriving()) {
      const { dx, dy } = this.readInput();
      sim.setPlayerInput(dx, dy);
    } else {
      sim.setPlayerInput(0, 0);
    }
    // Phaser's smoothed `delta` caps to ~16.7ms when !inFocus / post-blur cooldown —
    // on a low-FPS phone that puts the whole sim in slow motion. rawDelta is wall time.
    const raw = this.game.loop.rawDelta;
    sim.tick(Math.min(Math.max(0, raw), MAX_SIM_STEP_MS));
    const snap = sim.snapshot();
    this.syncRenderStress(snap);
    if (tickRenderBudget(this.game.loop.actualFps)) {
      applyRenderBudgetToGame(this.game);
      applyCanvasDisplayScale(this.game);
    }
    // Title / shift-ended only — calling every frame was a pointless hop (diag #11).
    if (snap.shiftEnded !== this.pwaIdleShiftEnded) {
      this.pwaIdleShiftEnded = snap.shiftEnded;
      setPwaIdle(snap.shiftEnded);
    }
    this.paintHud(snap);
  }

  private layoutHud(): void {
    const inset = designHudInset(readCssSafeArea(document.getElementById("game-root")));
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
    const panelTop = Math.max(inset.top, cogY - cogSize - 32 - this.settingsBox.h);
    this.settingsPanel.setPosition(cogX - SETTINGS_W, panelTop);

    // Keep the phone clear of the settings cog (bottom-right).
    const cogLeft = cogX - cogSize;
    const cogTop = cogY - cogSize;
    const phoneRight = Math.min(GAME_WIDTH - 16 - inset.right, cogLeft - PHONE_COG_GAP);
    const phoneBottom = Math.min(GAME_HEIGHT - 16 - inset.bottom, cogTop - PHONE_COG_GAP);
    // Placed by the chassis, not the sprite box: the sprite's outer cell is the
    // transparent button margin, and measuring the gap to the cog from that would
    // put a visible 14px more air there than PHONE_COG_GAP asks for.
    this.phone.setPosition(phoneRight - PHONE_CHASSIS.w * 0.5, phoneBottom - PHONE_CHASSIS.h * 0.5);
    // Toast stays clear of the cog column.
    this.toastText.setPosition(GAME_WIDTH / 2 - 40, bottom);
    this.padCenter = { x: 196 + inset.left, y: GAME_HEIGHT - 220 - inset.bottom };
    this.lastPadFlash = null;
    this.drawPad();
    this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    this.padLabel.setPosition(this.padCenter.x, this.padCenter.y - 128);
  }

  /**
   * In the shop the readouts flank the counter sign; out on the road there is no
   * sign to flank, so they fall back to the screen corners.
   */
  private placeReadouts(): void {
    // Size first, then measure: the caption's own width is part of the layout in corner
    // mode, so it has to be at its final step before anything is positioned off it.
    this.matchCaptionToValue();
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

  /**
   * SCORE is specified at the size of the number, which means the size the number
   * actually renders at — not the step both were authored with. A long enough score
   * shrinks inside its own box, and a caption left at the seed beside a shrunken value
   * is the same mismatch this replaced, only the other way round. The outline is scaled
   * with it for the same reason `readoutOutline` takes a px at all: a fixed thickness
   * reads as a different weight at a different step.
   */
  private matchCaptionToValue(): void {
    const px = parseFontPx(this.scoreText.style.fontSize);
    if (px === this.captionPx) return;
    this.captionPx = px;
    const outline = readoutOutline(px);
    this.scoreCaption.setStroke(outline.stroke, outline.strokeThickness);
    retypeSize(this.scoreCaption, px);
  }

  private paintHud(snap: SimSnapshot): void {
    const scoreLabel = String(snap.score);
    const scoreResized = scoreLabel !== this.scoreText.text;
    if (scoreResized) this.scoreText.setText(scoreLabel);
    if (snap.clockLabel !== this.lastClockLabel) {
      this.lastClockLabel = snap.clockLabel;
      this.clockText.setText(snap.clockLabel);
    }
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
    if (showPhone) {
      this.phone.setAlpha(1);
      this.phoneBody.setAlpha(drop.phase === "calling" ? 0.92 : 1);
      // The phone's tutorial cue is the status plaque's frame going lime, not a ring
      // around the chassis: the ring was removed, the cue was not.
      const cue = flashPhone && drop.phase !== "calling";
      const accentKey = cue ? "lime" : drop.phase === "calling" ? "leaf" : "none";
      if (phoneLine !== this.lastPhoneLine) {
        this.lastPhoneLine = phoneLine;
        this.phoneStatus.setText(phoneLine);
        this.phoneStatus.setPadding(10, 6, 10, 6);
        refitType(this.phoneStatus);
      }
      if (accentKey !== this.lastPhoneAccentKey) {
        this.lastPhoneAccentKey = accentKey;
        setSignAccent(this.phoneStatus, cue ? Color.lime : drop.phase === "calling" ? Color.leafBright : undefined);
      }
      this.paintPhoneMap(snap);
    } else {
      this.lastPhoneLine = "";
      this.lastPhoneAccentKey = "";
      this.lastPhoneMapKey = "";
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
      const card = drop.idCard;
      const idTextKey = `${card.name}|${card.dob}|${card.ageOk ? 1 : 0}|${card.idNumber}|${card.expires}`;
      if (idTextKey !== this.lastIdTextKey) {
        this.lastIdTextKey = idTextKey;
        this.idName.setText(card.name.toUpperCase());
        this.idDob.setText(`${card.dob}   ·   ${card.ageOk ? "19+" : "UNDER 19"}`);
        this.idNumber.setText(card.idNumber);
        this.idExpiry.setText(card.expires);
        this.idHint.setText(card.ageOk ? "Tap the card to confirm 19+" : "UNDER 19 — tap to deny and leave");
        this.idBg.setStrokeStyle(6, card.ageOk ? ID_OK_INK : ID_DENY_INK);
      }
      // The photo is the same pool index the doorstep sprite is drawn from.
      applyPortraitTexture(this.idPhoto, drop.customerLook ?? 0);
      this.idPhoto.setDisplaySize(ID_PHOTO_W, ID_PHOTO_H);
      this.paintIdCard(card, card.idNumber);
    } else {
      this.lastIdTextKey = "";
    }

    if (drop.photoTaken && !this.sawPhoto) {
      this.sawPhoto = true;
      playCameraClick(this.game);
      this.flash.setAlpha(0.85);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 220 });
    }
    if (!drop.photoTaken) this.sawPhoto = false;

    if ((snap.toast ?? "") !== this.lastToast) {
      this.lastToast = snap.toast ?? "";
      this.toastText.setText(snap.toast);
    }
    const driving = snap.playerRole === "driver" && !atDoor;
    // Drive prompts float over the van; ID/phone keep their own UI.
    const driveBanner = driving && !!snap.toast;
    // Shop / key-lead counter play: no bottom-centre toast chip (R1). Drive + doorstep keep theirs.
    const shopPlay = snap.playerRole === "keyLead";
    this.toastText.setVisible(
      !!snap.toast &&
        !shopPlay &&
        !showId &&
        snap.dropoff.phase !== "atDoor" &&
        !showPhone &&
        !driveBanner,
    );
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
      const padLine = snap.run?.nextStopId ? "Auto · nudge pad" : "Auto · nudge to shop";
      if (padLine !== this.lastPadLabel) {
        this.lastPadLabel = padLine;
        this.padLabel.setText(padLine);
      }
      const padFlash = !!flashNext && flashNext.kind === "gpsPin";
      if (padFlash !== this.lastPadFlash) {
        this.lastPadFlash = padFlash;
        this.drawPad(padFlash);
      }
      if (this.pointerId === null) this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    } else {
      this.lastPadLabel = "";
      this.lastPadFlash = null;
      if (this.pointerId !== null) this.pointerId = null;
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
    const line = `COUNTER  ·  ${cover.line}${tally ? `  ·  ${tally}` : ""}`;
    if (this.coverText.text !== line) {
      this.coverText.setText(line);
      refitType(this.coverText);
    }
    this.coverText.setPosition(this.readoutCorner.left, this.readoutCorner.top + 40);
  }

  /** Drive/Door PostFX is heavier than shop — demote earlier while those scenes are live. */
  private syncRenderStress(snap: SimSnapshot): void {
    if (snap.playerRole !== "driver") {
      setRenderStressContext("shop");
      return;
    }
    if (snap.dropoff.phase === "atDoor") {
      setRenderStressContext("door");
      return;
    }
    setRenderStressContext("drive");
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
    // create() runs input.setTopOnly(false), so one click is delivered to every
    // interactive object under it. Without the panel punched out of this hit area the
    // dim closes the panel on the same click that works a control, and the control's
    // p.event.stopPropagation() cannot help: Phaser's own dispatch is cancelled through
    // the fourth EventData callback argument, not the DOM event.
    this.settingsDim.setInteractive({
      useHandCursor: false,
      hitArea: new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT),
      hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number): boolean =>
        Phaser.Geom.Rectangle.Contains(area, x, y) && !this.overSettingsPanel(x, y),
    });
    this.armSettingsDim(false);
    this.settingsDim.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.closeSettings();
    });

    const box = settingsGeom();
    this.settingsBox = box;
    const panelX = GAME_WIDTH - 24 - SETTINGS_W;
    const panelY = GAME_HEIGHT - 24 - 168 - box.h;
    const bg = addPanel(this, 0, 0, SETTINGS_W, box.h, {
      radius: 4,
      fill: Color.card,
      stroke: Color.woodTrim,
      depth: 41,
    });
    const title = addUiText(this, SET_PAD, 16, "SETTINGS", {
      size: SET_TITLE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: SET_BTN_W,
      maxHeight: 38,
    });
    const musicLabel = addUiText(this, SET_PAD, box.rowTop, "Music", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 180,
      maxHeight: 30,
    });
    this.musicValue = addUiText(this, SETTINGS_W - SET_PAD, rowMidY(musicLabel), "", {
      size: SET_VALUE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 140,
      maxHeight: 32,
    }).setOrigin(1, 0.5);
    // Hit box is measured off the two texts that make up the row, so it cannot grow an
    // invisible margin when the type step changes. Width is the button column.
    const musicBand = rowBand(musicLabel, this.musicValue, box.rowH);
    const musicHit = this.add
      .rectangle(SETTINGS_W / 2, musicBand.mid, SET_BTN_W, musicBand.height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    musicHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      setMusicEnabled(!getMusicPrefs().enabled, this.game);
      this.refreshMusicControls();
    });

    const volumeLabel = addUiText(this, SET_PAD, box.volRowTop, "Volume", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 180,
      maxHeight: 30,
    });
    this.volumePct = addUiText(this, SETTINGS_W - SET_PAD, rowMidY(volumeLabel), "", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 100,
      maxHeight: 30,
    }).setOrigin(1, 0.5);
    this.volumeTrack = this.add
      .rectangle(VOL_TRACK_X, box.volTrackY, VOL_TRACK_W, VOL_TRACK_H, 0xd8c8b0)
      .setOrigin(0, 0.5);
    this.volumeFill = this.add.rectangle(VOL_TRACK_X, box.volTrackY, 8, VOL_TRACK_H, Color.leaf).setOrigin(0, 0.5);
    this.volumeKnob = this.add.circle(VOL_TRACK_X, box.volTrackY, VOL_KNOB_R, Color.woodTrim);
    // The knob overhangs both ends of the track by its radius, so that -- not the track
    // -- is the slider's visible extent, and the hit box is built from it. The pointer
    // to value mapping reads the track instead, so widening this cannot skew the value.
    this.volumeHit = this.add
      .rectangle(
        VOL_TRACK_X + VOL_TRACK_W / 2,
        box.volTrackY,
        VOL_TRACK_W + VOL_KNOB_R * 2,
        Math.max(VOL_KNOB_R * 2, box.rowH),
        0x000000,
        0.001,
      )
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

    const fullscreenLabel = addUiText(this, SET_PAD, box.fsRowTop, "Start fullscreen", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 220,
      maxHeight: 30,
    });
    this.fullscreenValue = addUiText(this, SETTINGS_W - SET_PAD, rowMidY(fullscreenLabel), "", {
      size: SET_VALUE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 140,
      maxHeight: 32,
    }).setOrigin(1, 0.5);
    const fullscreenBand = rowBand(fullscreenLabel, this.fullscreenValue, box.rowH);
    const fullscreenHit = this.add
      .rectangle(SETTINGS_W / 2, fullscreenBand.mid, SET_BTN_W, fullscreenBand.height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    fullscreenHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      const prefs = loadDisplayPrefs();
      saveDisplayPrefs({ startInFullscreen: !prefs.startInFullscreen });
      this.refreshFullscreenControl();
    });

    const installLabel = addUiText(this, SET_PAD, box.installRowTop, "Install for full screen", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 260,
      maxHeight: 30,
    });
    const installValue = addUiText(this, SETTINGS_W - SET_PAD, rowMidY(installLabel), "How", {
      size: SET_VALUE_PX,
      color: "#3d6a44",
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 100,
      maxHeight: 32,
    }).setOrigin(1, 0.5);
    const installBand = rowBand(installLabel, installValue, box.rowH);
    const installHit = this.add
      .rectangle(SETTINGS_W / 2, installBand.mid, SET_BTN_W, installBand.height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    installHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      openInstallCoachFromSettings();
    });

    // "END SHIFT" is nine characters, so it clears the narrower label box with room to
    // spare and takes the bump.
    const endShift = addHudButton(this, SET_PAD, box.endShiftY, END_SHIFT_LABEL, () => this.endShiftEarly(), {
      originX: 0,
      originY: 0,
      variant: "primary",
      minWidth: SET_BTN_W,
      minHeight: box.btnH,
      caption: END_SHIFT_CAPTION,
      labelSize: SET_BTN_LABEL_PX,
      captionSize: SET_BTN_CAP_PX,
      depth: 41,
    });
    this.endShiftBtn = endShift;

    // This label only reaches END SHIFT's step because the copy was cut to reach it.
    // "RESET DAY TO 9:00 AM" overran the narrower button's label box, so fitTypeToBox
    // pinned it at 18px no matter how high the seed went — a shorter string was the only
    // way to buy the size back. See resetDayToNine for why the caption changed.
    const reset = addHudButton(this, SET_PAD, box.resetY, "RESET TO 9 AM", () => this.resetDayToNine(), {
      originX: 0,
      originY: 0,
      variant: "amber",
      minWidth: SET_BTN_W,
      minHeight: box.btnH,
      caption: "Clears the floor · score to zero",
      labelSize: SET_BTN_LABEL_PX,
      captionSize: SET_BTN_CAP_PX,
      depth: 41,
    });
    const resetHint = addUiText(this, SET_PAD, box.hintY, "Clean slate — bags, tickets and runs go.", {
      size: SET_HINT_PX,
      color: Color.muteHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: SET_BTN_W,
      maxHeight: SET_HINT_H,
    });

    this.settingsPanel = this.add.container(panelX, panelY, [
      bg,
      title,
      musicLabel,
      this.musicValue,
      musicHit,
      volumeLabel,
      this.volumePct,
      this.volumeTrack,
      this.volumeFill,
      this.volumeKnob,
      this.volumeHit,
      fullscreenLabel,
      this.fullscreenValue,
      fullscreenHit,
      installLabel,
      installValue,
      installHit,
      endShift,
      reset,
      resetHint,
    ]);
    this.settingsPanel.setDepth(41).setVisible(false);
    // The dim's punch-out is read off this size, so it has to be set and non-zero: a
    // Container defaults to 0x0, which would silently shrink the punch-out to nothing
    // and put us back to the dim closing the panel on the click that worked a control.
    this.settingsPanel.setSize(SETTINGS_W, box.h);
    if (this.settingsPanel.width <= 0 || this.settingsPanel.height <= 0) {
      throw new Error("settings panel needs a non-zero size for the dim punch-out to track it");
    }

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
    // Centred on the cog: the cog's origin is (1, 1) at cogX, so its middle is half a cog
    // to the left. layoutHud repositions it from the same expression — the two must agree,
    // or the caption drifts off the control it labels on the first resize.
    this.cogCaption = addSignText(this, cogX - cogSize / 2, cogY - cogSize - 8, "Settings", {
      size: scaleChromePx(HUD_COG_CAPTION_PX),
      padding: HUD_COG_CAPTION_PAD,
      fontStyle: "600",
      align: "center",
      ...HUD_TYPE_FIT,
      maxWidth: HUD_COG_CAPTION_BOX.w,
      maxHeight: HUD_COG_CAPTION_BOX.h,
    })
      .setOrigin(0.5, 1)
      .setDepth(42);
    enableItemHit(this.cogCaption);
    this.cogCaption.on("pointerdown", toggleSettings);
    this.refreshMusicControls();
    this.refreshFullscreenControl();
  }

  private armSettingsDim(on: boolean): void {
    // Only `enabled` may be toggled here: setInteractive/disableInteractive would
    // discard the custom hit area that keeps panel clicks off the dim.
    const input = this.settingsDim.input;
    if (!input) throw new Error("settings dim must be made interactive before arming");
    input.enabled = on;
  }

  /**
   * Design-space panel rect — the dim spans the screen, so its local coords are design
   * coords. Read off the panel container rather than the layout constants, so resizing
   * the panel moves the punch-out with it instead of leaving a stale hole.
   */
  private overSettingsPanel(x: number, y: number): boolean {
    const { x: px, y: py, width, height } = this.settingsPanel;
    return x >= px && x <= px + width && y >= py && y <= py + height;
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.settingsDim.setVisible(true);
    this.armSettingsDim(true);
    this.settingsPanel.setVisible(true);
    this.setCogCaptionShown(false);
    this.refreshMusicControls();
    this.refreshFullscreenControl();
    this.refreshEndShiftButton();
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.settingsDim.setVisible(false);
    this.armSettingsDim(false);
    this.settingsPanel.setVisible(false);
    this.setCogCaptionShown(true);
  }

  /**
   * The caption sits 8px above a cog that is itself 20px off the bottom edge, so the
   * panel — anchored to the same corner and 486px tall — closes over the caption's top
   * 16px. The chip is the higher depth, so it wins that overlap and clips the panel's
   * bottom corner. It labels nothing while the panel is up (the panel says SETTINGS
   * across its own head), so it stands down instead.
   *
   * Visibility is the whole mechanism, deliberately: Phaser will not hit-test an object
   * it would not render, so this also stops the caption closing the panel from underneath
   * it. The cog is the control that closes the panel, and it is never covered.
   */
  private setCogCaptionShown(shown: boolean): void {
    this.cogCaption.setVisible(shown);
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
    this.volumeFill.width = Math.max(8, VOL_TRACK_W * t);
    this.volumeKnob.setPosition(VOL_TRACK_X + VOL_TRACK_W * t, this.settingsBox.volTrackY);
    this.volumePct.setText(`${Math.round(t * 100)}%`);
  }

  private refreshFullscreenControl(): void {
    const on = loadDisplayPrefs().startInFullscreen;
    this.fullscreenValue.setText(on ? "ON" : "OFF");
    this.fullscreenValue.setColor(on ? "#3d6a44" : Color.muteHex);
  }

  private setVolumeFromPointer(p: Phaser.Input.Pointer): void {
    // Map against the track, which is what the fill and knob are drawn from. Reading the
    // hit box here instead would skew every value the moment the hit box stopped being
    // exactly the track's width.
    const bounds = this.volumeTrack.getBounds();
    const t = Phaser.Math.Clamp((p.x - bounds.left) / Math.max(1, bounds.width), 0, 1);
    setMusicVolume(t, this.game);
    this.refreshMusicControls();
  }

  /**
   * `resetToMorning` is a genuine cold start — it delegates to `startNewDay`, so the
   * floor, the tablet queue, packed bags and any run in flight all go. The button's
   * caption and hint used to promise a clock rewind that kept your bags, which was true
   * of an older implementation and survived it; both now describe a full reset.
   */
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
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 64,
      maxHeight: 48,
    }).setOrigin(0.5, 0);
    this.resultsClock = addUiText(this, RESULTS_W / 2, 78, "", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "600",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 64,
      maxHeight: 28,
    }).setOrigin(0.5, 0);
    this.resultsScore = addUiText(this, RESULTS_W / 2, 118, "", {
      size: Type.display,
      color: Color.inkHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 64,
      maxHeight: 52,
    }).setOrigin(0.5, 0);
    const scoreCap = addUiText(this, RESULTS_W / 2, 176, "SHIFT SCORE", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
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
      ...MENU_TYPE_FIT,
      maxWidth: RESULTS_W - 80,
      maxHeight: 168,
    }).setOrigin(0.5, 0);
    this.resultsVerdict = addUiText(this, RESULTS_W / 2, 408, "", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
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

  private warmScorePopPool(): void {
    for (let i = 0; i < SCORE_POP_POOL; i++) {
      const label = addSignText(this, 0, 0, "", {
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
      this.scorePopLayer.add(label);
    }
  }

  private acquireScorePop(delta: number): Phaser.GameObjects.Text {
    let label = this.scorePopFree.pop();
    if (!label) {
      // All slots animating — recycle the oldest rather than grow PRE_RENDER listeners.
      label = this.scorePopPool[0]!;
      this.tweens.killTweensOf(label);
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

  private releaseScorePop(label: Phaser.GameObjects.Text): void {
    this.tweens.killTweensOf(label);
    label.setVisible(false).setAlpha(0).setText("");
    if (!this.scorePopFree.includes(label)) this.scorePopFree.push(label);
  }

  private spawnScorePop(delta: number): void {
    const label = this.acquireScorePop(delta);
    // Pop rises outboard of the score so it never crosses the sign or the caption.
    this.placeReadouts();
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
      onComplete: () => this.releaseScorePop(label),
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

  /** App chrome behind the title and status bars. Fixed, so painted once. */
  private paintPhoneChrome(): void {
    const g = this.phoneChrome;
    g.clear();
    g.fillStyle(0x0c1014, 1);
    g.fillRect(PHONE_APP.x, PHONE_APP.y, PHONE_APP.w, PHONE_HEADER_H);
    g.fillRect(PHONE_APP.x, PHONE_APP.y + PHONE_APP.h - PHONE_STATUS_H, PHONE_APP.w, PHONE_STATUS_H);
    g.fillStyle(0x0a0d10, 1);
    g.fillRect(PHONE_APP.x, PHONE_APP.y + PHONE_HEADER_H, PHONE_APP.w, PHONE_APP.h - PHONE_HEADER_H - PHONE_STATUS_H);
    g.lineStyle(1, 0x2e3a44, 1);
    g.strokeRect(PHONE_MAP.x - 1, PHONE_MAP.y - 1, PHONE_MAP.w + 2, PHONE_MAP.h + 2);
  }

  /**
   * The whole neighbourhood, baked once. The city is deterministic, so the streets,
   * blocks, all fourteen lots, their driveways and the shop never change — the old
   * map re-issued 1120 fills a frame to redraw exactly this.
   */
  private bakePhoneMap(): void {
    const geo = cityMinimapGeometry();
    // Panel-local coordinates: the render texture is its own little canvas.
    const p = minimapProjection({ x: 0, y: 0, w: PHONE_MAP.w, h: PHONE_MAP.h });
    const g = this.make.graphics({ x: 0, y: 0 }, false);
    const fill = (rects: readonly WorldRect[], color: number, alpha = 1): void => {
      g.fillStyle(color, alpha);
      for (const r of rects) {
        const box = p.rect(r);
        g.fillRect(box.x, box.y, box.w, box.h);
      }
    };

    g.fillStyle(MAP_INK.outside, 1);
    g.fillRect(0, 0, PHONE_MAP.w, PHONE_MAP.h);
    fill(geo.blocks, MAP_INK.block);
    // Whole bands, not per-tile squares: that is what removes the seams.
    fill([...geo.streetsEW, ...geo.streetsNS], MAP_INK.street);
    fill(
      geo.stalls.map((s) => s.rect),
      MAP_INK.drive,
    );
    fill(geo.shopStalls, MAP_INK.drive);
    fill(
      geo.houses.map((h) => h.rect),
      MAP_INK.house,
    );
    fill([geo.shop], Color.lime);

    this.phoneMapBase.clear();
    this.phoneMapBase.draw(g, 0, 0);
    g.destroy();
  }

  /** The moving part: route, destination lot, and the van with its heading. */
  private paintPhoneMap(snap: SimSnapshot): void {
    const stopId = snap.run?.nextStopId ?? snap.dropoff.houseId ?? "";
    // Quantize van so the overlay redraws on meaningful motion, not every frame.
    const mapKey = `${stopId}:${Math.round(snap.vehicle.x / 8)}:${Math.round(snap.vehicle.y / 8)}:${Math.round(snap.vehicle.heading * 8)}:${snap.dropoff.phase}`;
    if (mapKey === this.lastPhoneMapKey) return;
    this.lastPhoneMapKey = mapKey;
    const g = this.phoneMap;
    g.clear();
    const p = minimapProjection(PHONE_MAP);
    const dot = Math.max(2, Math.round(PHONE_MAP.h * 0.03));

    const route = getSim().routeWorldPath();
    if (route.length > 1) {
      g.lineStyle(Math.max(1.5, PHONE_MAP.h * 0.014), Color.cream, 0.45);
      g.beginPath();
      const start = p.toMap(route[0]!.x, route[0]!.y);
      g.moveTo(start.x, start.y);
      for (let i = 1; i < route.length; i++) {
        const step = p.toMap(route[i]!.x, route[i]!.y);
        g.lineTo(step.x, step.y);
      }
      g.strokePath();
    }

    // Destination lot, tinted apart from the other thirteen. The old map pinned the
    // parking stall, which is not the building the player is looking for.
    const house = stopId ? houseById(stopId) : null;
    if (house) {
      const box = p.rect(lotWorldRect(house.house, house.lotW, house.lotH));
      g.fillStyle(Color.amber, 1);
      g.fillRect(box.x, box.y, box.w, box.h);
      g.lineStyle(2, Color.cream, 0.9);
      g.strokeRect(box.x - 1, box.y - 1, box.w + 2, box.h + 2);
    }

    const van = p.toMap(snap.vehicle.x, snap.vehicle.y);
    // Heading tick: which way the van is pointing, in the same radians the sim steers by.
    const tick = dot * 2.4;
    g.lineStyle(Math.max(2, dot * 0.7), 0xffffff, 0.95);
    g.lineBetween(
      van.x,
      van.y,
      van.x + Math.cos(snap.vehicle.heading) * tick,
      van.y + Math.sin(snap.vehicle.heading) * tick,
    );
    g.fillStyle(0xffffff, 1);
    g.fillCircle(van.x, van.y, dot);
    g.fillStyle(Color.neon, 1);
    g.fillCircle(van.x, van.y, dot * 0.6);
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

/**
 * A signature that is the same every time for the same name, without needing a
 * handwriting font: a stroke whose bumps are driven by the name's own characters.
 */
function drawSignature(g: Phaser.GameObjects.Graphics, name: string, x: number, y: number, w: number): void {
  const steps = 40;
  const seed = name.length || 1;
  g.beginPath();
  g.moveTo(x, y + 6);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const code = name.charCodeAt(i % Math.max(1, name.length)) || 65;
    // Tapered envelope: a signature starts big on the capital and trails off, which a
    // constant-amplitude wave does not — that reads as a heart monitor.
    const envelope = Math.sin(Math.pow(t, 0.55) * Math.PI) * (1 - t * 0.45);
    const wave = Math.sin(t * Math.PI * 4.6 + code * 0.19) * 11 * envelope;
    const drift = Math.sin(t * Math.PI * 9 + seed * 0.9) * 2.6 * envelope;
    g.lineTo(x + w * t, y + 6 - 10 * envelope + wave + drift);
  }
  g.strokePath();
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
