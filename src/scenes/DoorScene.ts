import Phaser from "phaser";
import { doorGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, type DayNightPipeline } from "../art/dayNightPipeline";
import { paintDoorstep, DOORSTEP_DOOR_X, DOORSTEP_FLOOR_Y, DOORSTEP_PORCH } from "../art/doorstep";
import { itemHitSize } from "../input/hitRect";
import { BAG_SCALE, PEOPLE_SCALE, PERSON_DISPLAY_H } from "../maps/shopT0";
import { getSim } from "../session";
import { skyAt } from "../sim/dayNight";
import type { SimSnapshot } from "../sim/gameSim";
import { formatSlaClock, isSlaUrgent } from "../ui/copy";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { fitTypeToWidth } from "../ui/typekit";
import { designSafeInset, readCssSafeArea, VIEWFIT_EVENT, viewFromScale } from "../ui/viewFit";

/** 25% larger than shop bags (BAG_SCALE 0.7). */
const DOOR_BAG_SCALE = BAG_SCALE * 1.25;
const DRIVER_X = DOORSTEP_DOOR_X - 160;
const CUSTOMER_X = DOORSTEP_DOOR_X + 200;
const PERSON_HIT_PAD = 72;
const BAG_HIT_PAD = 80;

export class DoorScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Graphics;
  private driver!: Phaser.GameObjects.Image;
  private customer!: Phaser.GameObjects.Image;
  private bag!: Phaser.GameObjects.Image;
  private prompt!: Phaser.GameObjects.Text;
  private houseLabel!: Phaser.GameObjects.Text;
  private bagCaption!: Phaser.GameObjects.Text;
  private youLabel!: Phaser.GameObjects.Text;
  private customerCaption!: Phaser.GameObjects.Text;
  private floorY = 0;
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

    this.houseLabel = addUiText(this, DOORSTEP_DOOR_X, 56, "", {
      size: Type.title,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 20, y: 10 },
      fontStyle: "700",
    })
      .setOrigin(0.5)
      .setDepth(4);

    this.floorY = DOORSTEP_FLOOR_Y + 8;
    this.driver = this.add.image(DRIVER_X, this.floorY, "tex-driver").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);
    this.customer = this.add.image(CUSTOMER_X, this.floorY, "tex-customer").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);
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

    this.youLabel = addUiText(this, DRIVER_X, this.floorY + 16, "You", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 8, y: 3 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 0)
      .setDepth(7);
    this.customerCaption = addUiText(this, CUSTOMER_X, this.floorY + 16, "Customer", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 8, y: 3 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 0)
      .setDepth(7);
    this.bagCaption = addUiText(this, this.bag.x, this.bag.y - 8, "", {
      size: Type.caption,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 8, y: 3 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 1)
      .setDepth(7)
      .setVisible(false);

    this.prompt = addUiText(this, DOORSTEP_DOOR_X, GAME_PROMPT_Y, "", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 16, y: 10 },
      align: "center",
      fontStyle: "600",
      wordWrap: { width: 720 },
    })
      .setOrigin(0.5)
      .setDepth(8);

    this.layoutDoorHud();
    const relayout = (): void => this.layoutDoorHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
    this.game.events.on(VIEWFIT_EVENT, relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(VIEWFIT_EVENT, relayout));
  }

  private layoutDoorHud(): void {
    const inset = designSafeInset(viewFromScale(this.scale), readCssSafeArea(document.getElementById("game-root")));
    this.houseLabel.setPosition(DOORSTEP_DOOR_X, 56 + inset.top);
    this.prompt.setPosition(DOORSTEP_DOOR_X, GAME_PROMPT_Y + inset.top);
  }

  update(): void {
    this.sync(getSim().snapshot());
  }

  private sync(snap: SimSnapshot): void {
    const drop = snap.dropoff;
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
    this.houseLabel.setFontSize(36);
    this.houseLabel.setText(title);
    this.houseLabel.setColor(destOrder && isSlaUrgent(destOrder.slaRemainingMs) ? Color.dangerHex : Color.creamHex);
    fitTypeToWidth(this.houseLabel, 900, 18);

    const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(snap.gameMs / 180));
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
      this.bag.setAlpha(pulse);
      this.bag.setTint(0xb8ffb0);
    } else {
      this.bag.setAlpha(1);
      this.bag.clearTint();
    }

    if (nextAsk) {
      this.customer.setAlpha(pulse);
      this.customer.setTint(0xb8ffb0);
    } else {
      this.customer.setAlpha(1);
      this.customer.clearTint();
    }
    this.customer.setDepth(nextAsk ? 11 : 5);

    const canAsk = !idModal && nextAsk;
    const canBag = !idModal && (nextHand || nextPhoto);
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

    this.customerCaption.setText(drop.customerName ?? "Customer");
    this.customerCaption.setAlpha(1);
    this.customerCaption.setBackgroundColor("#1c1612ee");
    this.customerCaption.setColor(Color.creamHex);

    this.bagCaption.setVisible(nextHand || nextPhoto);
    this.bagCaption.setText(nextHand ? "Tap bag to hand over" : "Tap bag for photo");
    this.bagCaption.setAlpha(1);
    this.bagCaption.setBackgroundColor(Color.limeHex);
    this.bagCaption.setColor(Color.inkHex);
    this.bagCaption.setPosition(this.bag.x, this.bag.y - this.bag.displayHeight * this.bag.originY - 8);
  }
}

const GAME_PROMPT_Y = 148;

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
