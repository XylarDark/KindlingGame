import Phaser from "phaser";
import { applyCrewTexture, applyPersonTexture } from "../art/peopleAtlas";
import { doorGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, shouldApplyGrade, type DayNightPipeline } from "../art/dayNightPipeline";
import { getRenderBudget, syncSceneRenderCamera } from "../ui/renderBudget";
import {
  paintDoorstepNightFx,
  paintDoorstepSky,
  paintDoorstepStatic,
  DOORSTEP_DOOR_X,
  DOORSTEP_FLOOR_Y,
  DOORSTEP_PORCH,
} from "../art/doorstep";
import { itemHitSize } from "../input/hitRect";
import { BAG_SCALE, PEOPLE_SCALE, PERSON_DISPLAY_H } from "../maps/shopT0";
import { getSim } from "../session";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { skyAt, skyVisualDirtyKey } from "../sim/dayNight";
import type { SimSnapshot } from "../sim/gameSim";
import { addSignText, setSignCopy, setSignPosition } from "../ui/signText";
import { Color, MSG_TYPE_FIT, scaleMsgBox, scaleMsgPx } from "../ui/theme";
import { designHudInset, HUD_TOUCH_MIN_DESIGN, readCssSafeArea, VIEWFIT_EVENT } from "../ui/viewFit";

/** 25% larger than shop bags (BAG_SCALE 0.7). */
const DOOR_BAG_SCALE = BAG_SCALE * 1.25;
const DRIVER_X = DOORSTEP_DOOR_X - 160;
const CUSTOMER_X = DOORSTEP_DOOR_X + 200;
const PERSON_HIT_PAD = 80; // ~10% over prior 72 for mobile taps
const BAG_HIT_PAD = 88; // ~10% over prior 80 for mobile taps

/**
 * Doorstep message chips: prompt 25px then the shared {@link scaleMsgPx} bump. Lazy so
 * create() sees the shell contain scale. `maxHeight` must move with the seed — clamp-fit
 * will otherwise drop below it.
 */
const doorPromptPx = (): string => scaleMsgPx(25);
/** Gap between a sprite's edge and the chip anchored off it. */
const DOOR_CHIP_GAP = 36;
/** Keep a wide chip on screen when the sprite it hangs off is near an edge. */
const DOOR_CHIP_MARGIN = 24;

/**
 * Flash cadence for the next tap target, as `Math.sin(gameMs / DOOR_FLASH_RATE)` — a
 * 2*PI*180 ~= 1131ms cycle. `gameMs` advances 1:1 with real milliseconds (`GameSim.tick`
 * feeds Phaser's frame delta straight into `GameClock`), so this is a legible ~1.1s
 * throb and not a strobe. Game time rather than wall time is deliberate: the flash then
 * freezes with the sim when the game pauses instead of animating a frozen scene.
 */
const DOOR_FLASH_RATE = 180;
/** Swell at the peak of the flash. Motion reads as "tap me" far better than colour alone. */
const DOOR_FLASH_SWELL = 0.12;
/**
 * Trough brightness as a fraction of `Color.flash`, so the flash swings in *luminance*.
 *
 * Hue alone cannot carry this target. `Color.flash` is a near-white lime, and a Phaser
 * tint multiplies, so laying it over the bag — which is already green — only nudges the
 * saturation: sampling the framebuffer over the bag at both extremes of a white-to-flash
 * blend moved the average by about five values per channel, which is invisible. Dimming
 * to a fraction of the same colour keeps the lime identity at the peak while giving the
 * eye the one thing it reliably notices at this sprite size.
 */
const DOOR_FLASH_DIM = 0.45;

export class DoorScene extends Phaser.Scene {
  private skyLayer!: Phaser.GameObjects.Graphics;
  private nightFx!: Phaser.GameObjects.Graphics;
  /** Baked yard + facade per house — static draw split (Drive/Shop-style). */
  private facadeBake?: Phaser.GameObjects.RenderTexture;
  private driver!: Phaser.GameObjects.Image;
  private customer!: Phaser.GameObjects.Image;
  private bag!: Phaser.GameObjects.Image;
  private prompt!: Phaser.GameObjects.Text;
  private floorY = 0;
  /** Cached so the per-frame chip placement does not re-read CSS safe areas. */
  private insetTop = 0;
  private lastHouse = "";
  private lastSkyKey = "";
  private lastBagHanded: boolean | null = null;
  private lastPrompt = "";
  private lighting?: DayNightPipeline;
  private lastGradeKey = "";
  private lastGradeMs = -1e9;
  private onPreRenderDayNight = (): void => this.paintDoorDayNight(getSim().snapshot());

