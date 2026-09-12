import Phaser from "phaser";
import { applyCrewTexture, applyPersonTexture } from "../art/peopleAtlas";
import { doorGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, shouldApplyGrade, type DayNightPipeline } from "../art/dayNightPipeline";
import { getRenderBudget, syncSceneRenderCamera } from "../ui/renderBudget";
import { wireSceneDayNightLifecycle } from "../ui/sceneDayNightLifecycle";
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
import { layoutDebugEnabled, paintLayoutDebug, type LayoutDebugLayer } from "../ui/layoutDebug";
import { aboveHeadBand, plaqueAabbFromCenter } from "../ui/plaquePlacement";
import { speechPlaqueAboveHead, standingPersonHeadTop } from "../ui/plaquePlacementPhaser";
import {
  addSignText,
  setSignCopy,
  setSignPlaqueCenter,
  signPlaqueCenterWorld,
  signPlaqueExtents,
  syncSignPlaque,
} from "../ui/signText";
import { Color } from "../ui/theme";
import { typeRoleBox, typeRolePx } from "../ui/typeScale";
import { designHudInset, HUD_TOUCH_MIN_DESIGN, readCssSafeArea, VIEWFIT_EVENT } from "../ui/viewFit";

/** 25% larger than shop bags (BAG_SCALE 0.7). */
const DOOR_BAG_SCALE = BAG_SCALE * 1.25;
const DRIVER_X = DOORSTEP_DOOR_X - 160;
const CUSTOMER_X = DOORSTEP_DOOR_X + 200;
const PERSON_HIT_PAD = 80; // ~10% over prior 72 for mobile taps
const BAG_HIT_PAD = 88; // ~10% over prior 80 for mobile taps

/** Gap between a sprite's edge and the chip anchored off it. */
const DOOR_CHIP_GAP = 36;
/** Keep a wide chip on screen when the sprite it hangs off is near an edge. */
const DOOR_CHIP_MARGIN = 24;
/** Prompt chip width — one-line “Tap … for ID” above the customer head. */
const DOOR_PROMPT_MAX_W = 680;
/** Two wrapped lines at the door prompt seed (hudTitle) with default pad. */
const DOOR_PROMPT_MAX_H = 120;
/** Clearance between customer head top and prompt plaque bottom. */
const DOOR_HEAD_GAP = 88;
/** Renders above flashing customer (11) and bag (12) during ask/hand steps. */
const DOOR_PROMPT_DEPTH = 14;

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
  private layoutDebugGfx?: Phaser.GameObjects.Graphics;
  private lighting?: DayNightPipeline;
  private lastGradeKey = "";
  private lastGradeMs = -1e9;
  private onPreRenderDayNight = (): void => {
    if (!this.sys.isActive() || this.sys.isSleeping()) return;
    this.paintDoorDayNight(getSim().snapshot());
  };

  constructor() {
    super("door");
  }

  create(): void {
    this.input.setTopOnly(true);
    this.cameras.main.disableCull = false;
    syncSceneRenderCamera(this);
    this.lighting = attachDayNight(this.cameras.main);
    wireSceneDayNightLifecycle(this, this.cameras.main);
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
    const onConfirmUp = (): void => {
      getSim().releaseDropoffConfirm();
    };
    this.customer.on("pointerdown", onDoorConfirmDown);
    this.customer.on("pointerup", onConfirmUp);
    this.customer.on("pointerupoutside", onConfirmUp);
    this.bag.on("pointerdown", onDoorConfirmDown);
    this.bag.on("pointerup", onConfirmUp);
    this.bag.on("pointerupoutside", onConfirmUp);

    this.prompt = addSignText(this, GAME_WIDTH / 2, 0, "", {
      size: typeRolePx("hudTitle"),
      typeRole: "hudTitle",
      padVariant: "default",
      align: "center",
      fontStyle: "600",
      noWrap: true,
      lineSpacing: 6,
      maxWidth: typeRoleBox(DOOR_PROMPT_MAX_W, "hudTitle"),
      maxHeight: typeRoleBox(DOOR_PROMPT_MAX_H, "hudTitle"),
    })
      .setOrigin(0.5, 0.5)
      .setDepth(DOOR_PROMPT_DEPTH);

    this.paintDoorDayNight(getSim().snapshot());
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight);
    });
    if (layoutDebugEnabled()) {
      this.layoutDebugGfx = this.add.graphics().setDepth(99);
    }
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

  /** Door action plaques hug copy and sit above the customer's head. */
  private placePrompt(): void {
    syncSignPlaque(this.prompt);
    const headTop = standingPersonHeadTop(this.customer);
    const preferred = speechPlaqueAboveHead(this.prompt, this.customer.x, headTop, DOOR_HEAD_GAP);
    const plaque = signPlaqueExtents(this.prompt);
    const half = plaque.panelW / 2 + DOOR_CHIP_MARGIN;
    const x = Phaser.Math.Clamp(preferred.x, half, GAME_WIDTH - half);
    this.resolveDoorPrompt(x, preferred.y);
  }

  private resolveDoorPrompt(preferredX: number, preferredY: number): void {
    if (!String(this.prompt.text ?? "").trim()) return;
    setSignPlaqueCenter(this.prompt, preferredX, preferredY);
    this.paintDoorLayoutDebug();
  }

  /** `?layoutDebug=1` — above-head band + landed prompt AABB. */
  private paintDoorLayoutDebug(): void {
    if (!this.layoutDebugGfx) return;
    const headTop = standingPersonHeadTop(this.customer);
    const band = aboveHeadBand(headTop, DOOR_HEAD_GAP);
    const layers: LayoutDebugLayer[] = [
      {
        label: "aboveHeadBand",
        aabb: {
          left: this.customer.x - 220,
          top: Number.isFinite(band.top) ? band.top : 0,
          right: this.customer.x + 220,
          bottom: band.bottom,
        },
        color: 0x44aaff,
      },
    ];
    if (this.prompt.visible && String(this.prompt.text ?? "").trim()) {
      syncSignPlaque(this.prompt);
      const plaque = signPlaqueExtents(this.prompt);
      const center = signPlaqueCenterWorld(this.prompt);
      layers.push({
        label: "doorPrompt",
        aabb: plaqueAabbFromCenter(center.x, center.y, plaque),
        color: 0xffff44,
      });
    }
    paintLayoutDebug(this.layoutDebugGfx, layers);
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

    const idInspect = drop.idAsked && !!drop.idCard && !drop.idChecked;
    const who = drop.customerName ?? "the customer";
    const promptLine = idInspect
      ? ""
      : nextAsk
        ? `Tap ${who} for ID.`
        : nextHand
          ? `Tap bag → ${who}.`
          : nextPhoto
            ? `Photo — tap bag.`
            : drop.hint || "At the door.";
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
    if (!this.sys.isActive() || this.sys.isSleeping()) return;
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
