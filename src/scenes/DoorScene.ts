import Phaser from "phaser";
import { paintDoorstep, DOORSTEP_DOOR_X, DOORSTEP_FLOOR_Y } from "../art/doorstep";
import { BAG_SCALE, PEOPLE_SCALE, PERSON_DISPLAY_H } from "../maps/shopT0";
import { getSim, isTutorialMode } from "../session";
import type { SimSnapshot } from "../sim/gameSim";
import { tutorialHints } from "../sim/tutorialHints";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { TutorialArrows } from "../ui/tutorialArrow";

export class DoorScene extends Phaser.Scene {
  private backdrop!: Phaser.GameObjects.Graphics;
  private driver!: Phaser.GameObjects.Image;
  private customer!: Phaser.GameObjects.Image;
  private bag!: Phaser.GameObjects.Image;
  private prompt!: Phaser.GameObjects.Text;
  private houseLabel!: Phaser.GameObjects.Text;
  private arrows!: TutorialArrows;
  private lastHouse = "";

  constructor() {
    super("door");
  }

  create(): void {
    this.backdrop = this.add.graphics().setDepth(0);
    paintDoorstep(this.backdrop, 0);

    this.houseLabel = addUiText(this, DOORSTEP_DOOR_X, 120, "", {
      size: Type.title,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 20, y: 10 },
      fontStyle: "700",
    })
      .setOrigin(0.5)
      .setDepth(4);

    const floor = DOORSTEP_FLOOR_Y + 8;
    this.driver = this.add
      .image(DOORSTEP_DOOR_X - 160, floor, "tex-driver")
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    this.customer = this.add
      .image(DOORSTEP_DOOR_X + 160, floor, "tex-customer")
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5)
      .setInteractive({ useHandCursor: true });
    this.bag = this.add
      .image(DOORSTEP_DOOR_X - 230, floor - 8, "tex-bag")
      .setOrigin(0.5, 1)
      .setScale(BAG_SCALE)
      .setDepth(6)
      .setInteractive({ useHandCursor: true });
    this.driver.on("pointerdown", () => getSim().queueInteract());
    this.customer.on("pointerdown", () => getSim().queueInteract());
    this.bag.on("pointerdown", () => getSim().queueInteract());

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

    this.arrows = new TutorialArrows(this, 12);
  }

  update(): void {
    this.sync(getSim().snapshot());
  }

  private sync(snap: SimSnapshot): void {
    const drop = snap.dropoff;
    const houseKey = drop.houseId ?? "house-1";
    if (houseKey !== this.lastHouse) {
      this.lastHouse = houseKey;
      const n = Number(houseKey.replace("house-", "")) || 1;
      paintDoorstep(this.backdrop, n - 1);
    }
    const title = drop.houseId
      ? `${drop.customerName ?? "Customer"}  ·  ${houseLabel(drop.houseId)}${runNote(snap)}`
      : "";
    this.houseLabel.setText(title);

    const pulse = 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(snap.gameMs / 180));
    const nextPhoto = drop.actionLabel === "PHOTO";
    const nextId = drop.actionLabel === "CHECK ID";
    const nextHand = drop.actionLabel === "HAND BAG";
    this.bag.setVisible(!drop.idChecked || nextHand);
    this.bag.setAlpha(nextPhoto || nextHand ? pulse : 1);
    this.bag.setTint(nextPhoto || nextHand ? 0xb8ffb0 : 0xffffff);
    this.customer.setAlpha(nextHand || nextId ? pulse : 1);
    this.customer.setTint(nextHand ? 0xb8ffb0 : 0xffffff);
    this.prompt.setText(drop.hint || "They're at the door.");

    this.paintArrows(snap, nextPhoto, nextHand, nextId);
  }

  private paintArrows(snap: SimSnapshot, nextPhoto: boolean, nextHand: boolean, nextId: boolean): void {
    if (!isTutorialMode()) {
      this.arrows.clear();
      return;
    }
    const spots = [];
    for (const hint of tutorialHints(snap)) {
      if (hint.kind === "handoff" && nextPhoto) {
        spots.push({ id: hint.id, x: this.bag.x, y: this.bag.y - 48 });
      } else if (hint.kind === "handoff" && nextHand) {
        spots.push({ id: hint.id, x: this.customer.x, y: this.customer.y - PERSON_DISPLAY_H - 8 });
      } else if (hint.kind === "idCard" && nextId) {
        spots.push({ id: hint.id, x: this.customer.x, y: this.customer.y - PERSON_DISPLAY_H - 8 });
      }
    }
    this.arrows.sync(spots);
  }
}

const GAME_PROMPT_Y = 72;

function houseLabel(id: string): string {
  return `House ${id.replace("house-", "")}`;
}

function runNote(snap: SimSnapshot): string {
  const n = snap.run?.orderIds.length ?? 0;
  if (n <= 1) return "";
  return `  ·  ${n} bags on the bike`;
}