  constructor() {
    super("door");
  }

  create(): void {
    this.input.setTopOnly(true);
    this.cameras.main.disableCull = false;
    syncSceneRenderCamera(this);
    this.lighting = attachDayNight(this.cameras.main);
    this.skyLayer = this.add.graphics().setDepth(0);
    this.facadeBake = this.bakeDoorFacade(0);
    this.nightFx = this.add.graphics().setDepth(1);
    const startSky = skyAt(0);
    paintDoorstepSky(this.skyLayer, startSky);
    paintDoorstepNightFx(this.nightFx, 0, startSky);

    this.floorY = DOORSTEP_FLOOR_Y + 8;
    this.driver = this.add.image(DRIVER_X, this.floorY, "tex-driver").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);
    applyCrewTexture(this.driver, "tex-driver");
    this.customer = this.add
      .image(CUSTOMER_X, this.floorY, "tex-customer-0")
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5);
    this.bag = this.add
      .image(bagDriverPos(this.floorY).x, bagDriverPos(this.floorY).y, "tex-bag")
      .setOrigin(0.5, 0.22)
      .setScale(DOOR_BAG_SCALE)
      .setDepth(6);
    enableWideHit(this.customer, PERSON_HIT_PAD);
    enableWideHit(this.bag, BAG_HIT_PAD);
    const onDoorConfirmDown = (p: Phaser.Input.Pointer): void => {
      p.event.stopPropagation();
      getSim().pressDropoffConfirm();
    };
    const onDoorConfirmUp = (): void => {
      getSim().releaseDropoffConfirm();
    };
    this.customer.on("pointerdown", onDoorConfirmDown);
    this.customer.on("pointerup", onDoorConfirmUp);
    this.customer.on("pointerupoutside", onDoorConfirmUp);
    this.bag.on("pointerdown", onDoorConfirmDown);
    this.bag.on("pointerup", onDoorConfirmUp);
    this.bag.on("pointerupoutside", onDoorConfirmUp);

    // Anchored over the customer's head rather than parked at a fixed y — the
    // instruction names them, so it should be pointing at them.
    this.prompt = addSignText(this, CUSTOMER_X, 0, "", {
      size: doorPromptPx(),
      align: "center",
      fontStyle: "600",
      ...MSG_TYPE_FIT,
      maxWidth: scaleMsgBox(720),
      // Prior box was 113 for the 25px seed; grow with MSG_SCALE so fitTypeToBox
      // cannot silently shrink the larger seed back down.
      maxHeight: scaleMsgBox(113),
    })
      .setOrigin(0.5, 1)
      .setDepth(8);

    this.paintDoorDayNight(getSim().snapshot());
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight);
    });
    this.layoutDoorHud();
    const relayout = (): void => this.layoutDoorHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
    this.game.events.on(VIEWFIT_EVENT, relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(VIEWFIT_EVENT, relayout));
  }

  private layoutDoorHud(): void {
    const inset = designHudInset(readCssSafeArea(document.getElementById("game-root")));
    this.insetTop = inset.top;
    this.placePrompt();
  }

  /**
   * Prompt bottom edge sits a gap above the customer's head, derived from the sprite's
   * own `displayHeight` so it tracks any change to PEOPLE_SCALE, and floored so a chip
   * that wraps to two lines cannot climb into the top safe inset. Cheap enough to run
   * every frame — the sentence changes width as the action changes.
   */
  private placePrompt(): void {
    const headTop = this.customer.y - this.customer.displayHeight * this.customer.originY;
    const half = this.prompt.displayWidth / 2 + DOOR_CHIP_MARGIN;
    let x = Phaser.Math.Clamp(this.customer.x, half, GAME_WIDTH - half);
    if (this.bag.visible && this.bag.input?.enabled) {
      const bagHalf = this.bag.displayWidth * 0.5 + DOOR_CHIP_MARGIN;
      const bagLeft = this.bag.x - bagHalf;
      const bagRight = this.bag.x + bagHalf;
      if (x + half > bagLeft && x - half < bagRight) {
        x = this.customer.x <= this.bag.x ? bagLeft - half - 8 : bagRight + half + 8;
        x = Phaser.Math.Clamp(x, half, GAME_WIDTH - half);
      }
    }
    const floor = this.insetTop + this.prompt.displayHeight + DOOR_CHIP_GAP;
    setSignPosition(this.prompt, x, Math.max(floor, headTop - DOOR_CHIP_GAP));
  }

  update(): void {
    this.sync(getSim().snapshot());
  }

  private sync(snap: SimSnapshot): void {
    const drop = snap.dropoff;
    // Same field the ID-card photo reads, so the two cannot show different people.
    applyPersonTexture(this.customer, drop.customerLook ?? 0);
    const houseKey = drop.houseId ?? "house-1";
    const sky = skyAt(snap.gameMs);
    const skyKey = skyVisualDirtyKey(sky);
    const houseIndex = (Number(houseKey.replace("house-", "")) || 1) - 1;
    if (houseKey !== this.lastHouse) {
      this.lastHouse = houseKey;
      this.lastBagHanded = null;
      this.facadeBake?.destroy();
      this.facadeBake = this.bakeDoorFacade(houseIndex);
      this.lastSkyKey = "";
    }
    if (skyKey !== this.lastSkyKey) {
      this.lastSkyKey = skyKey;
      this.skyLayer.clear();
      paintDoorstepSky(this.skyLayer, sky);
      this.nightFx.clear();
      paintDoorstepNightFx(this.nightFx, houseIndex, sky);
    }
    const flash = doorFlashPhase(snap.gameMs);
    const pulse = 0.7 + 0.3 * flash;
    const nextPhoto = drop.actionLabel === "PHOTO";
    const nextId = drop.actionLabel === "CHECK ID";
    const nextHand = drop.actionLabel === "HAND BAG";
    const nextAsk = drop.actionLabel === "ASK ID";
    const idModal = nextId;

    const bagInHands = drop.bagHanded;
    if (this.lastBagHanded !== bagInHands) {
      this.lastBagHanded = bagInHands;
      const target = bagInHands ? bagCustomerPos(this.floorY) : bagDriverPos(this.floorY);
      this.tweens.killTweensOf(this.bag);
      this.tweens.add({
        targets: this.bag,
        x: target.x,
        y: target.y,
        duration: bagInHands ? 280 : 0,
        ease: "Sine.easeOut",
      });
      if (!bagInHands) this.bag.setPosition(target.x, target.y);
    }

    this.bag.setVisible(true);
    this.bag.setDepth(nextHand || nextPhoto ? 12 : 6);
    if (nextHand || nextPhoto) {
      // Alpha stays at 1. Dipping it to 0.7 made the bag semi-transparent against a busy
      // door, which reads as unfinished art rather than as a call to action; the colour
      // and the size carry the effect instead.
      this.bag.setAlpha(1);
      this.bag.setTint(doorFlashTint(flash));
      this.bag.setScale(DOOR_BAG_SCALE * (1 + DOOR_FLASH_SWELL * flash));
    } else {
      this.bag.setAlpha(1);
      this.bag.clearTint();
      this.bag.setScale(DOOR_BAG_SCALE);
    }

    if (nextAsk) {
      this.customer.setAlpha(pulse);
      this.customer.setTint(Color.flash);
    } else {
      this.customer.setAlpha(1);
      this.customer.clearTint();
    }
    this.customer.setDepth(nextAsk ? 11 : 5);

    const canAsk = !idModal && nextAsk && drop.interactArmed;
    const canBag = !idModal && (nextHand || nextPhoto) && drop.interactArmed;
    armHit(this.customer, canAsk, PERSON_HIT_PAD);
    armHit(this.bag, canBag, BAG_HIT_PAD);
    if (canBag && !this.bag.input) enableWideHit(this.bag, BAG_HIT_PAD);

    const who = drop.customerName ?? "the customer";
    const promptLine = nextAsk
      ? `Tap ${who} to ask for ID.`
      : nextHand
        ? `Tap the bag to hand it to ${who}.`
        : nextPhoto
          ? `Tap the bag in their hands to take the photo.`
          : drop.hint || "They're at the door.";
    // setText refits typekit — only pay when the instruction changes.
    if (promptLine !== this.lastPrompt) {
      this.lastPrompt = promptLine;
      setSignCopy(this.prompt, promptLine);
    }
    this.prompt.setAlpha(1);
    this.placePrompt();
  }

  private bakeDoorFacade(houseIndex: number): Phaser.GameObjects.RenderTexture {
    const scratch = this.add.graphics().setVisible(false);
    paintDoorstepStatic(scratch, houseIndex);
    const rt = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setDepth(0.5);
    rt.beginDraw();
    rt.batchDraw(scratch);
    rt.endDraw();
    scratch.destroy();
    return rt;
  }

  private paintDoorDayNight(snap: SimSnapshot): void {
    if (!this.sys.isActive()) return;
    if (!getRenderBudget().postFx) return;
    const sky = skyAt(snap.gameMs);
    const gradeKey = `${sky.mapOverlay}:${sky.mapOverlayAlpha.toFixed(3)}:${sky.lampAlpha.toFixed(2)}:${sky.windowGlow.toFixed(2)}`;
    const now = performance.now();
    if (
      !shouldApplyGrade({
        nowMs: now,
        lastMs: this.lastGradeMs,
        dirty: gradeKey !== this.lastGradeKey,
      })
    ) {
      return;
    }
    this.lastGradeKey = gradeKey;
    this.lastGradeMs = now;
    const view = this.cameras.main.worldView;
    const pipe = this.lighting ?? dayNightFrom(this.cameras.main);
    this.lighting = pipe;
    applyDayNight(pipe, doorGrade(sky, DOORSTEP_PORCH), {
      x: view.x,
      y: view.y,
      width: view.width || this.scale.width,
      height: view.height || this.scale.height,
    });
  }
}

