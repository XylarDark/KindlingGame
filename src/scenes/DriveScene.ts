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
  tileToWorld,
} from "../maps/cityT0";
import { cityProps, cityStreetLamps, type CityLamp } from "../maps/cityDecor";
import { buildTrafficLoops, trafficCars, type TrafficLoop } from "../maps/traffic";
import { enableItemHit } from "../input/hit";
import { PEOPLE_SCALE } from "../maps/shopT0";
import { getSim } from "../session";
import { HANDOFF_RADIUS } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import type { SimSnapshot } from "../sim/gameSim";
import { tutorialHints } from "../sim/tutorialHints";
import { formatSlaClock, isSlaUrgent } from "../ui/copy";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { addMark, fitTypeToWidth, overlayStroke } from "../ui/typekit";

const HOUSE_TEX = ["tex-house", "tex-house-alt", "tex-house-3", "tex-house-4", "tex-house-5", "tex-house-6"];

export class DriveScene extends Phaser.Scene {
  private vehicle!: Phaser.GameObjects.Image;
  private walker!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Graphics;
  private pin!: Phaser.GameObjects.Image;
  private pinPulse!: Phaser.GameObjects.Rectangle;
  private pinLabel!: Phaser.GameObjects.Text;
  private customer!: Phaser.GameObjects.Image;
  private shopImg!: Phaser.GameObjects.Image;
  private shopCaption!: Phaser.GameObjects.Text;
  private shopCenter = { x: 0, y: 0 };
  private lastX = 0;
  private lastY = 0;
  private lighting?: DayNightPipeline;
  private streetLamps: CityLamp[] = [];
  private nightGlow!: Phaser.GameObjects.Graphics;
  private trafficLoops: TrafficLoop[] = [];
  private trafficSprites: Phaser.GameObjects.Image[] = [];

