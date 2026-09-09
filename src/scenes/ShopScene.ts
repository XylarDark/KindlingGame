import Phaser from "phaser";
import { customerTextureKey } from "../art/people";
import { drawReceiptRail } from "../art/receiptRail";
import { shopGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, type DayNightPipeline } from "../art/dayNightPipeline";
import { drawShopCounter, drawShopInterior, paintShopDayNight, paintWindowGlow } from "../art/shopInterior";
import {
  BAG_PANEL,
  BAG_STACK,
  CUSTOMER_SPOT,
  CUSTOMER_SPEECH_GAP,
  CUSTOMER_SPEECH_H,
  CUSTOMER_SPEECH_MAX_W,
  customerSlotX,
  customerSpeechShows,
  layoutCustomerSpeech,
  DRIVER,
  KEYLEAD,
  PICKUP_BAG,
  READY_BAG,
  RECEIPT_RAIL,
  RECEIPT_SPOT,
  receiptRailBox,
  receiptRowY,
  PEOPLE_SCALE,
  PERSON_DISPLAY_H,
  TABLET,
  TABLET_H,
  TABLET_W,
  TV_BEZEL,
  TV_W,
  ceilingPots,
  strainPos,
  strainSlotH,
  tabletLayout,
} from "../maps/shopT0";
import { enableItemHit } from "../input/hit";
import { getSim } from "../session";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import type { CustomerView, SimSnapshot } from "../sim/gameSim";
import { nextShopHint } from "../sim/tutorialHints";
import { driverReadyCopy } from "../ui/copy";
import { readyTally, receiptSlips } from "../ui/receipts";
import { wireHover } from "../ui/chrome";
import { addSignText, setSignAccent } from "../ui/signText";
import { addUiText } from "../ui/text";
import { fitTypeToBox } from "../ui/typekit";
import {
  Color,
  MSG_MIN_CSS_PX,
  HUD_CHROME_MIN_CSS_PX,
  scaleChromePx,
  scaleMsgBox,
  scaleMsgPad,
  scaleMsgPx,
  Type,
} from "../ui/theme";
import { HUD_SCORE_PX } from "./HudScene";

/**
 * Strain names on the wall screens run 21% over the heading step.
 * TODO(mobile-text): tier TV board names onto the chrome/mobile ramp once box
 * budgets are verified — skipping blind scale in this first readability slice.
 */
const TV_LABEL_PX = "24.2px";

/**
 * ORDERS is specified as "the same size as the score", so it is seeded from the score's
 * own constant rather than a copy of the number. The tablet screen cannot actually hold
 * 44px of it — see `TABLET_LABEL_INSET` — and `fitTypeToBox` only ever shrinks, so the
 * rendered size is the largest that fits and is measured in-browser, never assumed.
 */
const TABLET_LABEL_PX = HUD_SCORE_PX;
/**
 * The label used to sit in a box inset 8px a side inside the screen. At caption size
 * that slack was invisible; against a 44px seed it costs real type size, so the box is
 * now the screen minus a hairline that keeps the glyphs off the bezel.
 */
const TABLET_LABEL_INSET = 4;

/**
 * Customer / driver action messages: prior +20% over body, then the shared
 * {@link scaleMsgPx} bump (+25%, plus mobile ramp / CSS floors when the contain
 * stage is small). Lazy so create() sees the shell's published stage scale.
 */
const msgPx = (): string => scaleMsgPx(19.2);
const msgPad = (): { x: number; y: number } => scaleMsgPad({ x: 12, y: 7 });
const msgNoticePx = (): string => scaleMsgPx(13);
const msgNoticePad = (): { x: number; y: number } => scaleMsgPad({ x: 10, y: 5 });
const feedbackH = (): number => scaleMsgBox(48);

/**
 * Hang a chip in the air above a model's head, measuring off what it rendered rather than
 * off a guessed centre offset. A box grows downward from its middle as its copy wraps, so
 * a fixed offset that clears a one-line callout puts a two-line one across the face — the
 * key lead's hat is where that showed.
 */