/**
 * 0 at the trough of the flash, 1 at its peak.
 * See {@link DOOR_FLASH_RATE} for why this is driven from game time.
 */
function doorFlashPhase(gameMs: number): number {
  return 0.5 + 0.5 * Math.sin(gameMs / DOOR_FLASH_RATE);
}

/**
 * Swing `Color.flash` between {@link DOOR_FLASH_DIM} and full brightness. The colour has
 * to *move*: the previous effect held `Color.flash` constant while the target was live,
 * so the bag read as a green bag rather than as a flashing one. Full strength lands
 * exactly on the shared token at the peak, so the "next tap target" colour is unchanged.
 */
function doorFlashTint(phase: number): number {
  const level = DOOR_FLASH_DIM + (1 - DOOR_FLASH_DIM) * phase;
  const channel = (shift: number): number => Math.round(((Color.flash >> shift) & 0xff) * level) << shift;
  return (channel(16) | channel(8) | channel(0)) >>> 0;
}

function bagDriverPos(floorY: number): { x: number; y: number } {
  return { x: DRIVER_X + 52, y: floorY - PERSON_DISPLAY_H * 0.46 };
}

function bagCustomerPos(floorY: number): { x: number; y: number } {
  return { x: CUSTOMER_X - 44, y: floorY - PERSON_DISPLAY_H * 0.42 };
}

function enableWideHit(obj: Phaser.GameObjects.Image, pad: number): void {
  const { width, height } = itemHitSize(obj);
  const need = Math.max(pad, Math.ceil(Math.max(0, HUD_TOUCH_MIN_DESIGN - Math.min(width, height)) / 2));
  obj.setInteractive({
    useHandCursor: true,
    hitArea: new Phaser.Geom.Rectangle(-need, -need, width + need * 2, height + need * 2),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
  });
}

/** Toggle hit without tearing down listeners every frame (bag/photo after ID). */
function armHit(obj: Phaser.GameObjects.Image, on: boolean, pad: number): void {
  if (on) {
    if (!obj.input) enableWideHit(obj, pad);
    else {
      obj.input.enabled = true;
      const { width, height } = itemHitSize(obj);
      const need = Math.max(pad, Math.ceil(Math.max(0, HUD_TOUCH_MIN_DESIGN - Math.min(width, height)) / 2));
      obj.input.hitArea = new Phaser.Geom.Rectangle(-need, -need, width + need * 2, height + need * 2);
    }
  } else if (obj.input) {
    obj.input.enabled = false;
  }
}
