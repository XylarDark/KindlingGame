import Phaser from "phaser";
import { drawShopCounter, drawShopInterior } from "../art/shopInterior";
import {
  BAG_STACK,
  BAG_SCALE,
  COUNTER_RIGHT,
  CUSTOMER_SPOT,
  CUSTOMER_BUBBLE_Y,
  DRIVER,
  FLOOR_Y,
  KEYLEAD,
  PACK_SPOT,
  PEOPLE_SCALE,
  RECEIPT_SPOT,
  TABLET,
  TV_W,
  strainPos,
  strainSlotH,
  tabletLayout,
} from "../maps/shopT0";
import { getSim } from "../session";
import type { CustomerView, OrderView, SimSnapshot } from "../sim/gameSim";
import { wireHover } from "../ui/chrome";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";

export class ShopScene extends Phaser.Scene {
  private keyLead!: Phaser.GameObjects.Image;
  private driver!: Phaser.GameObjects.Image;
  private packBag!: Phaser.GameObjects.Image;
  private bagLabel!: Phaser.GameObjects.Text;
  private receipt!: Phaser.GameObjects.Image;
  private receiptText!: Phaser.GameObjects.Text;
  private tabletEmpty!: Phaser.GameObjects.Text;
  private ticketRows: Phaser.GameObjects.Container[] = [];
  private counterPrompt!: Phaser.GameObjects.Text;
  private customers = new Map<string, Phaser.GameObjects.Image>();
  private bubbles = new Map<string, Phaser.GameObjects.Text>();
  private outBags = new Map<string, Phaser.GameObjects.GameObject[]>();
  private tvs: Phaser.GameObjects.Rectangle[] = [];
  private tvLabels: Phaser.GameObjects.Text[] = [];
  private jarSkus: string[] = [];

  constructor() {
    super("shop");
  }

  create(): void {
    this.input.setTopOnly(false);
    drawShopInterior(this);
    this.makeHotspots();

    this.add.image(BAG_STACK.x, BAG_STACK.y, "tex-bag").setOrigin(0.5, 1).setScale(BAG_SCALE).setDepth(8);

    this.keyLead = this.add
      .image(KEYLEAD.x, KEYLEAD.y, "tex-keylead")
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5);
    drawShopCounter(this);

    const tab = tabletLayout();
    const screen = this.add.graphics().setDepth(8);
    screen.fillStyle(Color.screen);
    screen.fillRect(tab.screenLeft, tab.screenTop, tab.screenW, tab.screenH);
    screen.fillStyle(Color.woodLight);
    screen.fillRect(tab.screenLeft, tab.screenTop, tab.screenW, tab.headerH);

    addUiText(this, TABLET.x, tab.screenTop + tab.headerH / 2, "ORDERS", {
      size: Type.heading,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    })
      .setOrigin(0.5)
      .setDepth(9);

