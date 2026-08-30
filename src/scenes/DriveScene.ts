import Phaser from "phaser";
import { driveGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, type DayNightPipeline } from "../art/dayNightPipeline";
import {
  CITY,
  MAP_PX_H,
  MAP_PX_W,
  TILE,
  houseTitle,
  lotCenter,
  roadTextureKey,
  shopWorldHit,
  tileToWorld,
} from "../maps/cityT0";
import { PEOPLE_SCALE } from "../maps/shopT0";
import { getSim, isTutorialMode } from "../session";
import { HANDOFF_RADIUS } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import { gpsPath, type SimSnapshot } from "../sim/gameSim";
import { tutorialHints } from "../sim/tutorialHints";
import { formatSlaClock, isSlaUrgent } from "../ui/copy";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { addMark, fitTypeToWidth, overlayStroke } from "../ui/typekit";
import { TutorialArrows } from "../ui/tutorialArrow";

const HOUSE_TEX = ["tex-house", "tex-house-alt", "tex-house-3", "tex-house-4", "tex-house-5", "tex-house-6"];

export class DriveScene extends Phaser.Scene {
  private vehicle!: Phaser.GameObjects.Image;
  private walker!: Phaser.GameObjects.Image;
  private gps!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Graphics;
  private pin!: Phaser.GameObjects.Image;
  private pinPulse!: Phaser.GameObjects.Rectangle;
  private pinLabel!: Phaser.GameObjects.Text;
  private customer!: Phaser.GameObjects.Image;
  private shopHit!: Phaser.GameObjects.Rectangle;
  private shopImg!: Phaser.GameObjects.Image;
  private shopCaption!: Phaser.GameObjects.Text;
  private shopCenter = { x: 0, y: 0 };
  private lastX = 0;
  private lastY = 0;
  private arrows!: TutorialArrows;
  private lighting?: DayNightPipeline;