  constructor() {
    super("drive");
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, MAP_PX_W, MAP_PX_H);
    this.cameras.main.setBackgroundColor(skyAt(0).mapGrass);
    this.lighting = attachDayNight(this.cameras.main);
    this.drawCity();
    this.nightGlow = this.add.graphics().setDepth(2);
    this.glow = this.add.graphics().setDepth(3);
    this.paintDayNight(getSim().snapshot());
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, () => this.paintDayNight(getSim().snapshot()));
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
    this.spawnTraffic();
  }

  private spawnTraffic(): void {
    this.trafficLoops = buildTrafficLoops(6);
    const sample = trafficCars(0, this.trafficLoops);
    this.trafficSprites = sample.map((car) =>
      this.add.image(0, 0, car.key).setDepth(5).setDisplaySize(120, 72).setAlpha(0.92),
    );
  }

  update(): void {
    const snap = getSim().snapshot();
    this.vehicle.setPosition(snap.vehicle.x, snap.vehicle.y);
    this.vehicle.setAlpha(snap.dropoff.driverOnFoot ? 0.7 : 1);
    this.vehicle.setRotation(snap.vehicle.heading + Math.PI);
    this.lastX = snap.vehicle.x;
    this.lastY = snap.vehicle.y;

    const traffic = trafficCars(snap.gameMs, this.trafficLoops);
    while (this.trafficSprites.length < traffic.length) {
      this.trafficSprites.push(this.add.image(0, 0, "tex-car").setDepth(5).setDisplaySize(120, 72).setAlpha(0.92));
    }
    this.trafficSprites.forEach((sprite, i) => {
      const car = traffic[i];
      if (!car) {
        sprite.setVisible(false);
        return;
      }
      sprite.setTexture(car.key).setPosition(car.x, car.y).setRotation(car.angle + Math.PI).setVisible(true);
    });

    if (snap.dropoff.driverOnFoot && snap.dropoff.driver) {
      this.walker.setVisible(true).setPosition(snap.dropoff.driver.x, snap.dropoff.driver.y + 18);
      this.cameras.main.centerOn(snap.dropoff.driver.x, snap.dropoff.driver.y);
    } else {
      this.walker.setVisible(false);
      this.cameras.main.centerOn(snap.vehicle.x, snap.vehicle.y);
    }

    this.paintDayNight(snap);
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

    const next = tutorialHints(snap)[0];
    const driving = snap.playerRole === "driver" && snap.dropoff.phase !== "atDoor";
    const shop = tileToWorld(CITY.shopSpawn);
    const nearShop = Math.hypot(snap.vehicle.x - shop.x, snap.vehicle.y - shop.y) <= HANDOFF_RADIUS;
    const canTapShop = driving && nearShop;
    const flashShop = next?.kind === "shop";
    if (this.shopImg.input) this.shopImg.input.enabled = driving;
    this.shopImg.setTint(flashShop && canTapShop ? 0xb8ffb0 : 0xffffff);
    this.shopCaption.setVisible(driving);
    this.shopCaption.setAlpha(1);
    if (snap.run?.nextStopId) {
      this.shopCaption.setText("Kindling");
      this.shopCaption.setBackgroundColor("#1c1612ee");
      this.shopCaption.setColor(Color.creamHex);
    } else {
      this.shopCaption.setText(nearShop ? "Tap Kindling to return" : snap.autoDriving ? "Van heading to Kindling" : "Drive to Kindling");
      if (flashShop && nearShop) {
        const bright = Math.round(180 + 60 * (0.5 + 0.5 * Math.sin(snap.gameMs / 200)));
        this.shopCaption.setBackgroundColor(`rgb(${bright},${Math.min(255, bright + 40)},${Math.round(bright * 0.55)})`);
        this.shopCaption.setColor(Color.inkHex);
      } else {
        this.shopCaption.setBackgroundColor(nearShop ? Color.limeHex : "#1c1612ee");
        this.shopCaption.setColor(nearShop ? Color.inkHex : Color.creamHex);
      }
    }
  }

  private paintDayNight(snap: SimSnapshot): void {
    const sky = skyAt(snap.gameMs);
    this.cameras.main.setBackgroundColor(sky.mapGrass);
    const focus = snap.dropoff.driverOnFoot && snap.dropoff.driver ? snap.dropoff.driver : snap.vehicle;
    const view = this.cameras.main.worldView;
    const pipe = this.lighting ?? dayNightFrom(this.cameras.main);
    this.lighting = pipe;
    applyDayNight(pipe, driveGrade(sky, focus, this.streetLamps), {
      x: view.x,
      y: view.y,
      width: view.width || this.scale.width,
      height: view.height || this.scale.height,
    });
    this.paintNightGlow(sky);
  }

  private paintNightGlow(sky: ReturnType<typeof skyAt>): void {
    if (!this.nightGlow) return;
    this.nightGlow.clear();
    if (sky.windowGlow < 0.04 && sky.lampAlpha < 0.04) return;
    for (const house of CITY.houses) {
      const home = lotCenter(house.house, house.lotW, house.lotH);
      this.nightGlow.fillStyle(0xffd080, 0.12 + 0.4 * sky.windowGlow);
      this.nightGlow.fillRect(home.x - 22, home.y - 16, 18, 14);
      this.nightGlow.fillRect(home.x + 6, home.y - 16, 18, 14);
    }
    const shop = lotCenter(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    this.nightGlow.fillStyle(0xffe0a0, 0.1 + 0.35 * sky.windowGlow);
    this.nightGlow.fillRect(shop.x - 70, shop.y - 18, 36, 20);
    this.nightGlow.fillRect(shop.x + 8, shop.y - 18, 44, 20);
    for (const lamp of this.streetLamps) {
      this.nightGlow.fillStyle(0xffc070, 0.06 + 0.28 * sky.lampAlpha);
      this.nightGlow.fillCircle(lamp.x, lamp.y - 18, 26 + 16 * sky.lampAlpha);
    }
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

    for (let r = 0; r < kinds.length; r++) {
      for (let c = 0; c < kinds[r]!.length; c++) {
        const kind = kinds[r]![c]!;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        if (houseTiles.has(`${c},${r}`) || (kind === "shop" && shopTiles.has(`${c},${r}`))) {
          const grass = ["tex-wall", "tex-wall-2", "tex-wall-3"][(c * 3 + r * 5) % 3]!;
          this.add.image(x, y, grass).setDisplaySize(TILE, TILE).setDepth(0);
          continue;
        }
        if (kind === "parking") {
          this.add.image(x, y, "tex-parking").setDisplaySize(TILE, TILE).setDepth(0);
          continue;
        }
        const key =
          kind === "wall"
            ? ["tex-wall", "tex-wall-2", "tex-wall-3"][(c * 3 + r * 5) % 3]!
            : kind === "shop"
              ? "tex-shop"
              : kind === "house"
                ? HOUSE_TEX[(c + r) % HOUSE_TEX.length]!
                : roadTextureKey(kinds, r, c);
        this.add.image(x, y, key).setDisplaySize(TILE, TILE).setDepth(0);
      }
    }

    CITY.houses.forEach((house, i) => {
      const home = lotCenter(house.house, house.lotW, house.lotH);
      const tex = HOUSE_TEX[i % HOUSE_TEX.length]!;
      this.add
        .image(home.x, home.y, tex)
        .setDisplaySize(house.lotW * TILE * 0.92, house.lotH * TILE * 0.88)
        .setDepth(1);
      const num = addUiText(this, home.x, home.y - 8, houseTitle(house.id).replace("House ", ""), {
        size: Type.body,
        color: Color.creamHex,
        fontStyle: "700",
        ...overlayStroke(12),
      })
        .setOrigin(0.5)
        .setDepth(2);
      fitTypeToWidth(num, house.lotW * TILE - 36, 16);
    });

    const shop = lotCenter(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
    this.shopCenter = shop;
    this.shopImg = this.add
      .image(shop.x, shop.y, "tex-shop-bldg")
      .setDisplaySize(CITY.shopLot.w * TILE, CITY.shopLot.h * TILE)
      .setDepth(1);
    enableItemHit(this.shopImg);
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

    this.shopCaption = addUiText(this, shop.x, shop.y + CITY.shopLot.h * TILE * 0.42, "Tap Kindling to return", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 12, y: 6 },
      fontStyle: "700",
    })
      .setOrigin(0.5, 0)
      .setDepth(8)
      .setVisible(false);

    this.streetLamps = cityStreetLamps();
    for (const lamp of this.streetLamps) {
      this.add.image(lamp.x, lamp.y, "tex-lamp").setDisplaySize(36, 88).setDepth(2);
    }
    for (const prop of cityProps()) {
      const img = this.add.image(prop.x, prop.y, prop.key).setDepth(prop.depth);
      if (prop.display) img.setDisplaySize(prop.display.w, prop.display.h);
      else img.setDisplaySize(TILE, TILE);
    }
  }
}

function lotTileKeys(origin: { c: number; r: number }, w: number, h: number): string[] {
  const keys: string[] = [];
  for (let r = origin.r; r < origin.r + h; r++) {
    for (let c = origin.c; c < origin.c + w; c++) keys.push(`${c},${r}`);
  }
  return keys;
}
