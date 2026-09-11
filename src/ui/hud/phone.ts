import Phaser from "phaser";
import { playUiSfx } from "../../audio/sfx";
import { CITY, houseById, lotWorldRect } from "../../maps/cityT0";
import { cityMinimapGeometry, minimapProjection, type WorldRect } from "../../maps/cityMinimap";
import { getSim } from "../../session";
import type { SimSnapshot } from "../../sim/gameSim";
import { ackTap } from "../../input/tapAck";
import { addSignText, setSignAccent, signContainer } from "../signText";
import { addUiText } from "../text";
import { Color, HUD_TYPE_FIT } from "../theme";
import type { SafeInset } from "../viewFit";
import { GAME_HEIGHT, GAME_WIDTH } from "../../sim/constants";
import {
  MAP_INK,
  PHONE_APP,
  PHONE_CHASSIS,
  PHONE_COG_GAP,
  PHONE_HEADER_H,
  PHONE_H,
  PHONE_MAP,
  PHONE_STATUS_H,
  PHONE_STATUS_PX,
  PHONE_TITLE_PX,
  PHONE_W,
} from "./constants";

/**
 * Delivery phone widget: chassis, baked map, live route overlay, and status plaque.
 */
export class HudPhone {
  phone!: Phaser.GameObjects.Container;
  phoneBody!: Phaser.GameObjects.Image;
  phoneHit!: Phaser.GameObjects.Rectangle;
  phoneChrome!: Phaser.GameObjects.Graphics;
  phoneMapBase!: Phaser.GameObjects.RenderTexture;
  phoneMap!: Phaser.GameObjects.Graphics;
  phoneTitle!: Phaser.GameObjects.Text;
  phoneStatus!: Phaser.GameObjects.Text;

  private lastPhoneLine = "";
  private lastPhoneAccentKey = "";
  private lastPhoneMapKey = "";

  constructor(private readonly scene: Phaser.Scene) {}