function hangAboveHead(chip: Phaser.GameObjects.Text, model: Phaser.GameObjects.Image): void {
  chip.setY(model.getBounds().y - CUSTOMER_SPEECH_GAP - chip.height / 2);
}

export class ShopScene extends Phaser.Scene {
  private keyLead!: Phaser.GameObjects.Image;
  private driver!: Phaser.GameObjects.Image;
  private bagRack!: Phaser.GameObjects.Image;
  private tabletScreen!: Phaser.GameObjects.Graphics;
  private tabletHit!: Phaser.GameObjects.Rectangle;
  private tabletLabel!: Phaser.GameObjects.Text;
  private queueBadge!: Phaser.GameObjects.Text;
  private keyLeadBubble!: Phaser.GameObjects.Text;
  private driverBubble!: Phaser.GameObjects.Text;
  private customers = new Map<string, Phaser.GameObjects.Image>();
  private bubbles = new Map<string, Phaser.GameObjects.Text>();
  private feedbackChips = new Map<string, Phaser.GameObjects.Text>();
  private targetCallout!: Phaser.GameObjects.Text;
  private readyBag!: Phaser.GameObjects.Image;
  private readyCount!: Phaser.GameObjects.Text;
  private pickupBag!: Phaser.GameObjects.Image;
  private pickupCount!: Phaser.GameObjects.Text;
  private receiptSlip!: Phaser.GameObjects.Image;
  private receiptRail!: Phaser.GameObjects.Graphics;
  private receiptRows: Phaser.GameObjects.Text[] = [];
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

    this.bagRack = this.add.image(BAG_STACK.x, BAG_STACK.y, "tex-bag-bags").setOrigin(0.5, 1).setDepth(8);
    enableItemHit(this.bagRack);
    this.bagRack.on("pointerdown", () => getSim().shopClick({ type: "bagRack" }));