    this.driver = this.add
      .image(DRIVER.x, DRIVER.y, "tex-driver-sit")
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5);

    this.packBag = this.add
      .image(PACK_SPOT.x, PACK_SPOT.y, "tex-bag")
      .setOrigin(0.5, 1)
      .setScale(BAG_SCALE)
      .setDepth(8)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.packBag.on("pointerdown", () => getSim().shopClick({ type: "counterBag" }));
    wireHover(this.packBag);
    this.bagLabel = addUiText(this, PACK_SPOT.x, PACK_SPOT.y - Math.round(120 * BAG_SCALE) - 16, "", {
      size: Type.caption,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 6, y: 3 },
      fontStyle: "600",
    })
      .setOrigin(0.5)
      .setDepth(9)
      .setVisible(false);

    this.receipt = this.add
      .image(RECEIPT_SPOT.x, RECEIPT_SPOT.y, "tex-receipt")
      .setOrigin(0.5, 1)
      .setDepth(9)
      .setVisible(false)
      .setInteractive({ useHandCursor: true });
    this.receipt.on("pointerdown", () => getSim().shopClick({ type: "receipt" }));
    wireHover(this.receipt);
    this.receiptText = addUiText(this, RECEIPT_SPOT.x, RECEIPT_SPOT.y - 108, "", {
      size: Type.caption,
      color: Color.inkHex,
      backgroundColor: Color.creamHex,
      padding: { x: 8, y: 4 },
      align: "center",
      fontStyle: "600",
    })
      .setOrigin(0.5)
      .setDepth(10)
      .setVisible(false);

    this.counterPrompt = addUiText(this, CUSTOMER_SPOT.x, 720, "", {
      size: Type.body,
      color: Color.inkHex,
      backgroundColor: Color.limeHex,
      padding: { x: 12, y: 8 },
      align: "center",
      fontStyle: "700",
    })
      .setOrigin(0.5)
      .setDepth(8)
      .setVisible(false);

    this.tabletEmpty = addUiText(this, TABLET.x, tab.screenTop + tab.headerH + (tab.screenH - tab.headerH) / 2, "", {
      size: Type.caption,
      color: Color.creamHex,
      align: "center",
      wordWrap: { width: tab.screenW - 28 },
      fontStyle: "600",
      strokeThickness: 0,
      lineSpacing: 8,
    })
      .setOrigin(0.5)
      .setDepth(9);
  }

  update(): void {
    this.sync(getSim().snapshot());
  }

  private sync(snap: SimSnapshot): void {
    this.driver.setVisible(snap.playerRole === "keyLead");
    this.keyLead.setVisible(snap.keyLead.visible && snap.playerRole === "keyLead");
    this.keyLead.setPosition(snap.keyLead.x, snap.keyLead.y);

    this.packBag.setVisible(!!snap.counterBag);
    if (snap.counterBag?.customerName) {
      this.bagLabel.setVisible(true).setText(snap.counterBag.hasItem ? snap.counterBag.customerName : "empty");
    } else {
      this.bagLabel.setVisible(false);
    }
    this.packBag.setAlpha(snap.counterBag?.hasItem ? 1 : 0.85);

    const showReceipt = !!snap.receipt && !snap.receipt.held;
    this.receipt.setVisible(showReceipt);
    this.receiptText.setVisible(showReceipt);
    if (snap.receipt && showReceipt) {
      this.receiptText.setText(`${snap.receipt.destLabel}\n${snap.receipt.customerName}\n${snap.receipt.skuName}`);
    }

    const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(snap.gameMs / 420));
    this.tvs.forEach((tv, i) => {
      const sku = this.jarSkus[i];
      const wanted = sku === snap.highlightSkuId;
      tv.setFillStyle(wanted ? 0x3d7a45 : 0x122018, wanted ? pulse : 0.95);
    });
    this.tvLabels.forEach((label, i) => {
      label.setColor(this.jarSkus[i] === snap.highlightSkuId ? Color.limeHex : Color.creamHex);
    });

    const walkIn = snap.orders.find((o) => o.type === "inStore");
    if (walkIn) {
      this.counterPrompt
        .setVisible(true)
        .setText(
          snap.handSkuId === walkIn.skuId
            ? `TAP ${walkIn.customerName.toUpperCase()}\nto hand over ${walkIn.skuName}`
            : `${walkIn.customerName} at the counter\nwants ${walkIn.skuName}`,
        );
    } else {
      this.counterPrompt.setVisible(false);
    }

    this.syncTablet(snap, pulse);
    this.syncCustomers(snap.customers);
    this.syncOutgoing(snap);
  }

  private syncTablet(snap: SimSnapshot, pulse: number): void {
    const tickets = snap.orders.filter((o) => o.type !== "inStore").slice(0, 4);
    this.tabletEmpty.setVisible(tickets.length === 0);
    this.tabletEmpty.setText(tickets.length === 0 ? "No pickup or delivery\nWalk-ins use the counter" : "");

    while (this.ticketRows.length > tickets.length) {
      this.ticketRows.pop()?.destroy();
    }
    tickets.forEach((order, i) => {
      const row = this.ticketRows[i] ?? this.makeTicketRow();
      if (!this.ticketRows[i]) this.ticketRows[i] = row;
      this.paintTicketRow(row, order, order.id === snap.selectedOrderId, i, pulse);
    });
  }

  private makeTicketRow(): Phaser.GameObjects.Container {
    const bg = this.add.graphics();
    const dest = addUiText(this, 12, 4, "", {
      size: Type.body,
      color: Color.creamHex,
      fontStyle: "700",
      strokeThickness: 0,
    });
    const sku = addUiText(this, 12, 22, "", {
      size: Type.caption,
      color: Color.limeHex,
      fontStyle: "600",
      strokeThickness: 0,
    });
    const row = this.add.container(0, 0, [bg, dest, sku]).setDepth(9);
    row.on("pointerdown", () => {
      const id = row.getData("orderId") as string | undefined;
      if (id) getSim().shopClick({ type: "tablet", orderId: id });
    });
    return row;
  }

  private paintTicketRow(
    row: Phaser.GameObjects.Container,
    order: OrderView,
    selected: boolean,
    index: number,
    pulse: number,
  ): void {
    const tab = tabletLayout();
    const rowW = tab.screenW - 16;
    const listH = tab.screenH - tab.headerH - 10;
    const rowH = Math.floor(listH / 4);
    row.setPosition(tab.screenLeft + 8, tab.screenTop + tab.headerH + 6 + index * rowH);
    row.setSize(rowW, rowH - 6);
    row.setData("orderId", order.id);
    row.setInteractive(new Phaser.Geom.Rectangle(0, 0, rowW, rowH - 6), Phaser.Geom.Rectangle.Contains);
    if (row.input) row.input.cursor = "pointer";

    const waiting = order.status === "queued";
    const bg = row.getAt(0) as Phaser.GameObjects.Graphics;
    const dest = row.getAt(1) as Phaser.GameObjects.Text;
    const sku = row.getAt(2) as Phaser.GameObjects.Text;
    bg.clear();
    if (selected) bg.fillStyle(Color.lime, 1);
    else if (waiting) bg.fillStyle(0x2a5a32, pulse);
    else bg.fillStyle(0x1a3320, 1);
    bg.fillRect(0, 0, rowW, rowH - 6);

    dest.setColor(selected ? Color.inkHex : Color.creamHex);
    dest.setText(`${order.destLabel}  ·  ${order.customerName}`);
    dest.setWordWrapWidth(rowW - 28, true);
    sku.setColor(selected ? Color.inkHex : Color.limeHex);
    sku.setText(order.skuName);
    sku.setWordWrapWidth(rowW - 28, true);
  }

  private syncOutgoing(snap: SimSnapshot): void {
    const ready = snap.orders.filter((o) => o.status === "inBin");
    const ids = new Set(ready.map((o) => o.id));
    for (const [id, objs] of this.outBags) {
      if (!ids.has(id)) {
        for (const obj of objs) obj.destroy();
        this.outBags.delete(id);
      }
    }
    ready.forEach((o, i) => {
      const x = COUNTER_RIGHT + 36 + (i % 2) * 58;
      const y = FLOOR_Y + 90 + Math.floor(i / 2) * 70;
      let objs = this.outBags.get(o.id);
      if (!objs) {
        const bag = this.add.image(x, y, "tex-bag").setOrigin(0.5, 1).setScale(BAG_SCALE).setDepth(4);
        const label = addUiText(this, x, y - Math.round(120 * BAG_SCALE) - 8, `${o.destLabel}\n${o.customerName}`, {
          size: Type.caption,
          color: Color.inkHex,
          backgroundColor: Color.creamHex,
          padding: { x: 5, y: 2 },
          align: "center",
          fontStyle: "600",
        })
          .setOrigin(0.5)
          .setDepth(5);
        objs = [bag, label];
        this.outBags.set(o.id, objs);
      }
      (objs[0] as Phaser.GameObjects.Image).setPosition(x, y);
      (objs[1] as Phaser.GameObjects.Text).setPosition(x, y - Math.round(120 * BAG_SCALE) - 8);
    });
  }

  private syncCustomers(list: CustomerView[]): void {
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
        sprite = this.add
          .image(customer.x, CUSTOMER_SPOT.y, "tex-customer")
          .setOrigin(0.5, 1)
          .setScale(PEOPLE_SCALE)
          .setDepth(5)
          .setInteractive({ useHandCursor: true });
        sprite.on("pointerdown", () => getSim().shopClick({ type: "customer", orderId: customer.orderId }));
        wireHover(sprite);
        this.customers.set(customer.orderId, sprite);
        const bubble = addUiText(this, customer.x, CUSTOMER_BUBBLE_Y, "", {
          size: Type.body,
          color: Color.inkHex,
          backgroundColor: Color.creamHex,
          padding: { x: 10, y: 6 },
          align: "center",
          fontStyle: "600",
        })
          .setOrigin(0.5)
          .setDepth(7);
        this.bubbles.set(customer.orderId, bubble);
      }
      sprite.setPosition(customer.x, CUSTOMER_SPOT.y);
      this.bubbles.get(customer.orderId)?.setPosition(customer.x, CUSTOMER_BUBBLE_Y).setText(customer.bubble);
    }
  }

  private makeHotspots(): void {
    const bagHit = this.add
      .rectangle(BAG_STACK.x, BAG_STACK.y - Math.round(60 * BAG_SCALE), Math.round(96 * BAG_SCALE), Math.round(120 * BAG_SCALE), 0x000000, 0.001)
      .setDepth(8)
      .setInteractive({ useHandCursor: true });
    bagHit.on("pointerdown", () => getSim().shopClick({ type: "bagRack" }));

    const sim = getSim();
    sim.catalog.forEach((sku, i) => {
      const p = strainPos(i);
      const slotH = strainSlotH();
      const screen = this.add
        .rectangle(p.x, p.y, TV_W - 12, slotH - 4, sku.color, 0.35)
        .setDepth(5)
        .setInteractive({ useHandCursor: true });
      screen.on("pointerdown", () => getSim().shopClick({ type: "strain", skuId: sku.id }));
      this.tvs.push(screen);
      this.jarSkus.push(sku.id);
      const label = addUiText(this, p.x, p.y, sku.name, {
        size: Type.caption,
        color: Color.creamHex,
        align: "center",
        wordWrap: { width: TV_W - 20 },
        fontStyle: "700",
        lineSpacing: 0,
      })
        .setOrigin(0.5)
        .setDepth(6);
      this.tvLabels.push(label);
    });
  }
}
