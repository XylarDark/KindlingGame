import Phaser from "phaser";
import { doorGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, type DayNightPipeline } from "../art/dayNightPipeline";
import { paintDoorstep, DOORSTEP_DOOR_X, DOORSTEP_FLOOR_Y, DOORSTEP_PORCH } from "../art/doorstep";
import { enableItemHit, syncItemHit } from "../input/hit";
import { itemHitSize } from "../input/hitRect";
import { BAG_SCALE, PEOPLE_SCALE, PERSON_DISPLAY_H } from "../maps/shopT0";
import { getSim } from "../session";
import { skyAt } from "../sim/dayNight";
import type { SimSnapshot } from "../sim/gameSim";
import { addHudButton, setButtonPulse } from "../ui/chrome";
import { formatSlaClock, isSlaUrgent } from "../ui/copy";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { fitTypeToWidth } from "../ui/typekit";
import { designSafeInset, readCssSafeArea, VIEWFIT_EVENT, viewFromScale } from "../ui/viewFit";

/** 25% larger than shop bags (BAG_SCALE 0.7). */
const DOOR_BAG_SCALE = BAG_SCALE * 1.25;
const DRIVER_X = DOORSTEP_DOOR_X - 160;
const CUSTOMER_X = DOORSTEP_DOOR_X + 200;
/** Extra pad so tapping the customer for HAND BAG always registers. */
const PERSON_HIT_PAD = 56;

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
  private askIdBtn!: Phaser.GameObjects.Container;
  private photoBtn!: Phaser.GameObjects.Container;
  private lastHouse = "";
  private lastSkyKey = "";
  private lighting?: DayNightPipeline;

  constructor() {
    super("door");
  }

  create(): void {
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

    const floor = DOORSTEP_FLOOR_Y + 8;
    this.driver = this.add.image(DRIVER_X, floor, "tex-driver").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);
    enableItemHit(this.driver);
    this.customer = this.add.image(CUSTOMER_X, floor, "tex-customer").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);
    enableWidePersonHit(this.customer);
    // Handles sit in the driver's hands; bag hangs in front of the hip.
    this.bag = this.add
      .image(DRIVER_X + 52, floor - PERSON_DISPLAY_H * 0.46, "tex-bag")
      .setOrigin(0.5, 0.22)
      .setScale(DOOR_BAG_SCALE)
      .setDepth(6);
    enableItemHit(this.bag);
    this.driver.on("pointerdown", () => getSim().queueInteract());
    this.customer.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.bag.on("pointerdown", () => getSim().queueInteract());
    this.youLabel = addUiText(this, DRIVER_X, floor + 16, "You", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 8, y: 3 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 0)
      .setDepth(7);
    this.customerCaption = addUiText(this, CUSTOMER_X, floor + 16, "Customer", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 8, y: 3 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 0)
      .setDepth(10);
    enableItemHit(this.customerCaption);
    this.customerCaption.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.bagCaption = addUiText(this, this.bag.x, this.bag.y - this.bag.displayHeight * this.bag.originY - 8, "Bag", {
      size: Type.caption,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 8, y: 3 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 1)
      .setDepth(7);

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

    const btnY = floor - PERSON_DISPLAY_H - 16;
    this.askIdBtn = addHudButton(this, CUSTOMER_X, btnY, "ASK FOR ID", () => getSim().queueInteract(), {
      originX: 0.5,
      originY: 1,
      variant: "primary",
      minWidth: 360,
      caption: "They must show ID first",
      depth: 9,
    });
    this.askIdBtn.setVisible(false);

    this.photoBtn = addHudButton(this, CUSTOMER_X, btnY, "TAKE PHOTO", () => getSim().queueInteract(), {
      originX: 0.5,
      originY: 1,
      variant: "amber",
      minWidth: 360,
      caption: "Snap a photo of the bag",
      depth: 9,
    });
    this.photoBtn.setVisible(false);

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
    // While the ID card modal is up, door hits must not steal the tap.
    const idModal = nextId;

    this.bag.setVisible(true);
    this.bag.setAlpha(nextPhoto ? pulse : 1);
    this.bag.clearTint();
    this.customer.setAlpha(nextAsk || nextHand ? pulse : 1);
    this.customer.clearTint();
    this.customer.setDepth(nextHand ? 11 : 5);
    // HAND BAG: only the customer (person). PHOTO: bag / photo button. ASK: button + person.
    if (this.bag.input) this.bag.input.enabled = !idModal && nextPhoto;
    if (this.customer.input) this.customer.input.enabled = !idModal && (nextAsk || nextHand);
    if (this.driver.input) this.driver.input.enabled = false;
    if (this.customerCaption.input) this.customerCaption.input.enabled = !idModal && (nextAsk || nextHand);
    syncItemHit(this.customerCaption);

    this.prompt.setText(
      nextHand
        ? `Tap ${drop.customerName ?? "the customer"} to hand over the bag.`
        : drop.hint || "They're at the door.",
    );
    this.prompt.setAlpha(1);
    this.customerCaption.setText(nextHand ? "Tap to hand bag" : drop.customerName ?? "Customer");
    this.customerCaption.setAlpha(1);
    this.bagCaption.setVisible(nextPhoto);
    this.bagCaption.setText("Or tap the bag");
    this.bagCaption.setAlpha(1);
    this.bagCaption.setPosition(this.bag.x, this.bag.y - this.bag.displayHeight * this.bag.originY - 8);
    if (nextPhoto) {
      const bright = Math.round(180 + 60 * pulse);
      this.bagCaption.setBackgroundColor(`rgb(${bright},${Math.min(255, bright + 40)},${Math.round(bright * 0.55)})`);
      this.bagCaption.setColor(Color.inkHex);
    }
    this.customerCaption.setBackgroundColor(nextAsk || nextHand ? Color.limeHex : "#1c1612ee");
    this.customerCaption.setColor(nextAsk || nextHand ? Color.inkHex : Color.creamHex);

    this.askIdBtn.setVisible(nextAsk);
    if (this.askIdBtn.input) this.askIdBtn.input.enabled = nextAsk;
    setButtonPulse(this.askIdBtn, pulse, nextAsk);

    this.photoBtn.setVisible(nextPhoto);
    if (this.photoBtn.input) this.photoBtn.input.enabled = nextPhoto;
    setButtonPulse(this.photoBtn, pulse, nextPhoto);
  }
}

const GAME_PROMPT_Y = 148;

function houseLabel(id: string): string {
  return `House ${id.replace("house-", "")}`;
}

function runNote(snap: SimSnapshot): string {
  const n = snap.run?.orderIds.length ?? 0;
  if (n <= 1) return "";
  return `  ·  ${n} bags on the bike`;
}

function enableWidePersonHit(obj: Phaser.GameObjects.Image): void {
  const { width, height } = itemHitSize(obj);
  const pad = PERSON_HIT_PAD;
  obj.setInteractive({
    useHandCursor: true,
    hitArea: new Phaser.Geom.Rectangle(-pad, -pad, width + pad * 2, height + pad * 2),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
  });
}
