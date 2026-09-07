import Phaser from "phaser";
import { shopGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, type DayNightPipeline } from "../art/dayNightPipeline";
import { drawShopCounter, drawShopInterior, paintShopDayNight, paintWindowGlow } from "../art/shopInterior";
import {
  BAG_STACK,
  BAG_SCALE,
  COUNTER_TOP,
  COUNTER_FRONT,
  CUSTOMER_SPOT,
  CUSTOMER_BUBBLE_DX,
  CUSTOMER_BUBBLE_Y,
  DRIVER,
  KEYLEAD,
  OUT_BAG_GAP,
  OUT_BAG_RIGHT,
  PEOPLE_SCALE,
  PERSON_DISPLAY_H,
  TABLET,
  TABLET_H,
  TABLET_W,
  TV_BEZEL,
  TV_W,
  bagCaptionY,
  ceilingPots,
  strainPos,
  strainSlotH,
  tabletLayout,
} from "../maps/shopT0";
import { enableItemHit } from "../input/hit";
import { getSim } from "../session";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import type { CustomerView, OrderView, SimSnapshot } from "../sim/gameSim";
import { isPackedOnCounter } from "../sim/orders";
import { nextShopHint } from "../sim/tutorialHints";
import { deliveryBagLabel, driverReadyCopy, isSlaUrgent } from "../ui/copy";
import { wireHover } from "../ui/chrome";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { fitTypeToWidth } from "../ui/typekit";
export class ShopScene extends Phaser.Scene {
  private keyLead!: Phaser.GameObjects.Image;
  private driver!: Phaser.GameObjects.Image;
  private bagRack!: Phaser.GameObjects.Image;
  private bagRackLabel!: Phaser.GameObjects.Text;
  private tabletScreen!: Phaser.GameObjects.Graphics;
  private tabletHit!: Phaser.GameObjects.Rectangle;
  private tabletLabel!: Phaser.GameObjects.Text;
  private queueBadge!: Phaser.GameObjects.Text;
  private keyLeadBubble!: Phaser.GameObjects.Text;
  private driverBubble!: Phaser.GameObjects.Text;
  private counterPrompt!: Phaser.GameObjects.Text;
  private customers = new Map<string, Phaser.GameObjects.Image>();
  private bubbles = new Map<string, Phaser.GameObjects.Text>();
  private outBags = new Map<string, Phaser.GameObjects.GameObject[]>();
  private tvs: Phaser.GameObjects.Rectangle[] = [];
  private tvLabels: Phaser.GameObjects.Text[] = [];
  private jarSkus: string[] = [];
  private sky!: Phaser.GameObjects.Graphics;
  private windowGlow!: Phaser.GameObjects.Graphics;
  private lighting?: DayNightPipeline;
  private lastLightMs = -1;

  constructor() {
    super("shop");
  }

  create(): void {
    this.input.setTopOnly(false);
    drawShopInterior(this);
    this.sky = this.add.graphics().setDepth(0.5);
    this.windowGlow = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    const startMs = getSim().snapshot().gameMs;
    paintShopDayNight(this.sky, startMs);
    paintWindowGlow(this.windowGlow, startMs);
    this.lighting = attachDayNight(this.cameras.main);
    this.syncLighting(getSim().snapshot().gameMs);
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, () => this.syncLighting(getSim().snapshot().gameMs));
    this.makeHotspots();

