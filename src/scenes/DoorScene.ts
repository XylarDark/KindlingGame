import Phaser from "phaser";
import { customerTextureKey } from "../art/people";
import { doorGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, type DayNightPipeline } from "../art/dayNightPipeline";
import { paintDoorstep, DOORSTEP_DOOR_X, DOORSTEP_FLOOR_Y, DOORSTEP_PORCH } from "../art/doorstep";
import { itemHitSize } from "../input/hitRect";
import { BAG_SCALE, PEOPLE_SCALE, PERSON_DISPLAY_H } from "../maps/shopT0";
import { getSim } from "../session";
import { GAME_WIDTH } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import type { SimSnapshot } from "../sim/gameSim";
import { formatSlaClock, isSlaUrgent } from "../ui/copy";
import { addSignText, setSignAccent } from "../ui/signText";
import { Color } from "../ui/theme";
import { fitTypeToWidth } from "../ui/typekit";
import { designSafeInset, readCssSafeArea, VIEWFIT_EVENT, viewFromScale } from "../ui/viewFit";

/** 25% larger than shop bags (BAG_SCALE 0.7). */
const DOOR_BAG_SCALE = BAG_SCALE * 1.25;
const DRIVER_X = DOORSTEP_DOOR_X - 160;
const CUSTOMER_X = DOORSTEP_DOOR_X + 200;
const PERSON_HIT_PAD = 80; // ~10% over prior 72 for mobile taps
const BAG_HIT_PAD = 88; // ~10% over prior 80 for mobile taps

/**
 * The "what to do next" copy runs 25% over the shared ramp. Held as local
 * constants rather than a ramp change: `Type` feeds every screen in the game.
 *
 * The prompt then takes a further 25% on top of that (20px -> 25px). It used to share
 * the naming job with a chip under the bag; that chip is gone, so this sentence is now
 * the only text that says what to tap and it has to carry the instruction alone.
 * `maxHeight` on the prompt must move with this number — `fitTypeToBox` only ever
 * shrinks, so a box left at the old height renders the larger seed at the old size and
 * turns this constant into a lie.
 */