  constructor() {
    super("drive");
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, MAP_PX_W, MAP_PX_H);
    this.cameras.main.setBackgroundColor(skyAt(0).mapGrass);
    this.lighting = attachDayNight(this.cameras.main);
    this.paintDayNight(getSim().snapshot());
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, () => this.paintDayNight(getSim().snapshot()));
    this.drawCity();
    this.glow = this.add.graphics().setDepth(2);
    this.gps = this.add.graphics().setDepth(3);
    this.pinPulse = this.add.rectangle(0, 0, 88, 88, Color.neon, 0.28).setDepth(4);
    this.pin = this.add.image(0, 0, "tex-pin").setDepth(5).setDisplaySize(96, 120);
    this.tweens.add({
      targets: [this.pin, this.pinPulse],
      alpha: { from: 1, to: 0.55 },
      yoyo: true,
      repeat: -1,
      duration: 700,
    });
    this.pinLabel = addUiText(this, 0, 0, "", {
      size: Type.heading,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 14, y: 8 },
      align: "center",
      fontStyle: "700",
      strokeThickness: 0,
    })
      .setOrigin(0.5, 1)
      .setDepth(6)
      .setVisible(false);
    this.vehicle = this.add.image(0, 0, "tex-vehicle").setDepth(6).setDisplaySize(168, 104);
    this.walker = this.add.image(0, 0, "tex-driver").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(7).setVisible(false);
    this.customer = this.add.image(0, 0, "tex-customer").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(6).setVisible(false);
    this.arrows = new TutorialArrows(this, 8);
  }

  update(): void {
    const snap = getSim().snapshot();
    const dx = snap.vehicle.x - this.lastX;
    const dy = snap.vehicle.y - this.lastY;
    this.vehicle.setPosition(snap.vehicle.x, snap.vehicle.y);
    this.vehicle.setAlpha(snap.dropoff.driverOnFoot ? 0.7 : 1);
    if (Math.hypot(dx, dy) > 0.4) this.vehicle.setRotation(Math.atan2(dy, dx) + Math.PI);
    this.lastX = snap.vehicle.x;
    this.lastY = snap.vehicle.y;

    if (snap.dropoff.driverOnFoot && snap.dropoff.driver) {
      this.walker.setVisible(true).setPosition(snap.dropoff.driver.x, snap.dropoff.driver.y + 18);
      this.cameras.main.centerOn(snap.dropoff.driver.x, snap.dropoff.driver.y);
    } else {
      this.walker.setVisible(false);
      this.cameras.main.centerOn(snap.vehicle.x, snap.vehicle.y);
    }

    this.paintDayNight(snap);
    this.drawGps();
    this.glow.clear();
    const stopId = snap.run?.nextStopId;
    const destOrder = snap.orders.find((o) => o.destinationId === stopId && o.status === "onRun");
    if (stopId) {
      const house = CITY.houses.find((h) => h.id === stopId);
      if (house) {
        const x = house.stop.c * TILE + TILE / 2;
        const y = house.stop.r * TILE + TILE / 2;
        const home = lotCenter(house.house, house.lotW, house.lotH);
        const hw = house.lotW * TILE;
        const hh = house.lotH * TILE;
        this.glow.fillStyle(Color.neon, 0.2);
        this.glow.fillRect(home.x - hw / 2 - 8, home.y - hh / 2 - 8, hw + 16, hh + 16);
        this.glow.lineStyle(5, Color.lime, 0.95);
        this.glow.strokeRect(home.x - hw / 2 - 8, home.y - hh / 2 - 8, hw + 16, hh + 16);
        this.pin.setPosition(x, y - 28).setVisible(true);
        this.pinPulse.setPosition(x, y).setVisible(true);
        const clock = destOrder ? formatSlaClock(destOrder.slaRemainingMs) : "";
        const who = destOrder
          ? `${houseTitle(stopId)}\n${destOrder.customerName}${clock ? `  ·  ${clock}` : ""}`
          : houseTitle(stopId);
        this.pinLabel.setVisible(true).setPosition(x, y - 72).setText(who);
        this.pinLabel.setFontSize(24);
        this.pinLabel.setColor(destOrder && isSlaUrgent(destOrder.slaRemainingMs) ? Color.dangerHex : Color.inkHex);
        fitTypeToWidth(this.pinLabel, 280, 18);
      }
    } else {
      this.pin.setVisible(false);
      this.pinPulse.setVisible(false);
      this.pinLabel.setVisible(false);
    }

    if (snap.dropoff.customer) {
      this.customer.setVisible(true).setPosition(snap.dropoff.customer.x, snap.dropoff.customer.y + 10);
    } else {
      this.customer.setVisible(false);
    }

    this.paintTutorialArrows(snap);
    const driving = snap.playerRole === "driver" && snap.dropoff.phase !== "atDoor";
    const shop = tileToWorld(CITY.shopSpawn);
    const nearShop = Math.hypot(snap.vehicle.x - shop.x, snap.vehicle.y - shop.y) <= HANDOFF_RADIUS;
    const canTapShop = driving && nearShop;
    this.shopHit.setVisible(canTapShop);
    if (this.shopHit.input) this.shopHit.input.enabled = canTapShop;
    if (this.shopImg.input) this.shopImg.input.enabled = driving;
    this.shopCaption.setVisible(driving);
    if (this.shopCaption.input) this.shopCaption.input.enabled = canTapShop;
    if (snap.run?.nextStopId) {
      this.shopCaption.setText("Kindling");
      this.shopCaption.setAlpha(1);
    } else {
      this.shopCaption.setText(nearShop ? "Tap Kindling to return" : "Drive to Kindling");
      this.shopCaption.setAlpha(nearShop ? 0.7 + 0.3 * (0.5 + 0.5 * Math.sin(snap.gameMs / 200)) : 1);
    }
  }

  private paintDayNight(snap: SimSnapshot): void {
    const sky = skyAt(snap.gameMs);
    this.cameras.main.setBackgroundColor(sky.mapGrass);
    const focus = snap.dropoff.driverOnFoot && snap.dropoff.driver ? snap.dropoff.driver : snap.vehicle;
    const view = this.cameras.main.worldView;
    const pipe = this.lighting ?? dayNightFrom(this.cameras.main);
    this.lighting = pipe;
    applyDayNight(pipe, driveGrade(sky, focus), {
      x: view.x,
      y: view.y,
      width: view.width || this.scale.width,
      height: view.height || this.scale.height,
    });
  }

  private paintTutorialArrows(snap: SimSnapshot): void {
    if (!isTutorialMode()) {
      this.arrows.clear();
      return;
    }
    const spots = [];
    for (const hint of tutorialHints(snap)) {
      if (hint.kind === "gpsPin" && this.pin.visible) {
        spots.push({ id: hint.id, x: this.pin.x, y: this.pin.y - 36 });
      } else if (hint.kind === "shop") {
        spots.push({ id: hint.id, x: this.shopCenter.x, y: this.shopCenter.y - 80 });
      } else if (hint.kind === "doorCustomer" && this.customer.visible) {
        spots.push({ id: hint.id, x: this.customer.x, y: this.customer.y - 200 });
      }
    }
    this.arrows.sync(spots);
  }

  private drawGps(): void {
    this.gps.clear();
    const sim = getSim();
    if (sim.snapshot().dropoff.driverOnFoot) return;
    const path = gpsPath(sim);
    if (path.length < 2) return;
    this.gps.lineStyle(10, 0x1a120c, 0.45);
    this.strokePath(path);
    this.gps.lineStyle(6, Color.neon, 0.92);
    this.strokePath(path);
  }

  private strokePath(path: { x: number; y: number }[]): void {
    this.gps.beginPath();
    this.gps.moveTo(path[0]!.x, path[0]!.y);
    for (let i = 1; i < path.length; i++) this.gps.lineTo(path[i]!.x, path[i]!.y);
    this.gps.strokePath();
  }

  private returnToShop(): void {
    const sim = getSim();
    if (sim.snapshot().playerRole !== "driver") return;
    if (sim.snapshot().dropoff.phase === "atDoor") return;
    if (!sim.backToShop()) return;
    this.scene.sleep("drive");
    this.scene.sleep("door");
    this.scene.wake("shop");
    this.scene.bringToTop("hud");
  }

  private drawCity(): void {
    const kinds = CITY.kinds;
    const houseTiles = new Set(CITY.houses.flatMap((h) => lotTileKeys(h.house, h.lotW, h.lotH)));
    const shopTiles = new Set(lotTileKeys(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h));
    shopTiles.add(`${CITY.shopSpawn.c},${CITY.shopSpawn.r}`);

    for (let r = 0; r < kinds.length; r++) {
      for (let c = 0; c < kinds[r]!.length; c++) {
        const kind = kinds[r]![c]!;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        if (houseTiles.has(`${c},${r}`) || (kind === "shop" && shopTiles.has(`${c},${r}`))) {
          this.add.image(x, y, "tex-wall").setDisplaySize(TILE, TILE).setDepth(0);
          continue;
        }
        const key =
          kind === "wall"
            ? "tex-wall"
            : kind === "shop"
              ? "tex-shop"
              : kind === "house"
                ? HOUSE_TEX[(c + r) % HOUSE_TEX.length]!
                : roadTextureKey(kinds, r, c);
        this.add.image(x, y, key).setDisplaySize(TILE, TILE).setDepth(0);
        if (kind === "wall" && (c + r) % 5 === 2) {
          this.add.image(x, y - 8, "tex-tree").setDisplaySize(TILE, TILE).setDepth(1);
        }
      }
    }

    CITY.houses.forEach((house, i) => {
      const home = lotCenter(house.house, house.lotW, house.lotH);
      const tex = HOUSE_TEX[i % HOUSE_TEX.length]!;
      this.add
        .image(home.x, home.y, tex)
        .setDisplaySize(house.lotW * TILE, house.lotH * TILE)
        .setDepth(1);
      const num = addUiText(this, home.x, home.y - 12, houseTitle(house.id).replace("House ", ""), {
        size: Type.heading,
        color: Color.creamHex,
        fontStyle: "700",
        ...overlayStroke(16),
      })
        .setOrigin(0.5)
        .setDepth(2);
      fitTypeToWidth(num, house.lotW * TILE - 28, 20);
    });

    const shop = lotCenter(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    this.shopCenter = shop;
    this.shopImg = this.add
      .image(shop.x, shop.y, "tex-shop-bldg")
      .setDisplaySize(CITY.shopLot.w * TILE, CITY.shopLot.h * TILE)
      .setDepth(1)
      .setInteractive({ useHandCursor: true });
    this.shopImg.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.returnToShop();
    });
    const mark = addMark(this, shop.x, shop.y - CITY.shopLot.h * TILE * 0.3, {
      size: Type.heading,
      color: Color.creamHex,
      maxWidth: CITY.shopLot.w * TILE - 32,
      ...overlayStroke(16),
    })
      .setOrigin(0.5)
      .setDepth(2);
    fitTypeToWidth(mark, CITY.shopLot.w * TILE - 32, 20);

    const hit = shopWorldHit();
    this.shopHit = this.add
      .rectangle(hit.x, hit.y, hit.w, hit.h, 0x000000, 0.001)
      .setDepth(8)
      .setInteractive({ useHandCursor: true });
    this.shopHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.returnToShop();
    });
    this.shopCaption = addUiText(this, shop.x, shop.y + CITY.shopLot.h * TILE * 0.42, "Tap Kindling to return", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 12, y: 6 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 0)
      .setDepth(8)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.shopCaption.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.returnToShop();
    });
  }
}

function lotTileKeys(origin: { c: number; r: number }, w: number, h: number): string[] {
  const keys: string[] = [];
  for (let r = origin.r; r < origin.r + h; r++) {
    for (let c = origin.c; c < origin.c + w; c++) keys.push(`${c},${r}`);
  }
  return keys;
}
