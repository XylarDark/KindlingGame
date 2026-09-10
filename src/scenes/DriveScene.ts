import Phaser from "phaser";
import { customerTextureKey } from "../art/people";
import { driveGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, shouldApplyGrade, type DayNightPipeline } from "../art/dayNightPipeline";
import { getRenderBudget } from "../ui/renderBudget";
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
import { cityAccessPaths, cityProps, cityStreetLamps, paintAccessPaths, paintHouseStreetSeams, type CityLamp } from "../maps/cityDecor";
import { cityTrafficLoops, trafficCars, type TrafficLoop } from "../maps/traffic";
import { enableItemHit } from "../input/hit";
import { PEOPLE_SCALE } from "../maps/shopT0";
import { getSim } from "../session";
import { HANDOFF_RADIUS } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import { lerpAngle } from "../sim/driveRoute";
import type { SimSnapshot } from "../sim/gameSim";
import { tutorialHints } from "../sim/tutorialHints";
import { formatSlaClock, isSlaUrgent } from "../ui/copy";
import { addSignText, setSignAccent } from "../ui/signText";
import { Color, MSG_TYPE_FIT, Type, scaleMsgBox, scaleMsgPad, scaleMsgPx } from "../ui/theme";
import { addUiText } from "../ui/text";
import { addMark, fitTypeToWidth, overlayStroke } from "../ui/typekit";

const HOUSE_TEX = ["tex-house", "tex-house-alt", "tex-house-3", "tex-house-4", "tex-house-5", "tex-house-6"];

/** Drive grade rebuild cadence — slower than shop; scrolling camera already moves view UVs. */
const DRIVE_GRADE_MIN_MS = 120;
/** Focus quantize grid — coarser than 32px cuts lamp-pool rebuilds while driving. */
const DRIVE_FOCUS_GRID = 64;

/**
 * The road's share of the "what to do next" family, 25% over the shared ramp.
 * Local constants, because `Type` feeds every screen in the game.
 */
const pinLabelPx = (): string => scaleMsgPx(25);
const vanBannerPx = (): string => scaleMsgPx(20);

