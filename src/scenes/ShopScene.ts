import Phaser from "phaser";
import { applyCrewTexture, applyPersonTexture, personImageKey } from "../art/peopleAtlas";
import { drawReceiptRail } from "../art/receiptRail";
import { shopGrade } from "../art/dayNightGrade";
import { applyDayNight, attachDayNight, dayNightFrom, type DayNightPipeline } from "../art/dayNightPipeline";
import { getRenderBudget, syncSceneRenderCamera } from "../ui/renderBudget";
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
import { ackTap, releaseTapAck } from "../input/tapAck";
import { getSim } from "../session";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { skyAt, skyVisualDirtyKey } from "../sim/dayNight";
import type { Sku } from "../sim/catalog";
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
  HUD_TYPE_FIT,
  MENU_TYPE_FIT,
  MSG_TYPE_FIT,
  scaleChromePx,
  scaleMsgBox,
  scaleMsgPad,
  scaleMsgPx,
  Type,
} from "../ui/theme";
import { HUD_SCORE_PX } from "./HudScene";

/**
 * Strain names on the wall screens run 21% over the heading step, then clamp-fit
 * against {@link MENU_TYPE_FIT} so a phone contain cannot drop them under the
 * menu CSS floor.
 */
const TV_LABEL_PX = "24.2px";

/**
 * ORDERS is specified as "the same size as the score", so it is seeded from the score's
 * own constant rather than a copy of the number. The tablet screen cannot actually hold
 * 44px of it — see `TABLET_LABEL_INSET` — and clamp-fit sizes down from the ceiling, so the
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

/** Concurrent customers the pool covers without mid-frame allocate (4 is typical peak). */
const CUSTOMER_VISUAL_POOL = 4;
const CUSTOMER_VISUAL_MAX = CUSTOMER_VISUAL_POOL;

type CustomerVisual = {
  sprite: Phaser.GameObjects.Image;
  bubble: Phaser.GameObjects.Text;
  feedback: Phaser.GameObjects.Text;
  orderId: string | null;
  /** Last look applied — applyPersonTexture only when this differs. */
  look: number;
  bubbleFitKey: string;
  feedbackFitKey: string;
};

/**
 * Top edge of a bottom-anchored person sprite without walking the display tree.
 * {@link Phaser.GameObjects.Components.GetBounds#getBounds} allocates a Rect every call —
 * paid every Shop frame during key-lead fetch when the bubble follows a moving sprite.
 */
function modelHeadTop(model: Phaser.GameObjects.Image): number {
  return model.y - model.displayHeight * model.originY;
}

/**
 * Hang a chip in the air above a model's head, measuring off displayHeight/origin rather than
 * getBounds. A box grows downward from its middle as its copy wraps, so a fixed offset that
 * clears a one-line callout puts a two-line one across the face — the key lead's hat is where
 * that showed. Recompute chip Y when text changes (height) or the model moves.
 */