const DOOR_PROMPT_PX = "25px";
const DOOR_TITLE_PX = "33.75px";
/** Gap between a sprite's edge and the chip anchored off it. */
const DOOR_CHIP_GAP = 20;
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
  private backdrop!: Phaser.GameObjects.Graphics;
  private driver!: Phaser.GameObjects.Image;
  private customer!: Phaser.GameObjects.Image;
  private bag!: Phaser.GameObjects.Image;
  private prompt!: Phaser.GameObjects.Text;
  private houseLabel!: Phaser.GameObjects.Text;
  private floorY = 0;
  /** Cached so the per-frame chip placement does not re-read CSS safe areas. */
  private insetTop = 0;
  private lastHouse = "";
  private lastSkyKey = "";
  private lastBagHanded: boolean | null = null;
  private lighting?: DayNightPipeline;

  constructor() {
    super("door");
  }

  create(): void {
    this.input.setTopOnly(true);
    this.lighting = attachDayNight(this.cameras.main);
    this.backdrop = this.add.graphics().setDepth(0);
    paintDoorstep(this.backdrop, 0, skyAt(0));

    this.houseLabel = addSignText(this, DOORSTEP_DOOR_X, 56, "", {
      size: DOOR_TITLE_PX,
      padding: { x: 20, y: 10 },
      fontStyle: "700",
      maxWidth: 900,
      maxHeight: 72,
    })
      .setOrigin(0.5)
      .setDepth(4);

    this.floorY = DOORSTEP_FLOOR_Y + 8;
    this.driver = this.add.image(DRIVER_X, this.floorY, "tex-driver").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);
    this.customer = this.add
      .image(CUSTOMER_X, this.floorY, customerTextureKey(0))
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
    this.customer.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.bag.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });

    // Anchored over the customer's head rather than parked at a fixed y — the
    // instruction names them, so it should be pointing at them.
    this.prompt = addSignText(this, CUSTOMER_X, 0, "", {
      size: DOOR_PROMPT_PX,
      padding: { x: 20, y: 12 },
      align: "center",
      fontStyle: "600",
      maxWidth: 720,
      // Scaled with DOOR_PROMPT_PX: 90 * 1.25 = 112.5, rounded up. Rounding down is the
      // same trap in miniature — fitTypeToBox only shrinks, so a box even slightly short
      // of the type it holds silently renders the text smaller than the seed asks for.
      maxHeight: 113,
    })
      .setOrigin(0.5, 1)
      .setDepth(8);

    this.layoutDoorHud();
    const relayout = (): void => this.layoutDoorHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
    this.game.events.on(VIEWFIT_EVENT, relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(VIEWFIT_EVENT, relayout));
  }

  private layoutDoorHud(): void {
    const inset = designSafeInset(viewFromScale(this.scale), readCssSafeArea(document.getElementById("game-root")));
    this.insetTop = inset.top;
    this.houseLabel.setPosition(DOORSTEP_DOOR_X, 56 + inset.top);
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
    const x = Phaser.Math.Clamp(this.customer.x, half, GAME_WIDTH - half);
    const floor = this.insetTop + this.prompt.displayHeight + DOOR_CHIP_GAP;
    this.prompt.setPosition(x, Math.max(floor, headTop - DOOR_CHIP_GAP));
  }

  update(): void {
    this.sync(getSim().snapshot());
  }

  private sync(snap: SimSnapshot): void {
    const drop = snap.dropoff;
    // Same field the ID-card photo reads, so the two cannot show different people.
    const face = customerTextureKey(drop.customerLook ?? 0);
    if (this.customer.texture.key !== face) this.customer.setTexture(face);
    const houseKey = drop.houseId ?? "house-1";
    const sky = skyAt(snap.gameMs);
    const skyKey = `${sky.zenith}:${sky.haze}:${sky.lampAlpha.toFixed(2)}:${sky.windowGlow.toFixed(2)}`;
    if (houseKey !== this.lastHouse || skyKey !== this.lastSkyKey) {
      this.lastHouse = houseKey;
      this.lastSkyKey = skyKey;
      this.lastBagHanded = null;
      const n = Number(houseKey.replace("house-", "")) || 1;
      paintDoorstep(this.backdrop, n - 1, sky);
    }
    const view = this.cameras.main.worldView;
    const pipe = this.lighting ?? dayNightFrom(this.cameras.main);
    this.lighting = pipe;
    applyDayNight(pipe, doorGrade(sky, DOORSTEP_PORCH), {
      x: view.x,
      y: view.y,
      width: view.width || this.scale.width,
      height: view.height || this.scale.height,
    });
    const destOrder = snap.orders.find((o) => o.destinationId === drop.houseId && o.status === "onRun");
    const sla = destOrder ? formatSlaClock(destOrder.slaRemainingMs) : "";
    const title = drop.houseId
      ? `${drop.customerName ?? "Customer"}  ·  ${houseLabel(drop.houseId)}${sla ? `  ·  ${sla}` : ""}${runNote(snap)}`
      : "";
    this.houseLabel.setText(title);
    // The clock in this title is the urgent part, and it stays ink on white like every
    // other box; the frame is what reddens when the SLA is running out.
    setSignAccent(this.houseLabel, destOrder && isSlaUrgent(destOrder.slaRemainingMs) ? Color.danger : undefined);
    fitTypeToWidth(this.houseLabel, 900);

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

    const who = drop.customerName ?? "the customer";
    this.prompt.setText(
      nextAsk
        ? `Tap ${who} to ask for ID.`
        : nextHand
          ? `Tap the bag to hand it to ${who}.`
          : nextPhoto
            ? `Tap the bag in their hands to take the photo.`
            : drop.hint || "They're at the door.",
    );
    this.prompt.setAlpha(1);
    this.placePrompt();
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

function houseLabel(id: string): string {
  return `House ${id.replace("house-", "")}`;
}

function runNote(snap: SimSnapshot): string {
  const n = snap.run?.orderIds.length ?? 0;
  if (n <= 1) return "";
  return `  ·  ${n} bags in the car`;
}

function enableWideHit(obj: Phaser.GameObjects.Image, pad: number): void {
  const { width, height } = itemHitSize(obj);
  obj.setInteractive({
    useHandCursor: true,
    hitArea: new Phaser.Geom.Rectangle(-pad, -pad, width + pad * 2, height + pad * 2),
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
      obj.input.hitArea = new Phaser.Geom.Rectangle(-pad, -pad, width + pad * 2, height + pad * 2);
    }
  } else if (obj.input) {
    obj.input.enabled = false;
  }
}