export class DriveScene extends Phaser.Scene {
  private vehicle!: Phaser.GameObjects.Image;
  private walker!: Phaser.GameObjects.Image;
  private glow!: Phaser.GameObjects.Graphics;
  private pin!: Phaser.GameObjects.Image;
  private pinPulse!: Phaser.GameObjects.Ellipse;
  private pinLabel!: Phaser.GameObjects.Text;
  private pinBob = 0;
  private pinBase = { x: 0, y: 0 };
  private vanBanner!: Phaser.GameObjects.Text;
  private customer!: Phaser.GameObjects.Image;
  private shopImg!: Phaser.GameObjects.Image;
  private shopCaption!: Phaser.GameObjects.Text;
  private shopCenter = { x: 0, y: 0 };
  private lastX = 0;
  private lastY = 0;
  private lighting?: DayNightPipeline;
  private streetLamps: CityLamp[] = [];
  private nightGlow!: Phaser.GameObjects.Graphics;
  private lastGlowKey = "";
  private lastGradeKey = "";
  private lastGradeMs = -1e9;
  private lastPinWho = "";
  private lastLotGlowKey = "";
  private lastVanToast = "";
  private lastShopCaptionKey = "";
  private onPreRenderDayNight = (): void => this.paintDayNight(getSim().snapshot());
  private trafficLoops: TrafficLoop[] = [];
  private trafficSprites: Phaser.GameObjects.Image[] = [];
  private trafficAngles = new Map<string, number>();

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
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderDayNight);
    });
    this.pinPulse = this.add.ellipse(0, 0, 56, 22, Color.amber, 0.35).setDepth(4);
    this.pin = this.add
      .image(0, 0, "tex-pin")
      .setOrigin(0.5, 1)
      .setDepth(5)
      .setDisplaySize(72, 96)
      .setVisible(false);
    this.tweens.add({
      targets: this,
      pinBob: { from: 0, to: 18 },
      yoyo: true,
      repeat: -1,
      duration: 720,
      ease: "Sine.easeInOut",
    });
    this.tweens.add({
      targets: this.pinPulse,
      alpha: { from: 0.45, to: 0.18 },
      scaleX: { from: 1, to: 1.25 },
      scaleY: { from: 1, to: 1.15 },
      yoyo: true,
      repeat: -1,
      duration: 720,
      ease: "Sine.easeInOut",
    });
    this.pinLabel = addSignText(this, 0, 0, "", {
      size: pinLabelPx(),
      padding: scaleMsgPad({ x: 20, y: 14 }),
      align: "center",
      fontStyle: "700",
      lineSpacing: scaleMsgBox(6),
      noWrap: true,
      ...MSG_TYPE_FIT,
      maxWidth: scaleMsgBox(460),
      maxHeight: scaleMsgBox(150),
    })
      .setOrigin(0.5, 1)
      // Above the van/walker sprites — the stop label must never be clipped.
      .setDepth(13)
      .setVisible(false);
    this.vanBanner = addSignText(this, 0, 0, "", {
      size: vanBannerPx(),
      padding: scaleMsgPad({ x: 18, y: 10 }),
      align: "center",
      fontStyle: "600",
      ...MSG_TYPE_FIT,
      maxWidth: scaleMsgBox(500),
      maxHeight: scaleMsgBox(70),
    })
      .setOrigin(0.5, 1)
      .setDepth(12)
      .setVisible(false);
    this.vehicle = this.add.image(0, 0, "tex-vehicle").setDepth(6).setDisplaySize(168, 104);
    this.walker = this.add.image(0, 0, "tex-driver").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(7).setVisible(false);
    this.customer = this.add
      .image(0, 0, customerTextureKey(0))
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(6)
      .setVisible(false);
    this.spawnTraffic();
  }

  private spawnTraffic(): void {
    this.trafficLoops = cityTrafficLoops();
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

    const traffic = trafficCars(snap.gameMs, this.trafficLoops, {
      x: snap.vehicle.x,
      y: snap.vehicle.y,
      heading: snap.vehicle.heading,
    });
    const turnT = 1 - Math.exp(-(this.game.loop.delta / 1000) * 6);
    const seen = new Set<string>();
    while (this.trafficSprites.length < traffic.length) {
      this.trafficSprites.push(this.add.image(0, 0, "tex-car").setDepth(5).setDisplaySize(120, 72).setAlpha(0.92));
    }
    this.trafficSprites.forEach((sprite, i) => {
      const car = traffic[i];
      if (!car) {
        sprite.setVisible(false);
        return;
      }
      seen.add(car.id);
      const prev = this.trafficAngles.get(car.id) ?? car.angle;
      const angle = lerpAngle(prev, car.angle, turnT);
      this.trafficAngles.set(car.id, angle);
      sprite.setTexture(car.key).setPosition(car.x, car.y).setRotation(angle + Math.PI).setVisible(true);
    });
    for (const id of this.trafficAngles.keys()) {
      if (!seen.has(id)) this.trafficAngles.delete(id);
    }

    const driving = snap.playerRole === "driver" && snap.dropoff.phase !== "atDoor";

    if (snap.dropoff.driverOnFoot && snap.dropoff.driver) {
      this.walker.setVisible(true).setPosition(snap.dropoff.driver.x, snap.dropoff.driver.y + 18);
      this.cameras.main.centerOn(snap.dropoff.driver.x, snap.dropoff.driver.y);
    } else {
      this.walker.setVisible(false);
      this.cameras.main.centerOn(snap.vehicle.x, snap.vehicle.y);
    }

    // Day/night paints once in PRE_RENDER — avoid a second PostFX upload here.
    const next = tutorialHints(snap)[0];
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
        // Lot glow only when the stop changes — clear+fill every frame was pure CPU.
        if (stopId !== this.lastLotGlowKey) {
          this.lastLotGlowKey = stopId;
          this.glow.clear();
          this.glow.fillStyle(Color.neon, 0.2);
          this.glow.fillRect(home.x - hw / 2 - 8, home.y - hh / 2 - 8, hw + 16, hh + 16);
          this.glow.lineStyle(5, Color.lime, 0.95);
          this.glow.strokeRect(home.x - hw / 2 - 8, home.y - hh / 2 - 8, hw + 16, hh + 16);
        }
        this.pinBase.x = x;
        this.pinBase.y = y - 6;
        this.pin.setPosition(this.pinBase.x, this.pinBase.y - this.pinBob).setVisible(true);
        this.pinPulse.setPosition(x, y + 6).setVisible(true);
        const clock = destOrder ? formatSlaClock(destOrder.slaRemainingMs) : "";
        const who = destOrder
          ? `${houseTitle(stopId)}\n${destOrder.customerName}${clock ? `\n${clock}` : ""}`
          : houseTitle(stopId);
        this.pinLabel.setVisible(true).setPosition(x, this.pinBase.y - this.pinBob - 12);
        // SLA clock changes ~1/s; dirty-guard avoids typekit work every frame.
        if (who !== this.lastPinWho) {
          this.lastPinWho = who;
          this.pinLabel.setText(who);
        }
        // Ink on white in every state, LATE included: the urgency is carried by the
        // frame, so the stop name never drops to danger-red on a coloured chip.
        const urgent = !!destOrder && isSlaUrgent(destOrder.slaRemainingMs);
        setSignAccent(this.pinLabel, urgent ? Color.danger : undefined);

        const flashPin = next?.kind === "gpsPin";
        const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(snap.gameMs / 280));
        this.pin.setTint(flashPin ? Color.flash : 0xffffff);
        this.pin.setAlpha(flashPin ? pulse : 1);
        this.pinPulse.setFillStyle(flashPin ? Color.lime : Color.amber, flashPin ? 0.25 + 0.35 * pulse : 0.35);
        if (flashPin) {
          setSignAccent(this.pinLabel, Color.lime);
          this.pinLabel.setAlpha(0.85 + 0.15 * pulse);
        } else {
          this.pinLabel.setAlpha(1);
        }
      }
    } else {
      if (this.lastLotGlowKey !== "") {
        this.lastLotGlowKey = "";
        this.glow.clear();
      }
      this.lastPinWho = "";
      this.pin.setVisible(false);
      this.pinPulse.setVisible(false);
      this.pinLabel.setVisible(false);
      this.pin.clearTint();
      this.pin.setAlpha(1);
    }

    // GPS pin + label already carry the stop — van toast stacks on them mid-route.
    if (driving && snap.toast && !stopId) {
      this.vanBanner.setVisible(true).setPosition(snap.vehicle.x, snap.vehicle.y - 78);
      if (snap.toast !== this.lastVanToast) {
        this.lastVanToast = snap.toast;
        this.vanBanner.setText(snap.toast);
        fitTypeToWidth(this.vanBanner, 500);
      }
    } else {
      this.lastVanToast = "";
      this.vanBanner.setVisible(false);
    }

    if (snap.dropoff.customer) {
      const face = customerTextureKey(snap.dropoff.customerLook ?? 0);
      if (this.customer.texture.key !== face) this.customer.setTexture(face);
      this.customer.setVisible(true).setPosition(snap.dropoff.customer.x, snap.dropoff.customer.y + 10);
    } else {
      this.customer.setVisible(false);
    }

    const shop = tileToWorld(CITY.shopSpawn);
    const nearShop = Math.hypot(snap.vehicle.x - shop.x, snap.vehicle.y - shop.y) <= HANDOFF_RADIUS;
    const canTapShop = driving && nearShop;
    const flashShop = next?.kind === "shop";
    if (this.shopImg.input) this.shopImg.input.enabled = driving;
    this.shopImg.setTint(flashShop && canTapShop ? Color.flash : 0xffffff);
    this.shopCaption.setVisible(driving);
    this.shopCaption.setAlpha(1);
    const captionText = snap.run?.nextStopId
      ? "Kindling"
      : nearShop
        ? "Tap Kindling to return"
        : snap.autoDriving
          ? "Van heading to Kindling"
          : "Drive to Kindling";
    const captionKey = `${captionText}:${nearShop ? 1 : 0}`;
    if (captionKey !== this.lastShopCaptionKey) {
      this.lastShopCaptionKey = captionKey;
      this.shopCaption.setText(captionText);
      setSignAccent(this.shopCaption, snap.run?.nextStopId ? undefined : nearShop ? Color.lime : undefined);
    }
    if (!snap.run?.nextStopId) {
      this.shopCaption.setAlpha(flashShop && nearShop ? 0.8 + 0.2 * (0.5 + 0.5 * Math.sin(snap.gameMs / 200)) : 1);
    }
  }

  private paintDayNight(snap: SimSnapshot): void {
    if (!this.sys.isActive()) return;
    const sky = skyAt(snap.gameMs);
    this.cameras.main.setBackgroundColor(sky.mapGrass);
    if (getRenderBudget().postFx) {
      const focus = snap.dropoff.driverOnFoot && snap.dropoff.driver ? snap.dropoff.driver : snap.vehicle;
      // Coarse focus + sky key: view UVs refresh in the pipeline via syncViewFromCamera.
      const gradeKey = `${sky.mapOverlay}:${sky.mapOverlayAlpha.toFixed(3)}:${sky.lampAlpha.toFixed(2)}:${Math.round(focus.x / DRIVE_FOCUS_GRID)}:${Math.round(focus.y / DRIVE_FOCUS_GRID)}`;
      const now = performance.now();
      if (
        shouldApplyGrade({
          nowMs: now,
          lastMs: this.lastGradeMs,
          dirty: gradeKey !== this.lastGradeKey,
          minMs: DRIVE_GRADE_MIN_MS,
        })
      ) {
        this.lastGradeKey = gradeKey;
        this.lastGradeMs = now;
        const view = this.cameras.main.worldView;
        const pipe = this.lighting ?? dayNightFrom(this.cameras.main);
        this.lighting = pipe;
        applyDayNight(pipe, driveGrade(sky, focus, this.streetLamps), {
          x: view.x,
          y: view.y,
          width: view.width || this.scale.width,
          height: view.height || this.scale.height,
        });
      }
    }
    this.paintNightGlow(sky);
  }

  private paintNightGlow(sky: ReturnType<typeof skyAt>): void {
    if (!this.nightGlow) return;
    // PostFX carries lamps/windows — skip redundant Graphics fill when the pipeline is on.
    if (getRenderBudget().postFx) return;
    const key = `${sky.windowGlow.toFixed(2)}:${sky.lampAlpha.toFixed(2)}`;
    if (key === this.lastGlowKey) return;
    this.lastGlowKey = key;
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
        .setDisplaySize(house.lotW * TILE * 0.98, house.lotH * TILE * 0.96)
        .setDepth(1);
      const num = addUiText(this, home.x, home.y - 8, houseTitle(house.id).replace("House ", ""), {
        size: Type.body,
        color: Color.creamHex,
        fontStyle: "700",
        maxWidth: house.lotW * TILE - 36,
        maxHeight: 28,
        ...overlayStroke(12),
      })
        .setOrigin(0.5)
        .setDepth(2);
      fitTypeToWidth(num, house.lotW * TILE - 36);
    });

    // Seams + walks above grass, clipped under roofs but over lot edge / pad lips.
    const accessGfx = this.add.graphics().setDepth(1.2);
    paintHouseStreetSeams(accessGfx);
    paintAccessPaths(accessGfx, cityAccessPaths());

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
      maxHeight: 36,
      ...overlayStroke(16),
    })
      .setOrigin(0.5)
      .setDepth(2);
    fitTypeToWidth(mark, CITY.shopLot.w * TILE - 32);

    this.shopCaption = addSignText(this, shop.x, shop.y + CITY.shopLot.h * TILE * 0.42, "Tap Kindling to return", {
      size: scaleMsgPx(16),
      padding: scaleMsgPad({ x: 12, y: 6 }),
      fontStyle: "700",
      ...MSG_TYPE_FIT,
      maxWidth: CITY.shopLot.w * TILE - 24,
      maxHeight: scaleMsgBox(52),
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