  create(): void {
    this.phoneBody = this.scene.add.image(0, 0, "tex-phone").setDisplaySize(PHONE_W, PHONE_H);
    this.phoneChrome = this.scene.add.graphics();
    this.phoneMapBase = this.scene.add
      .renderTexture(PHONE_MAP.x, PHONE_MAP.y, PHONE_MAP.w, PHONE_MAP.h)
      .setOrigin(0, 0);
    this.bakePhoneMap();
    this.phoneMap = this.scene.add.graphics();
    this.phoneTitle = addUiText(this.scene, 0, PHONE_APP.y + PHONE_HEADER_H / 2, "KINDLING DELIVERY", {
      size: PHONE_TITLE_PX,
      color: Color.limeHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
      letterSpacing: 0,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: PHONE_APP.w - 16,
      maxHeight: PHONE_HEADER_H,
    }).setOrigin(0.5);
    this.phoneStatus = addSignText(this.scene, 0, PHONE_APP.y + PHONE_APP.h - PHONE_STATUS_H / 2, "Tap to call", {
      size: PHONE_STATUS_PX,
      fontStyle: "600",
      align: "center",
      lineSpacing: 2,
      noWrap: true,
      ...HUD_TYPE_FIT,
      maxWidth: PHONE_APP.w - 12,
      maxHeight: PHONE_STATUS_H,
    }).setOrigin(0.5);
    const phoneStatusHost = signContainer(this.phoneStatus);
    this.phoneHit = this.scene.add
      .rectangle(0, 0, PHONE_CHASSIS.w, PHONE_CHASSIS.h, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    this.phoneHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      ackTap(this.phoneBody);
      playUiSfx(this.scene.game, "ticket");
      getSim().pressDropoffConfirm();
    });
    this.phoneHit.on("pointerup", () => getSim().releaseDropoffConfirm());
    this.phoneHit.on("pointerupoutside", () => getSim().releaseDropoffConfirm());
    this.phone = this.scene.add
      .container(GAME_WIDTH - 160, GAME_HEIGHT - 220, [
        this.phoneBody,
        this.phoneChrome,
        this.phoneMapBase,
        this.phoneMap,
        this.phoneTitle,
        phoneStatusHost,
        this.phoneHit,
      ])
      .setDepth(22)
      .setVisible(false);
    this.paintPhoneChrome();
  }

  layout(
    inset: SafeInset,
    cogLeft: number,
    cogTop: number,
    viewW: number = GAME_WIDTH,
    viewH: number = GAME_HEIGHT,
  ): void {
    const phoneRight = Math.min(viewW - 16 - inset.right, cogLeft - PHONE_COG_GAP);
    const phoneBottom = Math.min(viewH - 16 - inset.bottom, cogTop - PHONE_COG_GAP);
    this.phone.setPosition(phoneRight - PHONE_CHASSIS.w * 0.5, phoneBottom - PHONE_CHASSIS.h * 0.5);
  }

  paintPhoneChrome(): void {
    const g = this.phoneChrome;
    g.clear();
    g.fillStyle(0x0c1014, 1);
    g.fillRect(PHONE_APP.x, PHONE_APP.y, PHONE_APP.w, PHONE_HEADER_H);
    g.fillRect(PHONE_APP.x, PHONE_APP.y + PHONE_APP.h - PHONE_STATUS_H, PHONE_APP.w, PHONE_STATUS_H);
    g.fillStyle(0x0a0d10, 1);
    g.fillRect(PHONE_APP.x, PHONE_APP.y + PHONE_HEADER_H, PHONE_APP.w, PHONE_APP.h - PHONE_HEADER_H - PHONE_STATUS_H);
    g.lineStyle(1, 0x2e3a44, 1);
    g.strokeRect(PHONE_MAP.x - 1, PHONE_MAP.y - 1, PHONE_MAP.w + 2, PHONE_MAP.h + 2);
  }

  bakePhoneMap(): void {
    const geo = cityMinimapGeometry();
    const p = minimapProjection({ x: 0, y: 0, w: PHONE_MAP.w, h: PHONE_MAP.h });
    const g = this.scene.make.graphics({ x: 0, y: 0 }, false);
    const fill = (rects: readonly WorldRect[], color: number, alpha = 1): void => {
      g.fillStyle(color, alpha);
      for (const r of rects) {
        const box = p.rect(r);
        g.fillRect(box.x, box.y, box.w, box.h);
      }
    };

    g.fillStyle(MAP_INK.outside, 1);
    g.fillRect(0, 0, PHONE_MAP.w, PHONE_MAP.h);
    fill(geo.blocks, MAP_INK.block);
    fill([...geo.streetsEW, ...geo.streetsNS], MAP_INK.street);
    fill(
      geo.stalls.map((s) => s.rect),
      MAP_INK.drive,
    );
    fill(geo.shopStalls, MAP_INK.drive);
    fill(
      geo.houses.map((h) => h.rect),
      MAP_INK.house,
    );
    fill([geo.shop], Color.lime);

    this.phoneMapBase.clear();
    this.phoneMapBase.draw(g, 0, 0);
    g.destroy();
  }

  paintPhoneMap(snap: SimSnapshot): void {
    const stopId = snap.run?.nextStopId ?? snap.dropoff.houseId ?? "";
    const mapKey = `${stopId}:${Math.round(snap.vehicle.x / 8)}:${Math.round(snap.vehicle.y / 8)}:${Math.round(snap.vehicle.heading * 8)}:${snap.dropoff.phase}`;
    if (mapKey === this.lastPhoneMapKey) return;
    this.lastPhoneMapKey = mapKey;
    const g = this.phoneMap;
    g.clear();
    const p = minimapProjection(PHONE_MAP);
    const dot = Math.max(2, Math.round(PHONE_MAP.h * 0.03));

    const route = getSim().routeWorldPath();
    if (route.length > 1) {
      g.lineStyle(Math.max(1.5, PHONE_MAP.h * 0.014), Color.cream, 0.45);
      g.beginPath();
      const start = p.toMap(route[0]!.x, route[0]!.y);
      g.moveTo(start.x, start.y);
      for (let i = 1; i < route.length; i++) {
        const step = p.toMap(route[i]!.x, route[i]!.y);
        g.lineTo(step.x, step.y);
      }
      g.strokePath();
    }

    const house = stopId ? houseById(stopId) : null;
    if (house) {
      const box = p.rect(lotWorldRect(house.house, house.lotW, house.lotH));
      g.fillStyle(Color.amber, 1);
      g.fillRect(box.x, box.y, box.w, box.h);
      g.lineStyle(2, Color.cream, 0.9);
      g.strokeRect(box.x - 1, box.y - 1, box.w + 2, box.h + 2);
    }

    const van = p.toMap(snap.vehicle.x, snap.vehicle.y);
    const tick = dot * 2.4;
    g.lineStyle(Math.max(2, dot * 0.7), 0xffffff, 0.95);
    g.lineBetween(
      van.x,
      van.y,
      van.x + Math.cos(snap.vehicle.heading) * tick,
      van.y + Math.sin(snap.vehicle.heading) * tick,
    );
    g.fillStyle(0xffffff, 1);
    g.fillCircle(van.x, van.y, dot);
    g.fillStyle(Color.neon, 1);
    g.fillCircle(van.x, van.y, dot * 0.6);
  }

  updateStatus(
    showPhone: boolean,
    phoneLine: string,
    accentKey: string,
    cue: boolean,
    calling: boolean,
    snap: SimSnapshot,
  ): void {
    if (!showPhone) {
      this.lastPhoneLine = "";
      this.lastPhoneAccentKey = "";
      this.lastPhoneMapKey = "";
      this.phoneMap.clear();
      if (this.phoneStatus.visible) this.phoneStatus.setVisible(false);
      return;
    }
    if (phoneLine !== this.lastPhoneLine) {
      this.lastPhoneLine = phoneLine;
      this.phoneStatus.setPadding(10, 6, 10, 6);
      this.phoneStatus.setText(phoneLine);
    }
    if (accentKey !== this.lastPhoneAccentKey) {
      this.lastPhoneAccentKey = accentKey;
      setSignAccent(this.phoneStatus, cue ? Color.lime : calling ? Color.leafBright : undefined);
    }
    this.paintPhoneMap(snap);
  }
}
