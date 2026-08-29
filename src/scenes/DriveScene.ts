import Phaser from "phaser";
import { CITY, MAP_PX_H, MAP_PX_W, TILE, houseTitle, roadTextureKey } from "../maps/cityT0";
import { PEOPLE_SCALE } from "../maps/shopT0";
import { getSim } from "../session";
import { gpsPath } from "../sim/gameSim";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";

const HOUSE_TEX = ["tex-house", "tex-house-alt", "tex-house-3", "tex-house-4"];

export class DriveScene extends Phaser.Scene {
  private vehicle!: Phaser.GameObjects.Image;
  private walker!: Phaser.GameObjects.Image;
  private gps!: Phaser.GameObjects.Graphics;
  private glow!: Phaser.GameObjects.Graphics;
  private pin!: Phaser.GameObjects.Image;
  private pinPulse!: Phaser.GameObjects.Rectangle;
  private pinLabel!: Phaser.GameObjects.Text;
  private customer!: Phaser.GameObjects.Image;
  private lastX = 0;
  private lastY = 0;

  constructor() {
    super("drive");
  }

  create(): void {
    this.cameras.main.setBounds(0, 0, MAP_PX_W, MAP_PX_H);
    this.cameras.main.setBackgroundColor(0x3a4c32);
    this.drawCity();
    this.glow = this.add.graphics().setDepth(2);
    this.gps = this.add.graphics().setDepth(3);
    this.pinPulse = this.add.rectangle(0, 0, 56, 56, Color.neon, 0.28).setDepth(4);
    this.pin = this.add.image(0, 0, "tex-pin").setDepth(5).setScale(1);
    this.tweens.add({
      targets: [this.pin, this.pinPulse],
      alpha: { from: 1, to: 0.55 },
      yoyo: true,
      repeat: -1,
      duration: 700,
    });
    this.pinLabel = addUiText(this, 0, 0, "", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 8, y: 4 },
      align: "center",
      fontStyle: "700",
    })
      .setOrigin(0.5, 1)
      .setDepth(6)
      .setVisible(false);
    this.vehicle = this.add.image(0, 0, "tex-vehicle").setDepth(6).setScale(1);
    this.walker = this.add.image(0, 0, "tex-driver").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(7).setVisible(false);
    this.customer = this.add.image(0, 0, "tex-customer").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(6).setVisible(false);
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

    this.drawGps();
    this.glow.clear();
    const stopId = snap.run?.nextStopId;
    const destOrder = snap.orders.find((o) => o.destinationId === stopId && o.status === "onRun");
    if (stopId) {
      const house = CITY.houses.find((h) => h.id === stopId);
      if (house) {
        const x = house.stop.c * TILE + TILE / 2;
        const y = house.stop.r * TILE + TILE / 2;
        const hx = house.house.c * TILE + TILE / 2;
        const hy = house.house.r * TILE + TILE / 2;
        this.glow.fillStyle(Color.neon, 0.22);
        this.glow.fillRect(hx - 32, hy - 32, 64, 64);
        this.glow.lineStyle(4, Color.lime, 0.95);
        this.glow.strokeRect(hx - 32, hy - 32, 64, 64);
        this.pin.setPosition(x, y - 18).setVisible(true);
        this.pinPulse.setPosition(x, y).setVisible(true);
        const who = destOrder ? `${houseTitle(stopId)}\n${destOrder.customerName}` : houseTitle(stopId);
        this.pinLabel.setVisible(true).setPosition(x, y - 52).setText(who);
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
  }

  private drawGps(): void {
    this.gps.clear();
    const sim = getSim();
    if (sim.snapshot().dropoff.driverOnFoot) return;
    const path = gpsPath(sim);
    if (path.length < 2) return;
    this.gps.lineStyle(8, 0x1a120c, 0.45);
    this.strokePath(path);
    this.gps.lineStyle(5, Color.neon, 0.92);
    this.strokePath(path);
  }

  private strokePath(path: { x: number; y: number }[]): void {
    this.gps.beginPath();
    this.gps.moveTo(path[0]!.x, path[0]!.y);
    for (let i = 1; i < path.length; i++) this.gps.lineTo(path[i]!.x, path[i]!.y);
    this.gps.strokePath();
  }

  private drawCity(): void {
    const kinds = CITY.kinds;
    for (let r = 0; r < kinds.length; r++) {
      for (let c = 0; c < kinds[r]!.length; c++) {
        const kind = kinds[r]![c]!;
        const x = c * TILE + TILE / 2;
        const y = r * TILE + TILE / 2;
        const key =
          kind === "wall"
            ? "tex-wall"
            : kind === "shop"
              ? "tex-shop"
              : kind === "house"
                ? HOUSE_TEX[(c + r) % HOUSE_TEX.length]!
                : roadTextureKey(kinds, r, c);
        this.add.image(x, y, key).setDepth(0);
      }
    }
    addUiText(this, CITY.shopSpawn.c * TILE + TILE / 2, CITY.shopSpawn.r * TILE + TILE / 2 - 36, "KINDLING", {
      size: Type.caption,
      color: Color.creamHex,
      fontStyle: "700",
    })
      .setOrigin(0.5)
      .setDepth(2);
    for (const house of CITY.houses) {
      addUiText(this, house.house.c * TILE + TILE / 2, house.house.r * TILE + TILE / 2 - 6, houseTitle(house.id).replace("House ", ""), {
        size: Type.body,
        color: Color.creamHex,
        fontStyle: "700",
      })
        .setOrigin(0.5)
        .setDepth(2);
    }
  }
}