function hangAboveHead(chip: Phaser.GameObjects.Text, model: Phaser.GameObjects.Image): void {
  chip.setY(modelHeadTop(model) - CUSTOMER_SPEECH_GAP - chip.height / 2);
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
  private customerPool: CustomerVisual[] = [];
  private customers = new Map<string, CustomerVisual>();
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
  private lastSkyKey = "";
  /** Catalog id → sku for TV fills (avoids catalog.find per TV per frame). */
  private skuById = new Map<string, Sku>();
  private lastTabletKey = "";
  /** Front tablet ticket id — cached during sync so pointerdown never snapshots. */
  private tabletTicketId: string | null = null;
  private lastReceiptKey = "";
  private lastTvKey = "";
  /** Ordered settled ids + quantized x — layoutCustomerSpeech only when this changes. */
  private lastCustomerLayoutKey = "";
  private customerLayoutById = new Map<string, ReturnType<typeof layoutCustomerSpeech>[number]>();
  private onPreRenderLighting = (): void => this.syncLighting(getSim().gameMs());
  /** Static shop Graphics/Text collapsed into RTs (Drive-style). */
  private shopBakeLayers: Phaser.GameObjects.RenderTexture[] = [];

  constructor() {
    super("shop");
  }

  create(): void {
    this.input.setTopOnly(false);
    syncSceneRenderCamera(this);
    const interiorBake = drawShopInterior(this);
    this.sky = this.add.graphics().setDepth(0.5);
    this.windowGlow = this.add.graphics().setDepth(3).setBlendMode(Phaser.BlendModes.ADD);
    const startMs = getSim().snapshot().gameMs;
    paintShopDayNight(this.sky, startMs);
    paintWindowGlow(this.windowGlow, startMs);
    this.lighting = attachDayNight(this.cameras.main);
    this.syncLighting(getSim().gameMs());
    this.events.on(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderLighting);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderLighting);
    });
    this.makeHotspots();
    this.warmCustomerPool();

    this.bagRack = this.add.image(BAG_STACK.x, BAG_STACK.y, "tex-bag-bags").setOrigin(0.5, 1).setDepth(8);
    enableItemHit(this.bagRack);
    this.wireShopTap(this.bagRack, 1, () => getSim().shopClick({ type: "bagRack" }));

    this.keyLead = this.add
      .image(KEYLEAD.x, KEYLEAD.y, "tex-keylead")
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5);
    applyCrewTexture(this.keyLead, "tex-keylead");
    const counterBake = drawShopCounter(this);
    this.bakeStaticShop(interiorBake.background, 0);
    this.bakeStaticShop(
      [...interiorBake.midground, counterBake.graphics, counterBake.plaqueMark],
      7,
    );
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
      ...HUD_TYPE_FIT,
      maxWidth: tab.screenW - TABLET_LABEL_INSET * 2,
      maxHeight: tab.screenH - TABLET_LABEL_INSET * 2,
    })
      .setOrigin(0.5)
      .setDepth(11);

    this.tabletHit = this.add.rectangle(TABLET.x, TABLET.y, TABLET_W, TABLET_H, 0x000000, 0.001).setDepth(12);
    enableItemHit(this.tabletHit);
    this.wireShopTap(this.tabletHit, 1, () => {
      if (this.tabletTicketId) getSim().shopClick({ type: "tablet", orderId: this.tabletTicketId });
    });
    wireHover(this.tabletHit);

    this.queueBadge = addSignText(this, tab.left + tab.w - 10, tab.top + 10, "", {
      size: Type.caption,
      padding: { x: 6, y: 2 },
      fontStyle: "700",
      ...MENU_TYPE_FIT,
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
      ...MSG_TYPE_FIT,
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
      ...MSG_TYPE_FIT,
      maxWidth: scaleMsgBox(340),
      maxHeight: scaleMsgBox(104),
    })
      .setOrigin(0.5)
      .setDepth(12)
      .setVisible(false);

    this.driver = this.add.image(DRIVER.x, DRIVER.y, "tex-driver-sit").setOrigin(0.5, 1).setScale(PEOPLE_SCALE).setDepth(10);
    applyCrewTexture(this.driver, "tex-driver-sit");
    enableItemHit(this.driver);
    this.wireShopTap(this.driver, PEOPLE_SCALE, () => this.departNow());
    wireHover(this.driver);

    this.driverBubble = addSignText(this, DRIVER.x - 24, DRIVER.y - PERSON_DISPLAY_H - 8, "", {
      size: msgPx(),
      padding: msgPad(),
      align: "center",
      fontStyle: "600",
      ...MSG_TYPE_FIT,
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
    if (!getRenderBudget().postFx) return;
    // Sleeping shop still renders behind drive/title — skip PostFX when inactive.
    if (!this.sys.isActive()) return;
    const pipe = this.lighting ?? dayNightFrom(this.cameras.main);
    this.lighting = pipe;
    if (Math.abs(gameMs - this.lastLightMs) < 80) return;
    this.lastLightMs = gameMs;
    applyDayNight(pipe, shopGrade(skyAt(gameMs), ceilingPots()), {
      x: 0,
      y: 0,
      width: GAME_WIDTH,
      height: GAME_HEIGHT,
    });
  }

  private sync(snap: SimSnapshot): void {
    const sky = skyAt(snap.gameMs);
    const skyKey = skyVisualDirtyKey(sky);
    if (skyKey !== this.lastSkyKey) {
      this.lastSkyKey = skyKey;
      paintShopDayNight(this.sky, snap.gameMs);
      paintWindowGlow(this.windowGlow, snap.gameMs);
    }
    // PostFX lives on PRE_RENDER; keep the 80ms throttle there only.
    this.driver.setVisible(snap.playerRole === "keyLead");
    this.keyLead.setVisible(snap.keyLead.visible && snap.playerRole === "keyLead");
    const kx = snap.keyLead.x;
    const ky = snap.keyLead.y;
    const leadMoved =
      Math.round(this.keyLead.x) !== Math.round(kx) || Math.round(this.keyLead.y) !== Math.round(ky);
    if (leadMoved) this.keyLead.setPosition(kx, ky);
    const callout = snap.keyLeadLine;
    const showKeyLeadBubble = !!callout && snap.keyLead.visible && snap.playerRole === "keyLead";
    this.keyLeadBubble.setVisible(showKeyLeadBubble);
    // setText refits typekit — only pay when the Grabbing line changes (not every walk frame).
    if (showKeyLeadBubble) {
      const textDirty = this.keyLeadBubble.text !== callout;
      if (textDirty) this.keyLeadBubble.setText(callout);
      const bx = kx - 168;
      if (Math.round(this.keyLeadBubble.x) !== Math.round(bx)) this.keyLeadBubble.setX(bx);
      // Bubble follows a walking sprite — update Y when the lead moves or copy refits.
      if (textDirty || leadMoved) hangAboveHead(this.keyLeadBubble, this.keyLead);
    }

    const next = nextShopHint(snap);
    const pulse = 0.62 + 0.38 * (0.5 + 0.5 * Math.sin(snap.gameMs / 420));
    const tabletPulse = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(snap.gameMs / 160));
    const highlightGo = next?.kind === "hitTheRoad";
    const readyLine = driverReadyCopy(snap.bagsInBin.length);
    const driverLine = highlightGo ? (snap.driverLine ?? readyLine) : null;
    const showDriverBubble = !!driverLine && snap.playerRole === "keyLead";
    this.driverBubble.setVisible(showDriverBubble);
    if (showDriverBubble) {
      const driverTextDirty = this.driverBubble.text !== driverLine;
      if (driverTextDirty) this.driverBubble.setText(driverLine);
      this.driverBubble.setAlpha(1);
      if (driverTextDirty) hangAboveHead(this.driverBubble, this.driver);
    }
    if (highlightGo) {
      this.driver.setAlpha(pulse);
      this.driver.setTint(Color.flash);
    } else if (this.driver.alpha !== 1 || this.driver.tintTopLeft !== 0xffffff) {
      this.driver.setAlpha(1);
      this.driver.clearTint();
    }
    if (this.driver.input) this.driver.input.enabled = highlightGo;

    // The prompt is printed on the bag's own panel, so it flashes with the sprite
    // instead of needing a chip held at full alpha above it.
    const packNext = next?.kind === "bagRack";
    const bagTex = packNext ? "tex-bag-pack" : "tex-bag-bags";
    if (this.bagRack.texture.key !== bagTex) this.bagRack.setTexture(bagTex);
    this.bagRack.setAlpha(packNext ? tabletPulse : 1);
    this.bagRack.setTint(packNext ? Color.flash : 0xffffff);

    // Quantize pulse so TV fills redraw ~8 bands/cycle instead of every frame.
    const tvPulseBand = snap.highlightSkuId ? Math.round(pulse * 8) : -1;
    const tvKey = `${snap.highlightSkuId ?? ""}:${tvPulseBand}`;
    if (tvKey !== this.lastTvKey) {
      this.lastTvKey = tvKey;
      this.tvs.forEach((tv, i) => {
        const skuId = this.jarSkus[i]!;
        const sku = this.skuById.get(skuId);
        const wanted = skuId === snap.highlightSkuId;
        tv.setFillStyle(sku?.color ?? 0x122018, wanted ? pulse : 0.35);
        if (wanted) tv.setStrokeStyle(3, Color.lime, 0.95);
        else tv.setStrokeStyle(0);
      });
    }

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
    const idx = this.jarSkus.indexOf(cue.skuId);
    if (idx < 0 || !this.skuById.has(cue.skuId)) {
      this.targetCallout.setVisible(false);
      return;
    }
    const p = strainPos(idx);
    if (this.targetCallout.text !== cue.text) this.targetCallout.setText(cue.text);
    this.targetCallout.setVisible(true);
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
    this.tabletTicketId = snap.tabletTicket?.id ?? null;
    const tab = tabletLayout();
    const hasTicket = !!snap.tabletTicket || snap.tabletQueueCount > 0;
    const count = snap.tabletQueueCount;
    // Quantize pulse so flash redraws ~8 bands/cycle instead of every frame.
    const pulseBand = flash ? Math.round(pulse * 8) : -1;
    const tabletKey = `${hasTicket ? 1 : 0}:${pulseBand}:${count}`;
    if (tabletKey !== this.lastTabletKey) {
      this.lastTabletKey = tabletKey;
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
    }
    // The label is constant, and setText re-runs the whole clamp-fit loop — eleven
    // sizes now that it is seeded at the score's step — so it is set once at build time
    // rather than every frame. The old per-frame refit also re-narrowed the box to the
    // screen minus 16, which would have quietly undone TABLET_LABEL_INSET.
    this.tabletLabel.setAlpha(1);
    this.tabletLabel.setColor(Color.creamHex);
    this.queueBadge.setVisible(count > 1);
    if (this.queueBadge.visible && this.queueBadge.text !== String(count)) {
      this.queueBadge.setText(String(count));
    }
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
          ...MENU_TYPE_FIT,
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
      ...MENU_TYPE_FIT,
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

    const railKey = slips.map((s) => `${s.kind}:${s.urgent ? 1 : 0}:${s.line}`).join("|");
    if (railKey !== this.lastReceiptKey) {
      this.lastReceiptKey = railKey;
      drawReceiptRail(this.receiptRail, slips.map((s) => ({ kind: s.kind, urgent: s.urgent })));
    }
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


  /**
   * Stamp non-moving shop Graphics/Text into one RenderTexture, then destroy
   * individuals — customers/keylead/hand/interactive stay live.
   */
  private bakeStaticShop(objects: Phaser.GameObjects.GameObject[], depth: number): void {
    if (objects.length === 0) return;
    const layers = [...objects].sort((a, b) => {
      const da = "depth" in a ? Number((a as { depth: number }).depth) : 0;
      const db = "depth" in b ? Number((b as { depth: number }).depth) : 0;
      return da - db;
    });
    const rt = this.add.renderTexture(0, 0, GAME_WIDTH, GAME_HEIGHT).setOrigin(0, 0).setDepth(depth);
    rt.beginDraw();
    for (const obj of layers) rt.batchDraw(obj);
    rt.endDraw();
    this.shopBakeLayers.push(rt);
    for (const obj of objects) obj.destroy();
  }

  private warmCustomerPool(): void {
    for (let i = 0; i < CUSTOMER_VISUAL_POOL; i++) {
      const visual = this.makeCustomerVisual();
      this.warmCustomerSpeech(visual);
      this.customerPool.push(visual);
    }
  }

  /** Boot warm under the loading gate — first walk-in must not raster + plaque on one frame. */
  private warmCustomerSpeech(visual: CustomerVisual): void {
    visual.bubble.setText("Welcome in!");
    visual.feedback.setText("Thanks!");
    visual.bubble.setVisible(true);
    visual.feedback.setVisible(true);
    visual.bubble.setVisible(false);
    visual.feedback.setVisible(false);
  }

  private makeCustomerVisual(): CustomerVisual {
    const stand = personImageKey("tex-customer-0");
    const sprite = this.add
      .image(-400, CUSTOMER_SPOT.y, stand.key, stand.frame)
      .setOrigin(0.5, 1)
      .setScale(PEOPLE_SCALE)
      .setDepth(5)
      .setVisible(false)
      .setActive(false);
    enableItemHit(sprite);
    this.wireShopTap(sprite, PEOPLE_SCALE, () => {
      const id = (sprite.getData("orderId") as string | undefined) ?? null;
      if (id) getSim().shopClick({ type: "customer", orderId: id });
    });
    wireHover(sprite);
    const bubble = addSignText(this, -400, CUSTOMER_SPOT.y - PERSON_DISPLAY_H, "", {
      size: msgPx(),
      padding: msgPad(),
      align: "center",
      fontStyle: "600",
      ...MSG_TYPE_FIT,
      maxWidth: CUSTOMER_SPEECH_MAX_W,
      maxHeight: CUSTOMER_SPEECH_H,
    })
      .setOrigin(0.5)
      .setDepth(7)
      .setVisible(false);
    const feedback = addSignText(this, -400, CUSTOMER_SPOT.y - PERSON_DISPLAY_H, "", {
      size: msgNoticePx(),
      padding: msgNoticePad(),
      align: "center",
      fontStyle: "600",
      accent: Color.danger,
      ...MSG_TYPE_FIT,
      maxWidth: CUSTOMER_SPEECH_MAX_W,
      maxHeight: feedbackH(),
    })
      .setOrigin(0.5)
      .setDepth(7)
      .setVisible(false);
    return { sprite, bubble, feedback, orderId: null, look: -1, bubbleFitKey: "", feedbackFitKey: "" };
  }

  private acquireCustomerVisual(orderId: string, look: number): CustomerVisual {
    let free = this.customerPool.find((v) => v.orderId == null);
    if (!free) {
      if (this.customerPool.length < CUSTOMER_VISUAL_MAX) {
        free = this.makeCustomerVisual();
        this.customerPool.push(free);
      } else {
        // All slots busy — recycle the oldest slot rather than grow PRE_RENDER listeners.
        free = this.customerPool[0]!;
        if (free.orderId) this.releaseCustomerVisual(free.orderId);
      }
    }
    free.orderId = orderId;
    free.sprite.setData("orderId", orderId);
    free.look = look;
    applyPersonTexture(free.sprite, look);
    free.bubbleFitKey = "";
    free.feedbackFitKey = "";
    free.sprite.setVisible(true).setActive(true);
    this.customers.set(orderId, free);
    return free;
  }

  private releaseCustomerVisual(orderId: string): void {
    const visual = this.customers.get(orderId);
    if (!visual) return;
    this.customers.delete(orderId);
    visual.orderId = null;
    visual.sprite.setData("orderId", null);
    visual.sprite.setVisible(false).setActive(false).clearTint().setAlpha(1);
    visual.bubble.setVisible(false);
    visual.feedback.setVisible(false);
    visual.look = -1;
    visual.bubbleFitKey = "";
    visual.feedbackFitKey = "";
  }

  private syncCustomers(list: CustomerView[], pulse: number, focusId: string | null): void {
    const seen = new Set(list.map((c) => c.orderId));
    for (const id of [...this.customers.keys()]) {
      if (!seen.has(id)) this.releaseCustomerVisual(id);
    }

    // Place only settled speakers so walking-in chips do not jump every frame (R5).
    const settledList = list.filter(
      (c) => Math.abs(c.x - customerSlotX(c.slot)) < 1 && customerSpeechShows(true),
    );
    // Front-of-queue first keeps preferred right side for earlier arrivals.
    const ordered = [...settledList].sort((a, b) => a.slot - b.slot);
    const layoutKey = ordered.map((c) => `${c.orderId}:${Math.round(c.x)}`).join("|");
    if (layoutKey !== this.lastCustomerLayoutKey) {
      this.lastCustomerLayoutKey = layoutKey;
      this.customerLayoutById = new Map(
        layoutCustomerSpeech(ordered.map((c) => ({ orderId: c.orderId, x: c.x }))).map((box) => [
          box.orderId,
          box,
        ]),
      );
    }

    for (const customer of list) {
      let visual = this.customers.get(customer.orderId);
      if (!visual) {
        visual = this.acquireCustomerVisual(customer.orderId, customer.look);
      } else if (visual.look !== customer.look) {
        visual.look = customer.look;
        applyPersonTexture(visual.sprite, customer.look);
      }
      const { sprite, bubble, feedback } = visual;
      const focus = customer.orderId === focusId;
      sprite.setPosition(customer.x, CUSTOMER_SPOT.y);
      if (focus) {
        sprite.setAlpha(pulse);
        sprite.setTint(Color.flash);
      } else if (sprite.alpha !== 1 || sprite.tintTopLeft !== 0xffffff) {
        sprite.setAlpha(1);
        sprite.clearTint();
      }
      const layout = this.customerLayoutById.get(customer.orderId);
      if (layout && customer.bubble) {
        bubble.setAlpha(1).setVisible(true);
        const layoutFitKey = String(layout.w);
        if (bubble.text !== customer.bubble) bubble.setText(customer.bubble);
        if (layoutFitKey !== visual.bubbleFitKey) {
          visual.bubbleFitKey = layoutFitKey;
          fitTypeToBox(bubble, layout.w, CUSTOMER_SPEECH_H);
        }
        bubble.setPosition(layout.x, layout.y);
      } else {
        visual.bubbleFitKey = "";
        bubble.setVisible(false);
      }
      setSignAccent(bubble, focus ? Color.lime : undefined);
      const note = customer.feedback;
      if (layout && note) {
        feedback.setVisible(true);
        const layoutFitKey = String(layout.w);
        if (feedback.text !== note) feedback.setText(note);
        if (layoutFitKey !== visual.feedbackFitKey) {
          visual.feedbackFitKey = layoutFitKey;
          fitTypeToBox(feedback, layout.w, feedbackH());
        }
        feedback.setPosition(layout.x, layout.y + layout.h / 2 + CUSTOMER_SPEECH_GAP + feedback.height / 2);
      } else {
        visual.feedbackFitKey = "";
        feedback.setVisible(false);
      }
    }
  }

  /** Same-frame press bump — ack first, sim on pointerdown; restore scale on release. */
  private wireShopTap(
    target: Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Transform,
    baseScale: number,
    onTap: () => void,
  ): void {
    target.on("pointerdown", () => {
      ackTap(target);
      onTap();
    });
    const release = (): void => releaseTapAck(target, baseScale, baseScale);
    target.on("pointerup", release);
    target.on("pointerupoutside", release);
  }

  private makeHotspots(): void {
    const sim = getSim();
    this.skuById = new Map(sim.catalog.map((s) => [s.id, s]));
    sim.catalog.forEach((sku, i) => {
      const p = strainPos(i);
      const slotH = strainSlotH();
      const glassW = TV_W - TV_BEZEL * 2;
      const screen = this.add.rectangle(p.x, p.y, glassW - 8, slotH - 4, sku.color, 0.35).setDepth(5);
      enableItemHit(screen);
      this.wireShopTap(screen, 1, () => getSim().shopClick({ type: "strain", skuId: sku.id }));
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
        ...MENU_TYPE_FIT,
        maxWidth: maxW,
        maxHeight: maxH,
      })
        .setOrigin(0.5)
        .setDepth(6);
      this.tvLabels.push(label);
    });
  }
}