    this.keyLead = this.add
      .image(KEYLEAD.x, KEYLEAD.y, "tex-keylead")
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5);
    drawShopCounter(this);
    this.makeReadyBoard();

    const tab = tabletLayout();
    this.tabletScreen = this.add.graphics().setDepth(10);
    this.tabletLabel = addUiText(this, TABLET.x, tab.screenTop + tab.screenH / 2, "ORDERS", {
      size: scaleChromePx(TABLET_LABEL_PX),
      color: Color.creamHex,
      fontStyle: "700",
      // Caps tracking would spend 8% of a 144px screen on the gaps between six letters.
      // The word is short enough to read without it, and the size is worth more here.
      letterSpacing: 0,
      noWrap: true,
      strokeThickness: 0,
      minCssFloor: HUD_CHROME_MIN_CSS_PX,
      maxWidth: tab.screenW - TABLET_LABEL_INSET * 2,
      maxHeight: tab.screenH - TABLET_LABEL_INSET * 2,
    })
      .setOrigin(0.5)
      .setDepth(11);

    this.tabletHit = this.add.rectangle(TABLET.x, TABLET.y, TABLET_W, TABLET_H, 0x000000, 0.001).setDepth(12);
    enableItemHit(this.tabletHit);
    this.tabletHit.on("pointerdown", () => {
      const ticket = getSim().snapshot().tabletTicket;
      if (ticket) getSim().shopClick({ type: "tablet", orderId: ticket.id });
    });
    wireHover(this.tabletHit);

    this.queueBadge = addSignText(this, tab.left + tab.w - 10, tab.top + 10, "", {
      size: Type.caption,
      padding: { x: 6, y: 2 },
      fontStyle: "700",
      maxWidth: 48,
      maxHeight: 28,
    })
      .setOrigin(0.5)
      .setDepth(13)
      .setVisible(false);

    this.targetCallout = addSignText(this, 0, 0, "", {
      size: msgNoticePx(),
      padding: msgNoticePad(),
      align: "center",
      fontStyle: "700",
      accent: Color.danger,
      minCssFloor: MSG_MIN_CSS_PX,
      maxWidth: scaleMsgBox(200),
      maxHeight: scaleMsgBox(44),
    })
      .setOrigin(0.5, 1)
      .setDepth(14)
      .setVisible(false);

    this.keyLeadBubble = addSignText(this, KEYLEAD.x - 168, KEYLEAD.y - PERSON_DISPLAY_H - 24, "", {
      size: msgPx(),
      padding: msgPad(),
      align: "center",
      fontStyle: "600",
      minCssFloor: MSG_MIN_CSS_PX,
      maxWidth: scaleMsgBox(340),
      maxHeight: scaleMsgBox(104),
    })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false);

    this.driver = this.add.image(DRIVER.x, DRIVER.y, "tex-driver-sit").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(10);
    enableItemHit(this.driver);
    this.driver.on("pointerdown", () => this.departNow());
    wireHover(this.driver);

    this.driverBubble = addSignText(this, DRIVER.x - 24, DRIVER.y - PERSON_DISPLAY_H - 8, "", {
      size: msgPx(),
      padding: msgPad(),
      align: "center",
      fontStyle: "600",
      minCssFloor: MSG_MIN_CSS_PX,
      maxWidth: scaleMsgBox(336),
      maxHeight: scaleMsgBox(124),
    })
      .setOrigin(1, 1)
      .setDepth(12)
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
      .setX(snap.keyLead.x - 168);
    hangAboveHead(this.keyLeadBubble, this.keyLead);

    const next = nextShopHint(snap);
    const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(snap.gameMs / 420));
    const tabletPulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(snap.gameMs / 160));
    const highlightGo = next?.kind === "hitTheRoad";
    const readyLine = driverReadyCopy(snap.bagsInBin.length);
    const driverLine = highlightGo ? (snap.driverLine ?? readyLine) : null;
    this.driverBubble.setVisible(!!driverLine && snap.playerRole === "keyLead").setText(driverLine ?? "");
    this.driverBubble.setAlpha(1);
    hangAboveHead(this.driverBubble, this.driver);
    this.driver.setAlpha(highlightGo ? pulse : 1);
    this.driver.setTint(highlightGo ? Color.flash : 0xffffff);
    if (this.driver.input) this.driver.input.enabled = highlightGo;

    // The prompt is printed on the bag's own panel, so it flashes with the sprite
    // instead of needing a chip held at full alpha above it.
    const packNext = next?.kind === "bagRack";
    this.bagRack.setTexture(packNext ? "tex-bag-pack" : "tex-bag-bags");
    this.bagRack.setAlpha(packNext ? tabletPulse : 1);
    this.bagRack.setTint(packNext ? Color.flash : 0xffffff);

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

    this.syncTablet(snap, tabletPulse, next?.kind === "tablet");
    this.syncTargetCallout(snap);
    this.syncCustomers(snap.customers, pulse, next?.kind === "customer" ? next.orderId : null);
    this.syncOutgoing(snap);
  }

  private syncTargetCallout(snap: SimSnapshot): void {
    const cue = snap.targetCallout;
    if (!cue || snap.playerRole !== "keyLead") {
      this.targetCallout.setVisible(false);
      return;
    }
    const idx = getSim().catalog.findIndex((s) => s.id === cue.skuId);
    if (idx < 0) {
      this.targetCallout.setVisible(false);
      return;
    }
    const p = strainPos(idx);
    this.targetCallout.setText(cue.text).setVisible(true);
    this.targetCallout.setPosition(p.x, p.y - strainSlotH() / 2 - 6);
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
    // The label is constant, and setText re-runs the whole shrink-to-fit loop — eleven
    // sizes now that it is seeded at the score's step — so it is set once at build time
    // rather than every frame. The old per-frame refit also re-narrowed the box to the
    // screen minus 16, which would have quietly undone TABLET_LABEL_INSET.
    this.tabletLabel.setAlpha(1);
    this.tabletLabel.setColor(Color.creamHex);
    const count = snap.tabletQueueCount;
    this.queueBadge.setVisible(count > 1);
    this.queueBadge.setText(String(count));
  }

  /**
   * Packed bags used to march one sprite and one chip per order across the whole
   * counter. Now two labelled bags stand at its right end — deliveries in front,
   * pickups behind — each printing its own count, and the slips stack on a rail
   * clipped to the counter face, oldest at the top and newest at the bottom.
   */
  private makeReadyBoard(): void {
    this.pickupBag = this.add
      .image(PICKUP_BAG.x, PICKUP_BAG.y, "tex-bag-pickup")
      .setOrigin(0.5, 1)
      .setDepth(7.8)
      .setVisible(false);
    this.pickupCount = this.bagCount(PICKUP_BAG, 7.9);
    this.readyBag = this.add
      .image(READY_BAG.x, READY_BAG.y, "tex-bag-delivery")
      .setOrigin(0.5, 1)
      .setDepth(8)
      .setVisible(false);
    this.readyCount = this.bagCount(READY_BAG, 8.1);
    this.receiptSlip = this.add
      .image(RECEIPT_SPOT.x, RECEIPT_SPOT.y, "tex-receipt")
      .setOrigin(0.5, 1)
      .setScale(0.8)
      .setDepth(8)
      .setVisible(false);

    this.receiptRail = this.add.graphics().setDepth(8);
    const box = receiptRailBox(RECEIPT_RAIL.maxRows);
    for (let i = 0; i < RECEIPT_RAIL.maxRows; i += 1) {
      this.receiptRows.push(
        addUiText(this, box.left + RECEIPT_RAIL.inset, receiptRowY(i), "", {
          size: Type.caption,
          color: Color.inkHex,
          fontStyle: "600",
          strokeThickness: 0,
          noWrap: true,
          maxWidth: RECEIPT_RAIL.w - RECEIPT_RAIL.inset - 10,
          maxHeight: RECEIPT_RAIL.rowH - 2,
        })
          .setOrigin(0, 0.5)
          .setDepth(9)
          .setVisible(false),
      );
    }
  }

  /** The count printed on a bag's label panel — the word under it is baked in. */
  private bagCount(spot: { x: number; y: number }, depth: number): Phaser.GameObjects.Text {
    return addUiText(this, spot.x, spot.y + BAG_PANEL.countCy, "", {
      size: Type.title,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      noWrap: true,
      maxWidth: BAG_PANEL.w - 8,
      maxHeight: BAG_PANEL.countH,
    })
      .setOrigin(0.5)
      .setDepth(depth)
      .setVisible(false);
  }

  private syncOutgoing(snap: SimSnapshot): void {
    const slips = receiptSlips(snap.orders, RECEIPT_RAIL.maxRows);
    const tally = readyTally(snap.orders);

    // Each bag shows only while it has something in it, so an all-pickup or
    // all-delivery counter reads as one bag rather than a zero next to a count.
    this.showBagCount(this.readyBag, this.readyCount, tally.delivery, tally.urgent);
    this.showBagCount(this.pickupBag, this.pickupCount, tally.pickup, false);
    this.receiptSlip.setVisible(tally.delivery + tally.pickup > 0);

    drawReceiptRail(this.receiptRail, slips.map((s) => ({ kind: s.kind, urgent: s.urgent })));
    this.receiptRows.forEach((row, i) => {
      const slip = slips[i];
      row.setVisible(!!slip);
      if (!slip) return;
      if (row.text !== slip.line) row.setText(slip.line);
      row.setColor(slip.urgent ? Color.dangerHex : Color.inkHex);
    });
  }

  private showBagCount(
    bag: Phaser.GameObjects.Image,
    count: Phaser.GameObjects.Text,
    value: number,
    urgent: boolean,
  ): void {
    bag.setVisible(value > 0);
    count.setVisible(value > 0);
    if (value === 0) return;
    const label = String(value);
    // setText refits the type box, so only pay for it when the count changes.
    if (count.text !== label) count.setText(label);
    count.setColor(urgent ? Color.dangerHex : Color.inkHex);
  }

  private syncCustomers(list: CustomerView[], pulse: number, focusId: string | null): void {
    const seen = new Set(list.map((c) => c.orderId));
    for (const [id, sprite] of this.customers) {
      if (!seen.has(id)) {
        sprite.destroy();
        this.customers.delete(id);
        this.bubbles.get(id)?.destroy();
        this.bubbles.delete(id);
        this.feedbackChips.get(id)?.destroy();
        this.feedbackChips.delete(id);
      }
    }

    // Place only settled speakers so walking-in chips do not jump every frame (R5).
    const settledList = list.filter(
      (c) => Math.abs(c.x - customerSlotX(c.slot)) < 1 && customerSpeechShows(true),
    );
    // Front-of-queue first keeps preferred right side for earlier arrivals.
    const ordered = [...settledList].sort((a, b) => a.slot - b.slot);
    const layouts = layoutCustomerSpeech(ordered.map((c) => ({ orderId: c.orderId, x: c.x })));
    const layoutById = new Map(layouts.map((box) => [box.orderId, box]));

    for (const customer of list) {
      let sprite = this.customers.get(customer.orderId);
      if (!sprite) {
        // One appearance per order, derived from the customer's identity — the same
        // person always walks in looking the same way.
        sprite = this.add
          .image(customer.x, CUSTOMER_SPOT.y, customerTextureKey(customer.look))
          .setOrigin(0.5, 1)
          .setScale(PEOPLE_SCALE)
          .setDepth(5);
        enableItemHit(sprite);
        sprite.on("pointerdown", () => getSim().shopClick({ type: "customer", orderId: customer.orderId }));
        wireHover(sprite);
        this.customers.set(customer.orderId, sprite);
        const bubble = addSignText(this, customer.x, CUSTOMER_SPOT.y - PERSON_DISPLAY_H, "", {
          size: msgPx(),
          padding: msgPad(),
          align: "center",
          fontStyle: "600",
          minCssFloor: MSG_MIN_CSS_PX,
      maxWidth: CUSTOMER_SPEECH_MAX_W,
          maxHeight: CUSTOMER_SPEECH_H,
        })
          .setOrigin(0.5)
          .setDepth(7);
        this.bubbles.set(customer.orderId, bubble);
        const feedback = addSignText(this, customer.x, CUSTOMER_SPOT.y - PERSON_DISPLAY_H, "", {
          size: msgNoticePx(),
          padding: msgNoticePad(),
          align: "center",
          fontStyle: "600",
          accent: Color.danger,
          minCssFloor: MSG_MIN_CSS_PX,
      maxWidth: CUSTOMER_SPEECH_MAX_W,
          maxHeight: feedbackH(),
        })
          .setOrigin(0.5)
          .setDepth(7)
          .setVisible(false);
        this.feedbackChips.set(customer.orderId, feedback);
      }
      const focus = customer.orderId === focusId;
      sprite.setPosition(customer.x, CUSTOMER_SPOT.y);
      sprite.setAlpha(focus ? pulse : 1);
      sprite.setTint(focus ? Color.flash : 0xffffff);
      const bubble = this.bubbles.get(customer.orderId);
      const feedback = this.feedbackChips.get(customer.orderId);
      const layout = layoutById.get(customer.orderId);
      if (bubble) {
        if (layout && customer.bubble) {
          bubble.setText(customer.bubble).setAlpha(1).setVisible(true);
          // Refit before measuring — side room is the layout's width budget.
          fitTypeToBox(bubble, layout.w, CUSTOMER_SPEECH_H);
          bubble.setPosition(layout.x, layout.y);
        } else {
          bubble.setVisible(false);
        }
        setSignAccent(bubble, focus ? Color.lime : undefined);
      }
      if (feedback) {
        const note = customer.feedback;
        if (layout && note) {
          feedback.setText(note).setVisible(true);
          fitTypeToBox(feedback, layout.w, feedbackH());
          feedback.setPosition(layout.x, layout.y + layout.h / 2 + CUSTOMER_SPEECH_GAP + feedback.height / 2);
        } else {
          feedback.setVisible(false);
        }
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
        size: TV_LABEL_PX,
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