    this.bagRack = this.add.image(BAG_STACK.x, BAG_STACK.y, "tex-bag").setOrigin(0.5, 1).setScale(BAG_SCALE).setDepth(8);
    enableItemHit(this.bagRack);
    this.bagRack.on("pointerdown", () => getSim().shopClick({ type: "bagRack" }));
    this.bagRackLabel = addUiText(this, BAG_STACK.x, bagCaptionY(BAG_STACK.y), "BAGS", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 8, y: 4 },
      fontStyle: "700",
      maxWidth: 112,
      maxHeight: 32,
    })
      .setOrigin(0.5)
      .setDepth(9);

    this.keyLead = this.add
      .image(KEYLEAD.x, KEYLEAD.y, "tex-keylead")
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5);
    drawShopCounter(this);

    const tab = tabletLayout();
    this.tabletScreen = this.add.graphics().setDepth(10);
    this.tabletLabel = addUiText(this, TABLET.x, tab.screenTop + tab.screenH / 2, "ORDERS", {
      size: Type.caption,
      color: Color.creamHex,
      fontStyle: "700",
      strokeThickness: 0,
      maxWidth: tab.screenW - 16,
      maxHeight: tab.screenH - 16,
    })
      .setOrigin(0.5)
      .setDepth(11);
    fitTypeToWidth(this.tabletLabel, tab.screenW - 16);

    this.tabletHit = this.add.rectangle(TABLET.x, TABLET.y, TABLET_W, TABLET_H, 0x000000, 0.001).setDepth(12);
    enableItemHit(this.tabletHit);
    this.tabletHit.on("pointerdown", () => {
      const ticket = getSim().snapshot().tabletTicket;
      if (ticket) getSim().shopClick({ type: "tablet", orderId: ticket.id });
    });
    wireHover(this.tabletHit);

    this.queueBadge = addUiText(this, tab.left + tab.w - 10, tab.top + 10, "", {
      size: Type.caption,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 6, y: 2 },
      fontStyle: "700",
      strokeThickness: 0,
      maxWidth: 48,
      maxHeight: 28,
    })
      .setOrigin(0.5)
      .setDepth(13)
      .setVisible(false);

    this.keyLeadBubble = addUiText(this, KEYLEAD.x - 168, KEYLEAD.y - PERSON_DISPLAY_H - 24, "", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 10, y: 6 },
      align: "center",
      fontStyle: "600",
      maxWidth: 280,
      maxHeight: 72,
    })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false);

    this.driver = this.add.image(DRIVER.x, DRIVER.y, "tex-driver-sit").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(10);
    enableItemHit(this.driver);
    this.driver.on("pointerdown", () => this.departNow());
    wireHover(this.driver);

    this.driverBubble = addUiText(this, DRIVER.x - 24, DRIVER.y - PERSON_DISPLAY_H - 8, "", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 10, y: 6 },
      align: "center",
      fontStyle: "600",
      maxWidth: 280,
      maxHeight: 88,
    })
      .setOrigin(1, 1)
      .setDepth(12)
      .setVisible(false);

    this.counterPrompt = addUiText(this, CUSTOMER_SPOT.x + 268, COUNTER_FRONT + 104, "", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 12, y: 8 },
      align: "center",
      fontStyle: "700",
      maxWidth: 360,
      maxHeight: 72,
    })
      .setOrigin(0.5)
      .setDepth(8)
      .setVisible(false);
  }

  update(): void {
    this.sync(getSim().snapshot());
  }

  private syncLighting(gameMs: number): void {
    const pipe = this.lighting ?? dayNightFrom(this.cameras.main);
    this.lighting = pipe;
    const playing = this.sys.isActive();
    if (playing && Math.abs(gameMs - this.lastLightMs) < 80) return;
    this.lastLightMs = gameMs;
    applyDayNight(pipe, shopGrade(skyAt(gameMs), ceilingPots()), {
      x: 0,
      y: 0,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    });
  }

  private sync(snap: SimSnapshot): void {
    paintShopDayNight(this.sky, snap.gameMs);
    paintWindowGlow(this.windowGlow, snap.gameMs);
    this.syncLighting(snap.gameMs);
    this.driver.setVisible(snap.playerRole === "keyLead");
    this.keyLead.setVisible(snap.keyLead.visible && snap.playerRole === "keyLead");
    this.keyLead.setPosition(snap.keyLead.x, snap.keyLead.y);
    const callout = snap.keyLeadLine;
    this.keyLeadBubble
      .setVisible(!!callout && snap.keyLead.visible && snap.playerRole === "keyLead")
      .setText(callout ?? "")
      .setPosition(snap.keyLead.x - 168, snap.keyLead.y - PERSON_DISPLAY_H - 24);

    const next = nextShopHint(snap);
    const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(snap.gameMs / 420));
    const tabletPulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(snap.gameMs / 160));
    const highlightGo = next?.kind === "hitTheRoad";
    const readyLine = driverReadyCopy(snap.bagsInBin.length);
    const driverLine = highlightGo ? (snap.driverLine ?? readyLine) : null;
    this.driverBubble.setVisible(!!driverLine && snap.playerRole === "keyLead").setText(driverLine ?? "");
    this.driverBubble.setAlpha(1);
    this.driver.setAlpha(highlightGo ? pulse : 1);
    this.driver.setTint(highlightGo ? Color.flash : 0xffffff);
    if (this.driver.input) this.driver.input.enabled = highlightGo;

    this.bagRack.setAlpha(next?.kind === "bagRack" ? tabletPulse : 1);
    this.bagRack.setTint(next?.kind === "bagRack" ? Color.flash : 0xffffff);
    this.bagRackLabel.setText(next?.kind === "bagRack" ? "Tap to pack" : "BAGS");
    this.bagRackLabel.setAlpha(1);
    this.bagRackLabel.setColor(Color.creamHex);

    this.tvs.forEach((tv, i) => {
      const sku = getSim().catalog.find((s) => s.id === this.jarSkus[i]);
      const wanted = this.jarSkus[i] === snap.highlightSkuId;
      tv.setFillStyle(sku?.color ?? 0x122018, wanted ? pulse : 0.35);
      if (wanted) tv.setStrokeStyle(3, Color.lime, 0.95);
      else tv.setStrokeStyle(0);
    });
    this.tvLabels.forEach((label) => {
      label.setColor(Color.creamHex);
      label.setAlpha(1);
    });

    const walkIn = snap.orders.find((o) => o.type === "inStore");
    if (walkIn) {
      this.counterPrompt
        .setVisible(true)
        .setText(
          snap.handSkuId === walkIn.skuId
            ? `Tap ${walkIn.customerName}\nto hand over ${walkIn.skuName}`
            : `${walkIn.customerName} at the counter\nwants ${walkIn.skuName}`,
        );
    } else {
      this.counterPrompt.setVisible(false);
    }

    this.syncTablet(snap, tabletPulse, next?.kind === "tablet");
    this.syncCustomers(snap.customers, pulse, next?.kind === "customer" ? next.orderId : null);
    this.syncOutgoing(snap);
  }

  private departNow(): void {
    if (!getSim().hitTheRoad()) return;
    this.scene.sleep("shop");
    if (this.scene.isSleeping("drive")) this.scene.wake("drive");
    else if (!this.scene.isActive("drive")) this.scene.launch("drive");
    this.scene.bringToTop("hud");
  }

  private syncTablet(snap: SimSnapshot, pulse: number, flash: boolean): void {
    const tab = tabletLayout();
    const hasTicket = !!snap.tabletTicket || snap.tabletQueueCount > 0;
    this.tabletScreen.clear();
    this.tabletScreen.fillStyle(Color.screen, 1);
    this.tabletScreen.fillRect(tab.screenLeft, tab.screenTop, tab.screenW, tab.screenH - tab.homeH);
    if (flash) {
      this.tabletScreen.fillStyle(0x3d7a45, pulse);
      this.tabletScreen.fillRect(tab.screenLeft, tab.screenTop, tab.screenW, tab.screenH - tab.homeH);
    } else if (hasTicket) {
      this.tabletScreen.fillStyle(0x1a3a22, 1);
      this.tabletScreen.fillRect(tab.screenLeft, tab.screenTop, tab.screenW, tab.screenH - tab.homeH);
    }
    this.tabletLabel.setText("ORDERS");
    this.tabletLabel.setAlpha(1);
    this.tabletLabel.setColor(Color.creamHex);
    fitTypeToWidth(this.tabletLabel, tab.screenW - 16);
    const count = snap.tabletQueueCount;
    this.queueBadge.setVisible(count > 1);
    this.queueBadge.setText(String(count));
  }

  private syncOutgoing(snap: SimSnapshot): void {
    const ready = snap.orders.filter((o) => isPackedOnCounter(o));
    const ids = new Set(ready.map((o) => o.id));
    for (const [id, objs] of this.outBags) {
      if (!ids.has(id)) {
        for (const obj of objs) obj.destroy();
        this.outBags.delete(id);
      }
    }
    ready.forEach((o, i) => {
      const x = OUT_BAG_RIGHT - i * OUT_BAG_GAP;
      const y = COUNTER_TOP;
      let objs = this.outBags.get(o.id);
      if (!objs) {
        const bag = this.add.image(x, y, "tex-bag").setOrigin(0.5, 1).setScale(BAG_SCALE).setDepth(8);
        const label = addUiText(this, x, bagCaptionY(y), outgoingBagText(o), {
          size: Type.caption,
          color: Color.inkHex,
          backgroundColor: Color.creamHex,
          padding: { x: 5, y: 2 },
          align: "center",
          fontStyle: "600",
          maxWidth: OUT_BAG_GAP - 16,
          maxHeight: 64,
        })
          .setOrigin(0.5)
          .setDepth(9);
        objs = [bag, label];
        this.outBags.set(o.id, objs);
      }
      (objs[0] as Phaser.GameObjects.Image).setPosition(x, y);
      const label = objs[1] as Phaser.GameObjects.Text;
      label.setPosition(x, bagCaptionY(y));
      label.setText(outgoingBagText(o));
      label.setColor(o.type === "delivery" && isSlaUrgent(o.slaRemainingMs) ? Color.dangerHex : Color.inkHex);
      fitTypeToWidth(label, OUT_BAG_GAP - 16);
    });
  }

  private syncCustomers(list: CustomerView[], pulse: number, focusId: string | null): void {
    const seen = new Set(list.map((c) => c.orderId));
    for (const [id, sprite] of this.customers) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.customers.delete(id);
        this.bubbles.get(id)?.destroy();
        this.bubbles.delete(id);
      }
    }
    for (const customer of list) {
      let sprite = this.customers.get(customer.orderId);
      if (!sprite) {
        sprite = this.add.image(customer.x, CUSTOMER_SPOT.y, "tex-customer").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(5);
        enableItemHit(sprite);
        sprite.on("pointerdown", () => getSim().shopClick({ type: "customer", orderId: customer.orderId }));
        wireHover(sprite);
        this.customers.set(customer.orderId, sprite);
        const bubble = addUiText(this, customer.x + CUSTOMER_BUBBLE_DX, CUSTOMER_BUBBLE_Y, "", {
          size: Type.body,
          color: Color.inkHex,
          backgroundColor: Color.creamHex,
          padding: { x: 10, y: 6 },
          align: "center",
          fontStyle: "600",
          maxWidth: 280,
          maxHeight: 80,
        })
          .setOrigin(0.5)
          .setDepth(7);
        this.bubbles.set(customer.orderId, bubble);
      }
      const focus = customer.orderId === focusId;
      sprite.setPosition(customer.x, CUSTOMER_SPOT.y);
      sprite.setAlpha(focus ? pulse : 1);
      sprite.setTint(focus ? Color.flash : 0xffffff);
      const bubble = this.bubbles.get(customer.orderId);
      bubble
        ?.setPosition(customer.x + CUSTOMER_BUBBLE_DX, CUSTOMER_BUBBLE_Y)
        .setText(customer.bubble)
        .setAlpha(1);
      if (bubble && focus) {
        bubble.setBackgroundColor(Color.limeHex);
        bubble.setColor(Color.inkHex);
      } else if (bubble) {
        bubble.setBackgroundColor(Color.creamHex);
        bubble.setColor(Color.inkHex);
      }
    }
  }

  private makeHotspots(): void {
    const sim = getSim();
    sim.catalog.forEach((sku, i) => {
      const p = strainPos(i);
      const slotH = strainSlotH();
      const glassW = TV_W - TV_BEZEL * 2;
      const screen = this.add.rectangle(p.x, p.y, glassW - 8, slotH - 4, sku.color, 0.35).setDepth(5);
      enableItemHit(screen);
      screen.on("pointerdown", () => getSim().shopClick({ type: "strain", skuId: sku.id }));
      this.tvs.push(screen);
      this.jarSkus.push(sku.id);
      const maxW = glassW - 16;
      const maxH = slotH - 8;
      const label = addUiText(this, p.x, p.y, sku.name, {
        size: Type.heading,
        color: Color.creamHex,
        align: "center",
        fontStyle: "700",
        lineSpacing: 0,
        strokeThickness: 0,
        maxWidth: maxW,
        maxHeight: maxH,
      })
        .setOrigin(0.5)
        .setDepth(6);
      this.tvLabels.push(label);
    });
  }
}

function outgoingBagText(o: OrderView): string {
  if (o.type === "delivery") return deliveryBagLabel(o.destLabel, o.customerName, o.slaRemainingMs);
  return `${o.destLabel}\n${o.customerName}`;
}
