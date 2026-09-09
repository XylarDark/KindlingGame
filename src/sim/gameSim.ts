import { createCatalog, skuById, type Sku } from "./catalog";
import { formatGameClock, GameClock } from "./clock";
import {
  CALL_CONNECT_MS,
  CUSTOMER_SPEED,
  HANDOFF_RADIUS,
  PARK_ARRIVE_RADIUS,
  INSTORE_WALKOUT_MS,
  NPC_INTERACT_COOLDOWN_MS,
  KEYLEAD_WALK_SPEED,
  BACKROOM_MS,
  TABLET_QUEUE_MAX,
  TICKET_WAVE_MAX_MS,
  TICKET_WAVE_MIN_MS,
  FIRST_TICKET_WAVE_MS,
  WALKIN_GAP_MIN_MS,
  WALKIN_GAP_MAX_MS,
  FIRST_WALKIN_MS,
  COVER_NOTICE_STEP_MS,
  COVER_NOTICE_MAX_STEPS,
  COVER_LOSS_LINE_MS,
  OPENING_FIRST_AT_MS,
  OPENING_ORDER_GAP_MS,
  MS_PER_GAME_HOUR,
  PICKUP_ARRIVE_MS,
  PICKUP_HANDOFF_WAIT_MS,
  SCORE_DELIVERY_LATE,
  SCORE_DELIVERY_ON_TIME,
  SCORE_FAIL,
  SHIFT_MS,
  PARK_TURN_RATE,
  VEHICLE_SPEED,
} from "./constants";
import { customerLookIndex } from "../art/people";
import { ageForSeed, emptyDropoff, idCardFor, type DropoffPhase, type DropoffView } from "./dropoff";
import { destLabel, isOpen, needsFetch, tabletQueue, type Order, type OrderType } from "./orders";
import {
  advanceRoute,
  angleDelta,
  approachToStall,
  kerbParkHeading,
  lerpAngle,
  normalizeAngle,
  stallRestHeading,
  routeWorldPoints,
  snapPathToDriveLanes,
  type StallApproach,
  type WorldPoint,
} from "./driveRoute";
import { findPath } from "./pathfinding";
import { generateCustomerName } from "./names";
import { isDeliveryLate, scoreForComplete, scoreForFail } from "./scoring";
import { buildShiftResults, type ShiftResults } from "./shiftResults";
import type { SfxKind } from "../audio/sfx";
import {
  CITY,
  doorstepWorld,
  houseById,
  houseTitle,
  MAP_PX_H,
  MAP_PX_W,
  TILE,
  tileToWorld,
  worldToTile,
  type HouseStop,
} from "../maps/cityT0";
import { cityTrafficLoops, driveSpeedForTraffic, trafficCars } from "../maps/traffic";
import { BACK_DOOR, customerSlotX, DOOR, KEYLEAD } from "../maps/shopT0";

export type PlayerRole = "keyLead" | "driver";

export type ShopClick =
  | { type: "keyLead" }
  | { type: "bagRack" }
  | { type: "strain"; skuId: string }
  | { type: "tablet"; orderId: string }
  | { type: "handoff" }
  | { type: "customer"; orderId: string };

export type KeyLeadPhase = "idle" | "toBack" | "inBack" | "fromBack";

export interface KeyLeadView {
  x: number;
  y: number;
  facing: number;
  phase: KeyLeadPhase;
  visible: boolean;
}

export interface CustomerView {
  orderId: string;
  x: number;
  bubble: string;
  kind: "inStore" | "pickup";
  /** Which standing slot they hold — see `customerSlotX`. The scene places speech off it. */
  slot: number;
  /** Index into the customer appearance pool — stable for the life of the order. */
  look: number;
}

export interface OrderView {
  id: string;
  type: OrderType;
  skuId: string;
  skuName: string;
  customerName: string;
  status: Order["status"];
  destinationId?: string;
  destLabel: string;
  slaRemainingMs: number | null;
  /** Ticket age — the receipt rail stacks packed bags oldest-first. */
  createdAtGameMs: number;
  late: boolean;
}

export interface DeliveryRun {
  orderIds: string[];
  nextStopId: string | null;
}

/** What the key lead is holding down at the counter while the van is out. */
export interface ShopCoverView {
  /** True whenever the player is driving and the key lead is minding the shop alone. */
  active: boolean;
  /** One line naming the job the key lead has in their hands right now. */
  line: string;
  /** Walk-ins and pickup customers still owed a bag. */
  waiting: number;
  /** Delivery bags packed and parked for the driver's next run. */
  packed: number;
  /** Counter sales the key lead has closed since the van left. */
  served: number;
  /** Counter orders lost since the van left. */
  lost: number;
}

export interface SimSnapshot {
  gameMs: number;
  clockLabel: string;
  score: number;
  playerRole: PlayerRole;
  catalog: Sku[];
  handSkuId: string | null;
  handSkuName: string | null;
  selectedOrderId: string | null;
  awaitingBag: boolean;
  keyLead: KeyLeadView;
  vehicle: { x: number; y: number; heading: number };
  autoDriving: boolean;
  customers: CustomerView[];
  orders: OrderView[];
  bagsOnPickup: string[];
  bagsInBin: string[];
  run: DeliveryRun | null;
  shopCover: ShopCoverView;
  dropoff: DropoffView;
  toast: string;
  serveLine: string;
  highlightSkuId: string | null;
  canHitTheRoad: boolean;
  tabletTicket: OrderView | null;
  tabletQueueCount: number;
  /** After tapping a ticket: "Pickup: [strain] for [customer]". */
  keyLeadLine: string | null;
  /** After tapping a delivery: "Ok, off I go." */
  driverLine: string | null;
  /** True after 23:00 or End shift — results UI owns the session. */
  shiftEnded: boolean;
  shiftResults: ShiftResults | null;
  /** Settings: End shift early after ≥1 scored complete/fail. */
  canEndShiftEarly: boolean;
  /** Latest score delta for HUD pops; id increments each event. */
  scoreFlash: { id: number; delta: number } | null;
  /** One-shot UI sound cue for HudScene. */
  sfxCue: { id: number; kind: SfxKind } | null;
}

export interface SimOptions {
  seed?: number;
  autoSpawn?: boolean;
}

interface CustomerState {
  orderId: string;
  x: number;
  targetX: number;
  kind: "inStore" | "pickup";
  /** Standing position on the floor, held for the customer's whole visit. */
  slot: number;
}

interface SpawnEvent {
  atMs: number;
  type: OrderType;
  destinationId?: string;
}

interface DropoffState {
  orderId: string;
  houseId: string;
  phase: DropoffPhase;
  callDoneAt?: number;
  customer: { x: number; y: number; targetX: number; targetY: number } | null;
  driver: { x: number; y: number } | null;
  photoTaken: boolean;
  idAsked: boolean;
  idChecked: boolean;
  bagHanded: boolean;
}

/**
 * How the van sits in its stall at Kindling. The shift starts with it already parked, so
 * this is the same kerb rule every other stop uses rather than a hand-picked angle — the
 * van it returns to at the end of a run is the van it left in.
 */
const SHOP_PARK_HEADING = kerbParkHeading(CITY.shopSpawn, CITY.shopLot.street);

export class GameSim {
  readonly catalog: Sku[];
  readonly clock = new GameClock();
  score = 0;
  playerRole: PlayerRole = "keyLead";
  vehicle = tileToWorld(CITY.shopSpawn);
  toast = "Welcome to Kindling. Watch the order screen.";
  input = { dx: 0, dy: 0 };
  autoSpawn: boolean;
  shiftEnded = false;
  private under19Fails = 0;
  private scoredActions = 0;
  private scoreFlash: { id: number; delta: number } | null = null;
  private scoreFlashSeq = 0;
  private sfxCue: { id: number; kind: SfxKind } | null = null;
  private sfxSeq = 0;
  handSkuId: string | null = null;
  selectedOrderId: string | null = null;
  awaitingBag = false;
  private driverLine: string | null = null;
  private packQueue: string[] = [];

  private orders: Order[] = [];
  private customers: CustomerState[] = [];
  private nextOrderId = 1;
  private nextDeliveryHouse = 0;
  private queuedInteract = false;
  private npcCooldown = 0;
  private coverServed = 0;
  private coverLost = 0;
  /** Names the counter sale that just walked, so the driver's readout says who. */
  private coverLostName: string | null = null;
  private coverLostAt = 0;
  private spawnQueue: SpawnEvent[] = [];
  private lastAutoSpawn = 0;
  private nextTicketWaveAt = 0;
  private nextWalkInAt = 0;
  private rng: () => number;
  private runOrderIds: string[] = [];
  private nameSeed: number;
  private dropoff: DropoffState | null = null;
  private driveRoute: WorldPoint[] = [];
  private driveWaypoint = 0;
  private driveArrived = false;
  private vehicleHeading = SHOP_PARK_HEADING;
  /** Heading the van is squaring up to in its stall, or null when it is not parking. */
  private parkHeading: number | null = null;
  private keyLeadX = KEYLEAD.x;
  private keyLeadPhase: KeyLeadPhase = "idle";
  private keyLeadFacing = 1;
  private fetchSkuId: string | null = null;
  private backroomLeftMs = 0;
  /** Blocks a second door/curb interact from the same tap (ASK ID → deny/next, etc.). */
  private dropoffInteractReadyAt = 0;

  constructor(options: SimOptions = {}) {
    const seed = options.seed ?? 1;
    this.autoSpawn = options.autoSpawn ?? true;
    this.catalog = createCatalog(seed);
    this.rng = mulberryFrom(seed + 17);
    this.nameSeed = seed + 99;
    if (this.autoSpawn) this.queueOpeningOrders();
  }

  /** Start the opening ticket wave after the how-to overlay dismisses. */
  enableSpawns(): void {
    if (this.autoSpawn) return;
    this.autoSpawn = true;
    this.queueOpeningOrders();
  }

  private queueOpeningOrders(): void {
    const base = this.clock.gameMs;
    const pickupAt = base + OPENING_FIRST_AT_MS + OPENING_ORDER_GAP_MS;
    const deliveryAt = pickupAt + OPENING_ORDER_GAP_MS;
    this.spawnQueue = [
      { atMs: base + OPENING_FIRST_AT_MS, type: "inStore" },
      { atMs: pickupAt, type: "pickup" },
      { atMs: deliveryAt, type: "delivery" },
      { atMs: deliveryAt, type: "delivery" },
    ];
    this.nextTicketWaveAt = deliveryAt + OPENING_ORDER_GAP_MS + FIRST_TICKET_WAVE_MS;
    this.nextWalkInAt = this.nextTicketWaveAt + FIRST_WALKIN_MS;
  }

  static create(options?: SimOptions): GameSim {
    return new GameSim(options);
  }

  /**
   * Settings → RESET TO 9 AM. Deliberately the same operation as `startNewDay`,
   * not a second implementation of it.
   *
   * This used to rewind the clock and restart SLA timers while leaving the floor as it
   * was, which stranded whatever was mid-flight: a walk-in kept standing at the counter
   * with no way to serve them, and the van stayed out on a run that no longer existed.
   * Twenty-five fields survived a reset in all. Two reset paths meant one of them was
   * always a field list drifting behind the other, so there is now only one.
   */
  resetToMorning(): void {
    this.startNewDay();
  }

  /** End the shift early (settings) or when the clock hits 23:00. */
  endShift(): void {
    if (this.shiftEnded) return;
    this.shiftEnded = true;
    this.clearDropoff();
    this.queuedInteract = false;
    this.input = { dx: 0, dy: 0 };
    this.driveArrived = true;
    this.driveRoute = [];
    this.parkHeading = null;
    this.toast = "Shift over. See your results.";
  }

  /** Tester shortcut: same results card as 23:00, for time played so far. */
  endShiftEarly(): boolean {
    if (this.shiftEnded || this.scoredActions < 1) return false;
    this.endShift();
    return true;
  }

  /**
   * The one definition of a fresh session: 09:00, score 0, empty floor, shop playable.
   * Both the results card's New Day and the settings reset land here, so a field added
   * to the sim only has to be cleared in one place. `gameSim.test.ts` compares a reset
   * sim against a newly constructed one field by field, so forgetting one fails a test
   * rather than stranding a customer.
   */
  startNewDay(): void {
    this.shiftEnded = false;
    this.score = 0;
    this.under19Fails = 0;
    this.scoredActions = 0;
    this.scoreFlash = null;
    this.sfxCue = null;
    this.clock.gameMs = 0;
    this.clearDropoff();
    this.playerRole = "keyLead";
    this.vehicle = tileToWorld(CITY.shopSpawn);
    this.vehicleHeading = SHOP_PARK_HEADING;
    this.parkHeading = null;
    this.driveRoute = [];
    this.driveWaypoint = 0;
    this.driveArrived = false;
    this.orders = [];
    this.customers = [];
    this.runOrderIds = [];
    this.handSkuId = null;
    this.selectedOrderId = null;
    this.awaitingBag = false;
    this.packQueue = [];
    this.driverLine = null;
    this.keyLeadX = KEYLEAD.x;
    this.keyLeadPhase = "idle";
    this.keyLeadFacing = 1;
    this.fetchSkuId = null;
    this.backroomLeftMs = 0;
    this.npcCooldown = 0;
    this.coverServed = 0;
    this.coverLost = 0;
    this.coverLostName = null;
    this.coverLostAt = 0;
    this.queuedInteract = false;
    this.input = { dx: 0, dy: 0 };
    this.dropoffInteractReadyAt = 0;
    this.lastAutoSpawn = 0;
    this.nextOrderId = 1;
    this.nextDeliveryHouse = 0;
    if (this.autoSpawn) this.queueOpeningOrders();
    else {
      this.spawnQueue = [];
      this.nextTicketWaveAt = 0;
      this.nextWalkInAt = 0;
    }
    // Three things deliberately carry over, and the reset test allows exactly these.
    // `scoreFlashSeq` / `sfxSeq` are monotonic UI event ids that the HUD dedupes against
    // its own last-seen id; rewinding them to 0 made the HUD swallow the first flash and
    // sound of the new day. `nameSeed` carries so a new day brings new customers rather
    // than replaying yesterday's. The toast names the reset instead of saying welcome.
    this.toast = "New day. Clock is 9:00 AM.";
  }

  snapshot(): SimSnapshot {
    const selected = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    return {
      gameMs: this.clock.gameMs,
      clockLabel: formatGameClock(this.clock.gameMs),
      score: this.score,
      playerRole: this.playerRole,
      catalog: this.catalog,
      handSkuId: this.handSkuId,
      handSkuName: this.handSkuId ? (skuById(this.catalog, this.handSkuId)?.name ?? null) : null,
      selectedOrderId: this.selectedOrderId,
      awaitingBag:
        !!selected &&
        selected.type !== "inStore" &&
        needsFetch(selected) &&
        this.handSkuId === selected.skuId &&
        this.keyLeadPhase === "idle",
      keyLead: {
        x: this.keyLeadX,
        y: KEYLEAD.y,
        facing: this.keyLeadFacing,
        phase: this.keyLeadPhase,
        visible: this.keyLeadPhase !== "inBack",
      },
      vehicle: { ...this.vehicle, heading: this.vehicleHeading },
      autoDriving: this.playerRole === "driver" && this.dropoff?.phase !== "atDoor" && !this.driveArrived,
      customers: this.customers.map((c) => ({
        orderId: c.orderId,
        x: c.x,
        kind: c.kind,
        slot: c.slot,
        bubble: this.customerBubble(c),
        look: this.customerLookFor(c.orderId),
      })),
      orders: this.orders.filter(isOpen).map((o) => this.toView(o)),
      bagsOnPickup: this.orders.filter((o) => o.status === "onPickupShelf" || o.status === "readyForHandoff").map((o) => o.id),
      bagsInBin: this.orders.filter((o) => o.status === "inBin").map((o) => o.id),
      run: this.runSnapshot(),
      shopCover: this.shopCoverView(),
      dropoff: this.toDropoffView(),
      toast: this.toast,
      serveLine: this.serveLine(),
      highlightSkuId: this.focusSkuId(),
      // A walk-in no longer pins the driver to the floor — the key lead covers the counter.
      canHitTheRoad:
        this.playerRole === "keyLead" &&
        (this.orders.some((o) => o.status === "inBin") || this.runOrderIds.length > 0),
      tabletTicket: this.toViewOrNull(this.tabletFront()),
      tabletQueueCount: tabletQueue(this.orders).length,
      keyLeadLine: this.keyLeadCallout(selected),
      driverLine: this.playerRole === "keyLead" ? this.driverLine : null,
      shiftEnded: this.shiftEnded,
      shiftResults: this.shiftEnded
        ? buildShiftResults(this.orders, this.score, this.clock.gameMs, this.under19Fails)
        : null,
      canEndShiftEarly: !this.shiftEnded && this.scoredActions >= 1,
      scoreFlash: this.scoreFlash,
      sfxCue: this.sfxCue,
    };
  }

  setPlayerInput(dx: number, dy: number): void {
    this.input.dx = clamp(dx, -1, 1);
    this.input.dy = clamp(dy, -1, 1);
  }

  queueInteract(): void {
    this.queuedInteract = true;
  }

  interact(): void {
    if (this.playerRole === "driver") this.interactDriver();
    else this.shopClick({ type: "handoff" });
  }

  shopClick(click: ShopClick): void {
    if (this.shiftEnded) return;
    switch (click.type) {
      case "keyLead":
        this.toast = "Pick a flashing ticket, then the strain.";
        return;
      case "bagRack":
        this.packSelected();
        return;
      case "strain":
        this.pickStrain(click.skuId);
        return;
      case "tablet":
        this.selectTicket(click.orderId);
        return;
      case "handoff":
        this.tryHandoff();
        return;
      case "customer":
        this.onCustomerTap(click.orderId);
        return;
    }
  }

  setVehiclePosition(x: number, y: number): void {
    this.vehicle.x = x;
    this.vehicle.y = y;
    if (this.playerRole === "driver") this.refreshDriveRoute();
  }

  spawnOrder(type: OrderType, opts: { skuId?: string; destinationId?: string; ageOk?: boolean } = {}): Order {
    const sku = opts.skuId
      ? skuById(this.catalog, opts.skuId)
      : this.catalog[Math.floor(this.rng() * this.catalog.length)];
    if (!sku) throw new Error("catalog empty");
    const id = `ord-${this.nextOrderId++}`;
    const customerName = generateCustomerName(this.nameSeed++);
    const seededAge = ageForSeed(`${id}:${customerName}`);
    const idAge = opts.ageOk === true ? Math.max(19, seededAge) : opts.ageOk === false ? 16 + (seededAge % 3) : seededAge;
    const order: Order = {
      id,
      type,
      skuId: sku.id,
      status: type === "inStore" ? "atRegister" : "queued",
      createdAtGameMs: this.clock.gameMs,
      customerName,
      idAge,
      destinationId: type === "delivery" ? (opts.destinationId ?? this.nextHouse()) : undefined,
    };
    this.orders.push(order);
    if (type === "inStore") {
      this.customers.push(this.newCustomer(order.id, "inStore"));
      // The walk-in's own speech bubble carries the ask — keep the toast for errors/score.
      // Mid-run the toast is the driver's own banner, and the counter is the key lead's
      // problem, so a walk-in arriving behind them must not wipe it.
      if (this.playerRole === "keyLead") this.toast = "";
    } else if (type === "pickup") {
      // Don't restate the strain on the bottom chip while a walk-in is mid-ask.
      const walkInAsking = this.customers.some((c) => {
        const o = this.orderById(c.orderId);
        return o?.type === "inStore" && o.status === "atRegister" && Math.abs(c.x - c.targetX) <= 24;
      });
      this.toast = walkInAsking
        ? `Pickup ticket: ${order.customerName}`
        : `Pickup ticket: ${order.customerName} — ${sku.name}`;
    } else {
      const walkInAsking = this.customers.some((c) => {
        const o = this.orderById(c.orderId);
        return o?.type === "inStore" && o.status === "atRegister" && Math.abs(c.x - c.targetX) <= 24;
      });
      this.toast = walkInAsking
        ? `Delivery to ${destLabel(order)}: ${order.customerName}`
        : `Delivery to ${destLabel(order)}: ${order.customerName} — ${sku.name}`;
    }
    return order;
  }

  hitTheRoad(): boolean {
    if (this.shiftEnded) return false;
    const fresh = this.orders.filter((o) => o.status === "inBin");
    if (this.playerRole === "keyLead" && fresh.length === 0 && this.runOrderIds.length === 0) {
      this.toast = "Need a named delivery bag first.";
      return false;
    }
    // A bag going out now needs its hour running, deferred or not.
    this.startDeferredSlas();
    for (const order of fresh) {
      order.status = "onRun";
      this.runOrderIds.push(order.id);
    }
    this.playerRole = "driver";
    this.driverLine = null;
    this.coverServed = 0;
    this.coverLost = 0;
    this.coverLostName = null;
    this.refreshDriveRoute();
    const walkIn = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    this.toast = walkIn
      ? `Key lead has the counter — ${walkIn.customerName} is in good hands.`
      : this.runOrderIds.length > 1
        ? "Multi-stop run. Van is heading out."
        : "Hit the road. Van is heading to the stop.";
    return true;
  }

  backToShop(): boolean {
    if (this.playerRole !== "driver") return false;
    const shop = tileToWorld(CITY.shopSpawn);
    if (dist(this.vehicle.x, this.vehicle.y, shop.x, shop.y) > HANDOFF_RADIUS) {
      this.toast = "Drive up to Kindling first.";
      return false;
    }
    this.clearDropoff();
    this.playerRole = "keyLead";
    this.driverLine = null;
    const served = this.coverServed;
    // The driver is back on the floor, so bags the key lead packed can start their hour.
    this.startDeferredSlas();
    this.toast = served
      ? `Back at Kindling. Key lead cleared ${served} at the counter.`
      : this.runOrderIds.length
        ? "Back at Kindling. Remaining bags stay in the car."
        : "Back at Kindling. Watch the order screen.";
    return true;
  }

  /**
   * The courier hour is a promise the shop can only keep with a driver in the building.
   * Bags the key lead packs mid-run hold their clock until the van is back, so a long
   * run cannot hand the player a bag that is already late.
   */
  private startDeferredSlas(): void {
    for (const order of this.orders) {
      if (!order.slaDeferred) continue;
      order.slaDeferred = false;
      if (isOpen(order)) order.slaStartGameMs = this.clock.gameMs;
    }
  }

  tick(dtMs: number): void {
    if (this.shiftEnded) return;
    this.clock.tick(dtMs);
    if (this.clock.gameMs >= SHIFT_MS) {
      this.endShift();
      return;
    }
    if (this.playerRole === "driver" && this.dropoff?.phase !== "atDoor") this.tickDrive(dtMs / 1000);
    this.tickParkHeading(dtMs / 1000);
    this.syncCurb();
    this.moveCustomers(dtMs);
    this.tickKeyLead(dtMs);
    this.tickCall();
    if (this.queuedInteract) {
      this.queuedInteract = false;
      this.interact();
    }
    if (this.playerRole === "driver") this.tickCounterCover(dtMs);
    this.tickTimers();
    this.tickSpawns();
  }

  orderById(id: string): Order | undefined {
    return this.orders.find((o) => o.id === id);
  }

  setDriverPosition(x: number, y: number): void {
    if (this.dropoff?.driver) {
      this.dropoff.driver.x = x;
      this.dropoff.driver.y = y;
    }
  }

  dropoffAct(): void {
    this.interactDriver();
  }

  private packSelected(): void {
    const order = this.selectedTicket();
    if (!order) {
      this.toast = "Tap a flashing ticket, then the strain.";
      return;
    }
    if (this.keyLeadPhase !== "idle") {
      this.toast = "Wait — they're grabbing it.";
      return;
    }
    if (!this.handSkuId) {
      const sku = skuById(this.catalog, order.skuId);
      this.toast = `Tap ${sku?.name ?? "the strain"} on the wall first.`;
      return;
    }
    if (this.handSkuId !== order.skuId) {
      this.toast = `Wrong item for ${order.customerName}.`;
      return;
    }
    this.handSkuId = null;
    this.sealBag(order);
    this.pushSfx("pack");
  }

  private selectedTicket(): Order | undefined {
    const order = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    if (!order || order.type === "inStore" || !needsFetch(order)) return undefined;
    return order;
  }

  private pickStrain(skuId: string): void {
    const sku = skuById(this.catalog, skuId);
    if (!sku) return;
    if (this.keyLeadPhase !== "idle") {
      this.toast = "They're already in the back.";
      return;
    }
    const walkIn = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (walkIn && this.customerAtCounter(walkIn.id)) {
      if (skuId !== walkIn.skuId) {
        this.toast = `Wrong TV. ${walkIn.customerName} wants ${skuById(this.catalog, walkIn.skuId)?.name}.`;
        this.pushSfx("wrong");
        return;
      }
      if (this.handSkuId === skuId) {
        this.toast = `Already holding ${sku.name}. Tap ${walkIn.customerName}.`;
        return;
      }
      this.startFetch(skuId);
      return;
    }
    if (walkIn && !this.customerAtCounter(walkIn.id)) {
      this.toast = `${walkIn.customerName} is still walking in.`;
      return;
    }
    const ticket = this.selectedTicket();
    if (ticket) {
      if (this.handSkuId === ticket.skuId) {
        this.toast = `Already holding ${skuById(this.catalog, ticket.skuId)?.name}. Tap a bag.`;
        return;
      }
      if (skuId !== ticket.skuId) {
        this.toast = `Wrong TV. ${ticket.customerName} ordered ${skuById(this.catalog, ticket.skuId)?.name}.`;
        this.pushSfx("wrong");
        return;
      }
      this.startFetch(skuId);
      return;
    }
    this.toast = "Select a ticket first — walk-ins can tap the TV they asked for.";
  }

  private startFetch(skuId: string): void {
    const sku = skuById(this.catalog, skuId);
    if (this.handSkuId === skuId) {
      this.toast = this.selectedTicket()
        ? `Holding ${sku?.name}. Tap a bag.`
        : `Holding ${sku?.name}. Tap the customer.`;
      return;
    }
    this.fetchSkuId = skuId;
    this.keyLeadPhase = "toBack";
    this.keyLeadFacing = -1;
    this.toast = `Grabbing ${sku?.name ?? "it"} from the back…`;
  }

  private tickKeyLead(dtMs: number): void {
    // Catch up after long frames so a hitch cannot leave the key-lead mid-fetch forever.
    const SLICE_MS = 32;
    let remaining = dtMs;
    let steps = 0;
    while (remaining > 0 && this.keyLeadPhase !== "idle" && steps < 256) {
      const slice = Math.min(SLICE_MS, remaining);
      this.tickKeyLeadSlice(slice);
      remaining -= slice;
      steps += 1;
    }
  }

  private tickKeyLeadSlice(dtMs: number): void {
    const dt = dtMs / 1000;
    const step = KEYLEAD_WALK_SPEED * dt;
    if (this.keyLeadPhase === "toBack") {
      this.keyLeadFacing = -1;
      const dest = BACK_DOOR.x;
      if (Math.abs(this.keyLeadX - dest) <= step) {
        this.keyLeadX = dest;
        this.keyLeadPhase = "inBack";
        this.backroomLeftMs = BACKROOM_MS;
      } else {
        this.keyLeadX += Math.sign(dest - this.keyLeadX) * step;
      }
      return;
    }
    if (this.keyLeadPhase === "inBack") {
      this.backroomLeftMs -= dtMs;
      if (this.backroomLeftMs <= 0) {
        this.handSkuId = this.fetchSkuId;
        this.keyLeadPhase = "fromBack";
        this.keyLeadFacing = 1;
      }
      return;
    }
    if (this.keyLeadPhase === "fromBack") {
      this.keyLeadFacing = 1;
      const dest = KEYLEAD.x;
      if (Math.abs(this.keyLeadX - dest) <= step) {
        this.keyLeadX = dest;
        this.keyLeadPhase = "idle";
        const sku = this.handSkuId ? skuById(this.catalog, this.handSkuId) : undefined;
        const ticket = this.selectedTicket();
        const walkIn = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
        this.toast = ticket
          ? `Got ${sku?.name}. Tap a bag.`
          : `Got ${sku?.name}. Tap ${walkIn?.customerName ?? "the customer"}.`;
      } else {
        this.keyLeadX += Math.sign(dest - this.keyLeadX) * step;
      }
    }
  }

  private sealBag(order: Order): void {
    if (order.type === "delivery") {
      order.status = "inBin";
      if (this.playerRole === "driver") {
        order.slaDeferred = true;
        delete order.slaStartGameMs;
        this.toast = `Bag labeled ${destLabel(order)} · ${order.customerName}. Waiting on the van.`;
      } else {
        order.slaStartGameMs = this.clock.gameMs;
        this.toast = `Bag labeled ${destLabel(order)} · ${order.customerName}. Packed — ready to roll.`;
      }
    } else {
      order.status = "onPickupShelf";
      order.slaStartGameMs = this.clock.gameMs;
      this.toast = `Pickup bag packed for ${order.customerName}.`;
    }
    this.awaitingBag = false;
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.advancePackQueue();
  }

  private claimedTicketIds(): Set<string> {
    const ids = new Set(this.packQueue);
    if (this.selectedOrderId) ids.add(this.selectedOrderId);
    return ids;
  }

  private ticketInProgress(): boolean {
    const selected = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    return !!selected && selected.type !== "inStore" && needsFetch(selected);
  }

  private beginTicket(order: Order): void {
    this.selectedOrderId = order.id;
    this.driverLine = null;
    const sku = skuById(this.catalog, order.skuId);
    this.toast =
      order.type === "delivery"
        ? `Delivery to ${destLabel(order)}: ${order.customerName} — ${sku?.name}. Tap that TV, then a bag.`
        : `Pickup: ${order.customerName} — ${sku?.name}. Tap that TV, then a bag.`;
    this.pushSfx("ticket");
  }

  private enqueueTicket(order: Order): void {
    if (this.packQueue.includes(order.id)) {
      this.toast = `Already queued ${order.customerName}.`;
      return;
    }
    this.packQueue.push(order.id);
    this.toast = `Queued ${order.customerName}. Finish packing first.`;
  }

  private advancePackQueue(): void {
    while (this.packQueue.length > 0) {
      const nextId = this.packQueue.shift()!;
      const next = this.orderById(nextId);
      if (next && isOpen(next) && needsFetch(next)) {
        this.beginTicket(next);
        return;
      }
    }
  }

  private dropQueuedTicket(orderId: string): void {
    this.packQueue = this.packQueue.filter((id) => id !== orderId);
  }

  private selectTicket(orderId: string): void {
    const order = this.orderById(orderId);
    if (!order || !isOpen(order) || order.type === "inStore") {
      this.toast = "That ticket is not on the tablet.";
      return;
    }
    if (order.status !== "queued") {
      this.toast = "That ticket is not on the tablet.";
      return;
    }
    if (this.selectedOrderId === order.id) {
      this.toast = `Already packing ${order.customerName}.`;
      return;
    }
    if (this.packQueue.includes(order.id)) {
      this.toast = `Already queued ${order.customerName}.`;
      return;
    }
    if (this.ticketInProgress()) {
      this.enqueueTicket(order);
      return;
    }
    this.beginTicket(order);
  }

  private tryHandoff(): void {
    if (this.tryServeWalkIn()) return;
    const waiting = this.orders.find((o) => o.type === "pickup" && o.status === "readyForHandoff");
    if (waiting && this.customerAtCounter(waiting.id)) {
      this.complete(waiting);
      return;
    }
    this.toast = waiting ? "Wait for them at the counter." : "Nobody is waiting for a bag.";
  }

  private onCustomerTap(orderId: string): void {
    const order = this.orderById(orderId);
    if (!order || !isOpen(order)) return;
    if (order.type === "inStore") {
      if (!this.customerAtCounter(orderId)) {
        this.toast = `${order.customerName} is still walking in.`;
        return;
      }
      this.selectedOrderId = orderId;
      this.tryServeWalkIn(order);
      return;
    }
    if (order.status === "readyForHandoff") {
      if (!this.customerAtCounter(orderId)) {
        this.toast = "Wait for them at the counter.";
        return;
      }
      this.complete(order);
      return;
    }
    this.tryHandoff();
  }

  private tryServeWalkIn(order?: Order): boolean {
    const target =
      order ?? this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (!target) return false;
    if (!this.customerAtCounter(target.id)) {
      this.toast = `Wait for ${target.customerName} at the counter.`;
      return true;
    }
    const sku = skuById(this.catalog, target.skuId);
    if (!this.handSkuId) {
      this.toast = "";
      return true;
    }
    if (this.keyLeadPhase !== "idle") {
      this.toast = "Wait — they're grabbing it.";
      return true;
    }
    if (this.handSkuId !== target.skuId) {
      this.toast = `Wrong TV. ${target.customerName} wants ${sku?.name ?? "a different jar"}. Tap that TV first.`;
      this.pushSfx("wrong");
      return true;
    }
    this.handSkuId = null;
    this.complete(target);
    return true;
  }

  private shopCoverView(): ShopCoverView {
    const walkIns = this.orders.filter((o) => o.type === "inStore" && o.status === "atRegister");
    const pickups = this.orders.filter((o) => o.status === "readyForHandoff");
    return {
      active: this.playerRole === "driver",
      line: this.coverLine(walkIns[0], pickups[0]),
      waiting: walkIns.length + pickups.length,
      packed: this.orders.filter((o) => o.status === "inBin").length,
      served: this.coverServed,
      lost: this.coverLost,
    };
  }

  /**
   * Mirrors the cover loop's own priority so the readout never names the wrong job — and
   * says plainly when the key lead is too deep to reach somebody, so a lost sale arrives
   * with its reason attached instead of as an unexplained score drop.
   */
  private coverLine(walkIn: Order | undefined, pickup: Order | undefined): string {
    if (this.coverLostName && this.clock.gameMs - this.coverLostAt < COVER_LOSS_LINE_MS) {
      return `${this.coverLostName} gave up and left`;
    }
    if (this.keyLeadPhase !== "idle") {
      const sku = this.fetchSkuId ? skuById(this.catalog, this.fetchSkuId) : undefined;
      return sku ? `In the back for ${sku.name}` : "In the back";
    }
    if (walkIn) {
      if (!this.customerAtCounter(walkIn.id)) return `${walkIn.customerName} is walking in`;
      if (!this.coverNoticed(walkIn)) return this.backedUpLine(walkIn);
      return `Serving ${walkIn.customerName}`;
    }
    if (pickup && this.customerAtCounter(pickup.id)) {
      return this.coverNoticed(pickup)
        ? `Handing ${pickup.customerName} their pickup`
        : this.backedUpLine(pickup);
    }
    const ticket = this.selectedTicket() ?? this.tabletFront();
    if (ticket) {
      const sku = skuById(this.catalog, ticket.skuId);
      return `Packing ${sku?.name ?? "a bag"} for ${ticket.customerName}`;
    }
    if (pickup) return `Waiting on ${pickup.customerName}`;
    // The HUD already prefixes this with COUNTER, so saying it again reads as a stutter.
    return "Nobody waiting";
  }

  /** Names both the person being kept waiting and the depth that is keeping them there. */
  private backedUpLine(order: Order): string {
    return `Buried — ${this.counterLoad()} jobs, ${order.customerName} still waiting`;
  }

  private runSnapshot(): DeliveryRun | null {
    if (this.runOrderIds.length === 0) return null;
    return { orderIds: [...this.runOrderIds], nextStopId: this.nextStopId() };
  }

  private nextStopId(): string | null {
    const remaining = this.runOrderIds
      .map((id) => this.orderById(id))
      .filter((o): o is Order => !!o && o.status === "onRun");
    if (remaining.length === 0) return null;
    let best: Order | null = null;
    let bestD = Infinity;
    for (const order of remaining) {
      const house = order.destinationId ? houseById(order.destinationId) : undefined;
      if (!house) continue;
      const pos = tileToWorld(house.stop);
      const d = dist(this.vehicle.x, this.vehicle.y, pos.x, pos.y);
      if (d < bestD) {
        bestD = d;
        best = order;
      }
    }
    return best?.destinationId ?? remaining[0]?.destinationId ?? null;
  }

  private toView(order: Order): OrderView {
    const sku = skuById(this.catalog, order.skuId);
    let slaRemainingMs: number | null = null;
    if (order.type === "delivery" && order.slaStartGameMs !== undefined) {
      slaRemainingMs = MS_PER_GAME_HOUR - (this.clock.gameMs - order.slaStartGameMs);
    } else if (order.type === "pickup" && order.status === "onPickupShelf" && order.slaStartGameMs !== undefined) {
      slaRemainingMs = PICKUP_ARRIVE_MS - (this.clock.gameMs - order.slaStartGameMs);
    } else if (order.type === "pickup" && order.status === "readyForHandoff" && order.arriveAtGameMs !== undefined) {
      slaRemainingMs = PICKUP_HANDOFF_WAIT_MS - (this.clock.gameMs - order.arriveAtGameMs);
    } else if (order.type === "inStore" && order.arriveAtGameMs !== undefined) {
      slaRemainingMs = INSTORE_WALKOUT_MS - (this.clock.gameMs - order.arriveAtGameMs);
    }
    return {
      id: order.id,
      type: order.type,
      skuId: order.skuId,
      skuName: sku?.name ?? order.skuId,
      customerName: order.customerName,
      status: order.status,
      destinationId: order.destinationId,
      destLabel: destLabel(order),
      slaRemainingMs,
      createdAtGameMs: order.createdAtGameMs,
      late: order.type === "delivery" && isDeliveryLate(order, this.clock.gameMs),
    };
  }

  /**
   * Appearance for an order's customer, from the same name/age pair the ID card is
   * built from — see `customerLookIndex`. Orders outlive their walk-in sprite, so
   * this derives on demand rather than being stored on the sprite.
   */
  private customerLookFor(orderId: string): number {
    const order = this.orderById(orderId);
    if (!order) return 0;
    return customerLookIndex(order.customerName, order.idAge);
  }

  /** The lane-snapped route the van is following, for the phone minimap. */
  routeWorldPath(): readonly WorldPoint[] {
    return this.driveRoute;
  }

  private customerBubble(customer: CustomerState): string {
    const order = this.orderById(customer.orderId);
    const sku = order ? skuById(this.catalog, order.skuId) : undefined;
    if (!order || !sku) return "";
    if (customer.kind === "pickup") {
      if (order.status !== "readyForHandoff") return "Pickup";
      if (!this.customerAtCounter(customer.orderId)) return "On the way…";
      return "Tap me — pickup";
    }
    if (Math.abs(customer.x - customer.targetX) > 24) return "Coming in…";
    if (order.status === "readyForHandoff") return `Tap me — ${sku.name}`;
    if (this.handSkuId === order.skuId) return `Tap me — ${sku.name}`;
    return `I want ${sku.name}`;
  }

  private driveTargetWorld(): { x: number; y: number } | null {
    const stall = this.driveTargetStall();
    return stall ? tileToWorld(stall.stop) : null;
  }

  /** The stall the van is driving to, with the kerb it fronts so it can arrive lawfully. */
  private driveTargetStall(): StallApproach | null {
    const stopId = this.nextStopId();
    if (stopId) {
      const house = houseById(stopId);
      return house ? { stop: house.stop, street: house.street, parking: house.parking } : null;
    }
    if (this.playerRole !== "driver") return null;
    return { stop: CITY.shopSpawn, street: CITY.shopLot.street, parking: CITY.shopLot.parking };
  }

  private refreshDriveRoute(): void {
    const stall = this.driveTargetStall();
    // Pulling away cancels any turn still being made in the stall we are leaving.
    this.parkHeading = null;
    if (!stall) {
      this.driveRoute = [];
      this.driveWaypoint = 0;
      this.driveArrived = false;
      return;
    }
    const target = tileToWorld(stall.stop);
    const from = worldToTile(this.vehicle.x, this.vehicle.y);
    const start = CITY.walkable[from.r]?.[from.c] ? from : CITY.shopSpawn;
    // Along the kerb the stall fronts, or across the road where that saves a block — the van
    // waits for a gap in the lane it cuts through rather than clipping through it.
    const cells = approachToStall(CITY.walkable, start, stall);
    this.driveRoute = routeWorldPoints(snapPathToDriveLanes(cells));
    // Final point is the parking stall center — no lane offset.
    if (this.driveRoute.length > 0) {
      this.driveRoute[this.driveRoute.length - 1] = { x: target.x, y: target.y };
    }
    this.driveWaypoint = 0;
    this.driveArrived = false;
  }

  private tickDrive(dt: number): void {
    // Catch up after long frames so a hitch cannot tunnel through traffic gaps.
    const SLICE = 0.05;
    let remaining = dt;
    let steps = 0;
    while (remaining > 0 && !this.driveArrived && steps < 256) {
      const slice = Math.min(SLICE, remaining);
      const mag = Math.hypot(this.input.dx, this.input.dy);
      if (mag > 0.2) this.tickManualDrive(slice);
      else this.tickAutoDrive(slice);
      remaining -= slice;
      steps += 1;
    }
  }

  private tickManualDrive(dt: number): void {
    const mag = Math.hypot(this.input.dx, this.input.dy) || 1;
    const ux = this.input.dx / mag;
    const uy = this.input.dy / mag;
    const traffic = trafficCars(this.clock.gameMs, cityTrafficLoops(), {
      x: this.vehicle.x,
      y: this.vehicle.y,
      heading: this.vehicleHeading,
    });
    const speed = driveSpeedForTraffic(
      { x: this.vehicle.x, y: this.vehicle.y, heading: this.vehicleHeading },
      traffic,
      VEHICLE_SPEED,
    );
    this.vehicle.x = clamp(this.vehicle.x + ux * speed * dt, TILE, MAP_PX_W - TILE);
    this.vehicle.y = clamp(this.vehicle.y + uy * speed * dt, TILE, MAP_PX_H - TILE);
    this.vehicleHeading = Math.atan2(uy, ux);
    const target = this.driveTargetWorld();
    if (target && dist(this.vehicle.x, this.vehicle.y, target.x, target.y) <= PARK_ARRIVE_RADIUS) {
      this.parkAt(target);
    }
  }

  private tickAutoDrive(dt: number): void {
    if (this.driveArrived) return;
    const target = this.driveTargetWorld();
    if (!target) return;
    if (this.driveRoute.length === 0) this.refreshDriveRoute();
    if (this.driveRoute.length === 0) return;

    if (dist(this.vehicle.x, this.vehicle.y, target.x, target.y) <= PARK_ARRIVE_RADIUS) {
      this.parkAt(target);
      return;
    }

    // Route points are already on walkable tiles (right-lane offset); trust the path.
    // Match a slower lead car's speed until it clears the lane ahead.
    const traffic = trafficCars(this.clock.gameMs, cityTrafficLoops(), {
      x: this.vehicle.x,
      y: this.vehicle.y,
      heading: this.vehicleHeading,
    });
    // The waypoint the van is steering for, not the way it is pointing: a turn across the
    // road has to be seen before it is begun, and mid-turn the nose is still in the old lane.
    const aim = this.driveRoute[this.driveWaypoint];
    const intent = aim ? Math.atan2(aim.y - this.vehicle.y, aim.x - this.vehicle.x) : undefined;
    const speed = driveSpeedForTraffic(
      { x: this.vehicle.x, y: this.vehicle.y, heading: this.vehicleHeading },
      traffic,
      VEHICLE_SPEED,
      undefined,
      intent,
    );
    const step = advanceRoute(this.vehicle.x, this.vehicle.y, this.driveWaypoint, this.driveRoute, speed, dt);
    this.vehicle.x = clamp(step.x, TILE, MAP_PX_W - TILE);
    this.vehicle.y = clamp(step.y, TILE, MAP_PX_H - TILE);
    this.driveWaypoint = step.waypoint;
    // Ease through 90° corners like ambient traffic — segment heading, short lerp (no spin).
    const turn = 1 - Math.exp(-dt * 8);
    this.vehicleHeading = lerpAngle(this.vehicleHeading, step.heading, turn);
    if (step.arrived || dist(this.vehicle.x, this.vehicle.y, target.x, target.y) <= PARK_ARRIVE_RADIUS) {
      this.parkAt(target);
    }
  }

  private parkAt(target: { x: number; y: number }): void {
    this.vehicle.x = target.x;
    this.vehicle.y = target.y;
    this.arriveAtDriveTarget(target);
  }

  private arriveAtDriveTarget(target: { x: number; y: number }): void {
    if (this.driveArrived) return;
    this.driveArrived = true;
    const stopId = this.nextStopId();
    if (stopId) {
      const house = houseById(stopId);
      if (house) {
        this.parkHeading = stallRestHeading(
          this.vehicleHeading,
          kerbParkHeading(house.stop, house.street),
        );
      }
      const order = this.runOrderIds
        .map((id) => this.orderById(id))
        .find((o) => o?.destinationId === stopId && o.status === "onRun");
      this.toast = order
        ? `Parked at ${destLabel(order)}.`
        : "Parked.";
      return;
    }
    if (dist(this.vehicle.x, this.vehicle.y, target.x, target.y) <= HANDOFF_RADIUS) {
      this.parkHeading = stallRestHeading(this.vehicleHeading, SHOP_PARK_HEADING);
      this.toast = "Parked at Kindling. Tap the shop to return.";
    }
  }

  /**
   * The last quarter turn into the stall. Runs after the drive tick has bowed out on
   * `driveArrived`, so it is the only thing still moving the van — and it stops moving it
   * the moment the parked heading is reached, which is what lets a test assert an exact
   * angle rather than an asymptote.
   */
  private tickParkHeading(dt: number): void {
    const target = this.parkHeading;
    if (target === null) return;
    const delta = angleDelta(this.vehicleHeading, target);
    const step = PARK_TURN_RATE * dt;
    if (Math.abs(delta) <= step) {
      this.vehicleHeading = normalizeAngle(target);
      this.parkHeading = null;
      return;
    }
    this.vehicleHeading = normalizeAngle(this.vehicleHeading + Math.sign(delta) * step);
  }

  /**
   * A customer through the door, walking to standing room of their own. Every customer
   * used to be sent to the single counter spot, so a walk-in and any pickup waiting on
   * a handoff stood inside each other — one silhouette with two heads. The slot is the
   * lowest one free, held until they leave, so nobody shuffles sideways because someone
   * else was served.
   */
  private newCustomer(orderId: string, kind: "inStore" | "pickup"): CustomerState {
    const taken = new Set(this.customers.map((c) => c.slot));
    let slot = 0;
    while (taken.has(slot)) slot += 1;
    return { orderId, x: DOOR.x, targetX: customerSlotX(slot), kind, slot };
  }

  private moveCustomers(dtMs: number): void {
    const dt = dtMs / 1000;
    const step = CUSTOMER_SPEED * dt;
    for (const customer of this.customers) {
      const delta = customer.targetX - customer.x;
      if (Math.abs(delta) <= Math.max(1, step)) {
        customer.x = customer.targetX;
        const order = this.orderById(customer.orderId);
        if (order?.type === "inStore" && order.arriveAtGameMs === undefined && order.status === "atRegister") {
          order.arriveAtGameMs = this.clock.gameMs;
          if (!this.selectedOrderId) this.selectedOrderId = order.id;
          this.toast = "";
        } else if (
          order?.type === "pickup" &&
          order.status === "readyForHandoff" &&
          order.arriveAtGameMs === undefined
        ) {
          order.arriveAtGameMs = this.clock.gameMs;
          this.toast = `${order.customerName} is at the counter for pickup.`;
        }
        continue;
      }
      customer.x += Math.sign(delta) * step;
    }
  }

  /**
   * The counter does not close because the van left. While the player drives, the key lead
   * works the floor on their own: walk-ins first, then a pickup customer who is already
   * standing there, then whatever ticket is next on the tablet. One job at a time.
   *
   * They are good, not superhuman. See `coverNoticeMs` — a counter the player left deep
   * takes them longer to look up from, and somebody can leave before they get there.
   */
  private tickCounterCover(dtMs: number): void {
    this.npcCooldown -= dtMs;
    if (this.npcCooldown > 0) return;
    if (this.keyLeadPhase !== "idle") {
      this.npcCooldown = NPC_INTERACT_COOLDOWN_MS;
      return;
    }
    if (this.coverWalkIn() || this.coverPickup() || this.coverTicket()) {
      this.npcCooldown = NPC_INTERACT_COOLDOWN_MS;
    }
  }

  /**
   * Everything the counter is still carrying: people standing at it, tickets stacked on
   * the tablet, and bags packed for a van that has not come back for them. The bags are
   * the term that matters — a ticket wave drains in seconds, but a labelled bag sits
   * there until a driver takes it, so the pile is a direct measure of how long the shop
   * has been a person short. Come back and run them out and the counter empties again.
   */
  private counterLoad(): number {
    const standing = this.orders.filter(
      (o) => (o.type === "inStore" && o.status === "atRegister") || o.status === "readyForHandoff",
    ).length;
    const packed = this.orders.filter((o) => o.status === "inBin").length;
    return standing + packed + tabletQueue(this.orders).length;
  }

  /**
   * How long it takes the key lead to look up and register a new face. Alone with one
   * job they turn round instantly; every other job already waiting adds a beat. A
   * walk-in gives them INSTORE_WALKOUT_MS and a pickup customer rather less, so past a
   * certain depth the counter starts shedding the people it cannot get to. Deterministic
   * on purpose: "I left them seven deep" is a reason a player can act on, a dice roll is not.
   */
  private coverNoticeMs(): number {
    const others = Math.max(0, this.counterLoad() - 1);
    return COVER_NOTICE_STEP_MS * Math.min(others, COVER_NOTICE_MAX_STEPS);
  }

  /** True once the key lead has had time to notice whoever arrived at the counter. */
  private coverNoticed(order: Order): boolean {
    if (order.arriveAtGameMs === undefined) return false;
    return this.clock.gameMs - order.arriveAtGameMs >= this.coverNoticeMs();
  }

  private coverWalkIn(): boolean {
    const walkIn = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (!walkIn) return false;
    // Nothing else can be fetched while someone is crossing the floor, so hold the turn.
    if (!this.customerAtCounter(walkIn.id)) return true;
    if (!this.coverNoticed(walkIn)) {
      // Head still down. A bag already in their hands can be closed out; nothing new starts.
      const ticket = this.selectedTicket();
      if (ticket && this.handSkuId === ticket.skuId) this.shopClick({ type: "bagRack" });
      return true;
    }
    if (this.handSkuId === walkIn.skuId) this.shopClick({ type: "customer", orderId: walkIn.id });
    else this.shopClick({ type: "strain", skuId: walkIn.skuId });
    return true;
  }

  private coverPickup(): boolean {
    const waiting = this.orders.find(
      (o) => o.status === "readyForHandoff" && this.customerAtCounter(o.id),
    );
    if (!waiting) return false;
    if (!this.coverNoticed(waiting)) return false;
    this.shopClick({ type: "handoff" });
    return true;
  }

  private coverTicket(): boolean {
    let ticket = this.selectedTicket();
    if (!ticket) {
      // Whatever the player left claimed comes first; a stranded queue heals itself here.
      this.advancePackQueue();
      ticket = this.selectedTicket();
    }
    if (!ticket) {
      const next = this.tabletFront();
      if (!next) return false;
      this.beginTicket(next);
      return true;
    }
    // A jar in hand that this ticket does not want gets swapped by re-tapping the right TV.
    if (this.handSkuId === ticket.skuId) this.shopClick({ type: "bagRack" });
    else this.shopClick({ type: "strain", skuId: ticket.skuId });
    return true;
  }

  private tickTimers(): void {
    for (const order of [...this.orders]) {
      if (order.type === "pickup" && order.slaStartGameMs !== undefined && isOpen(order)) {
        const elapsed = this.clock.gameMs - order.slaStartGameMs;
        if (order.status === "onPickupShelf") {
          if (elapsed >= PICKUP_ARRIVE_MS) {
            order.status = "readyForHandoff";
            if (!this.customers.some((c) => c.orderId === order.id)) {
              this.customers.push(this.newCustomer(order.id, "pickup"));
            }
            this.toast = `${order.customerName} is here for pickup.`;
          }
        } else if (order.status === "readyForHandoff") {
          if (order.arriveAtGameMs === undefined) {
            const walkStarted = order.slaStartGameMs + PICKUP_ARRIVE_MS;
            if (this.clock.gameMs - walkStarted >= INSTORE_WALKOUT_MS) {
              this.failOrder(order, "Pickup no-show.");
              continue;
            }
          } else if (this.clock.gameMs - order.arriveAtGameMs >= PICKUP_HANDOFF_WAIT_MS) {
            this.failOrder(order, "Pickup no-show.");
            continue;
          }
        }
      }
      if (order.type === "inStore" && order.status === "atRegister" && order.arriveAtGameMs !== undefined) {
        if (this.clock.gameMs - order.arriveAtGameMs >= INSTORE_WALKOUT_MS) {
          this.failOrder(order, "Customer walked out.");
        }
      }
    }
  }

  private tickSpawns(): void {
    if (!this.autoSpawn) return;
    this.spawnQueue = this.spawnQueue.filter((event) => {
      if (this.clock.gameMs >= event.atMs) {
        this.spawnOrder(event.type, { destinationId: event.destinationId });
        this.lastAutoSpawn = this.clock.gameMs;
        return false;
      }
      return true;
    });
    if (this.clock.gameMs >= this.nextTicketWaveAt) {
      this.spawnTicketWave();
      const wait = TICKET_WAVE_MIN_MS + Math.floor(this.rng() * (TICKET_WAVE_MAX_MS - TICKET_WAVE_MIN_MS + 1));
      this.nextTicketWaveAt = this.clock.gameMs + wait;
    }
    if (this.clock.gameMs >= this.nextWalkInAt) {
      this.spawnWalkIn();
      const wait = WALKIN_GAP_MIN_MS + Math.floor(this.rng() * (WALKIN_GAP_MAX_MS - WALKIN_GAP_MIN_MS + 1));
      this.nextWalkInAt = this.clock.gameMs + wait;
    }
  }

  private spawnTicketWave(): void {
    const room = TABLET_QUEUE_MAX - tabletQueue(this.orders).length;
    if (room <= 0) return;
    const n = Math.min(room, this.rng() < 0.5 ? 1 : 2);
    for (let i = 0; i < n; i++) {
      const type: OrderType = this.rng() < 0.5 ? "pickup" : "delivery";
      this.spawnOrder(type);
    }
  }

  /**
   * The front door keeps opening all day. Only one walk-in stands at the counter at a
   * time: there is a single customer spot, and an ignored walk-in leaves in
   * INSTORE_WALKOUT_MS, so a queue of them would be a pile-up no player could clear.
   * A beat that lands on an occupied counter is dropped and re-armed — the same way a
   * ticket wave is dropped when the tablet is full — so a slow counter thins its own
   * traffic instead of burying the player.
   *
   * The rate does not change with the player's role. The door does not know whether the
   * van is out; what changes is who answers it, which is exactly the key lead's job.
   */
  private spawnWalkIn(): void {
    if (this.orders.some((o) => o.type === "inStore" && isOpen(o))) return;
    this.spawnOrder("inStore");
  }

  private tabletFront(): Order | undefined {
    const claimed = this.claimedTicketIds();
    return tabletQueue(this.orders).find((order) => !claimed.has(order.id));
  }

  private keyLeadCallout(selected: Order | undefined): string | null {
    if (!selected || selected.type === "inStore") return null;
    const sku = skuById(this.catalog, selected.skuId);
    if (!sku) return null;
    return `${selected.type === "pickup" ? "Pickup" : "Delivery"}: ${sku.name} for ${selected.customerName}`;
  }

  private toViewOrNull(order: Order | undefined): OrderView | null {
    return order ? this.toView(order) : null;
  }

  private interactDriver(): void {
    if (this.shiftEnded) return;
    // Stay locked on an in-progress curb/door stop — never rebind mid-handoff.
    if (this.dropoff && this.dropoff.phase !== "atCurb") {
      this.continueDropoff();
      return;
    }

    const stopId = this.nextStopId();
    if (!stopId) {
      this.toast = "Nothing in the car. Head back to Kindling.";
      return;
    }
    const house = houseById(stopId);
    if (!house) return;
    const pos = tileToWorld(house.stop);
    const atCurb = dist(this.vehicle.x, this.vehicle.y, pos.x, pos.y) <= HANDOFF_RADIUS;

    if (!this.dropoff || this.dropoff.houseId !== stopId) {
      if (!atCurb) {
        this.toast = `Park at ${houseTitle(stopId)}.`;
        return;
      }
      this.beginCurb(stopId);
    }

    this.continueDropoff();
  }

  private continueDropoff(): void {
    const d = this.dropoff;
    if (!d) return;
    // Drop taps during the lock — re-queuing auto-skipped bag/photo after ID click-through.
    if (this.clock.gameMs < this.dropoffInteractReadyAt) return;

    if (d.phase === "atCurb") {
      d.phase = "calling";
      d.callDoneAt = this.clock.gameMs + CALL_CONNECT_MS;
      this.toast = `Calling ${this.orderById(d.orderId)?.customerName ?? "customer"}…`;
      this.armDropoffInteract();
      return;
    }
    if (d.phase === "calling") {
      this.toast = "Phone is ringing…";
      return;
    }

    if (d.phase !== "atDoor") return;

    const order = this.orderById(d.orderId);
    if (!order || order.status !== "onRun") {
      this.clearDropoff();
      this.refreshDriveRoute();
      return;
    }

    if (!d.idAsked) {
      d.idAsked = true;
      this.toast = `${order.customerName} is showing ID. Confirm 19+.`;
      this.armDropoffInteract();
      return;
    }

    const card = idCardFor(order.customerName, order.idAge);
    if (!d.idChecked) {
      if (!card.ageOk) {
        this.failOrder(order, `ID check failed — ${order.customerName} is under 19.`);
        this.refreshDriveRoute();
        this.toast =
          this.runOrderIds.length === 0
            ? `Denied (${SCORE_FAIL}). Van is heading back to Kindling.`
            : `Denied (${SCORE_FAIL}). Next → ${this.nextStopId() ? houseTitle(this.nextStopId()!) : "Kindling"}.`;
        this.armDropoffInteract();
        return;
      }
      d.idChecked = true;
      this.toast = `ID checks out — 19+. Hand ${order.customerName} the bag.`;
      // Full cooldown so the ID tap cannot click through into bag/photo.
      this.armDropoffInteract(NPC_INTERACT_COOLDOWN_MS);
      return;
    }
    if (!d.bagHanded) {
      d.bagHanded = true;
      this.toast = `Bag handed to ${order.customerName}. Snap the photo.`;
      this.armDropoffInteract();
      return;
    }
    if (!d.photoTaken) {
      d.photoTaken = true;
      this.complete(order);
      this.runOrderIds = this.runOrderIds.filter((id) => id !== order.id);
      this.clearDropoff();
      this.refreshDriveRoute();
      const dropMsg = order.late
        ? `Late drop (${SCORE_DELIVERY_LATE})`
        : `On-time (+${SCORE_DELIVERY_ON_TIME})`;
      if (this.runOrderIds.length === 0) {
        this.toast = `${dropMsg}. Van is heading to Kindling — tap the shop when you arrive.`;
      } else {
        this.toast = `${dropMsg}. Next → ${this.nextStopId() ? houseTitle(this.nextStopId()!) : "Kindling"}.`;
      }
      this.armDropoffInteract();
    }
  }

  private armDropoffInteract(ms = Math.min(220, NPC_INTERACT_COOLDOWN_MS)): void {
    this.dropoffInteractReadyAt = this.clock.gameMs + ms;
  }

  private beginCurb(stopId: string): void {
    const order = this.runOrderIds
      .map((id) => this.orderById(id))
      .find((o) => o?.destinationId === stopId && o.status === "onRun");
    if (!order) return;
    this.dropoff = {
      orderId: order.id,
      houseId: stopId,
      phase: "atCurb",
      customer: null,
      driver: null,
      photoTaken: false,
      idAsked: false,
      idChecked: false,
      bagHanded: false,
    };
  }

  private clearDropoff(): void {
    this.dropoff = null;
  }

  private syncCurb(): void {
    if (this.playerRole !== "driver") return;
    if (this.dropoff && this.dropoff.phase !== "atCurb") return;
    const stopId = this.nextStopId();
    if (!stopId) {
      this.dropoff = null;
      return;
    }
    const house = houseById(stopId);
    if (!house) return;
    const pos = tileToWorld(house.stop);
    const atCurb = dist(this.vehicle.x, this.vehicle.y, pos.x, pos.y) <= HANDOFF_RADIUS;
    if (atCurb) {
      if (!this.dropoff || this.dropoff.houseId !== stopId) this.beginCurb(stopId);
    } else if (this.dropoff?.phase === "atCurb") {
      this.dropoff = null;
    }
  }

  private tickCall(): void {
    const d = this.dropoff;
    if (!d || d.phase !== "calling" || d.callDoneAt === undefined) return;
    if (this.clock.gameMs < d.callDoneAt) return;
    const house = houseById(d.houseId);
    if (!house) return;
    const door = doorstepWorld(house);
    d.phase = "atDoor";
    d.customer = { x: door.x, y: door.y, targetX: door.x, targetY: door.y };
    d.driver = { x: door.x, y: door.y };
    this.toast = `${this.orderById(d.orderId)?.customerName ?? "Customer"} is at the door.`;
  }

  private toDropoffView(): DropoffView {
    const d = this.dropoff;
    if (!d || this.playerRole !== "driver") return emptyDropoff();
    const order = this.orderById(d.orderId);
    const sku = order ? skuById(this.catalog, order.skuId) : undefined;
    const arrived = !!d.customer && d.customer.x === d.customer.targetX && d.customer.y === d.customer.targetY;
    let actionLabel = "";
    let canAct = false;
    let hint = order ? `Park at ${destLabel(order)} — ${order.customerName}.` : "Park on the pin.";
    if (d.phase === "atCurb") {
      actionLabel = "CALL";
      canAct = true;
      hint = `Tap your phone to call ${order?.customerName ?? "the customer"}.`;
    } else if (d.phase === "calling") {
      actionLabel = "RINGING";
      hint = `Calling ${order?.customerName ?? "customer"}…`;
    } else if (d.phase === "atDoor" && !d.idAsked) {
      actionLabel = "ASK ID";
      canAct = true;
      hint = `Tap ${order?.customerName ?? "the customer"} to ask for ID.`;
    } else if (d.phase === "atDoor" && !d.idChecked) {
      actionLabel = "CHECK ID";
      canAct = true;
      hint = `Tap the ID card to confirm ${order?.customerName ?? "they"} are 19+.`;
    } else if (d.phase === "atDoor" && !d.bagHanded) {
      actionLabel = "HAND BAG";
      canAct = true;
      hint = `Tap the bag to hand it to ${order?.customerName ?? "them"}.`;
    } else if (d.phase === "atDoor") {
      actionLabel = "PHOTO";
      canAct = true;
      hint = `Tap the bag in their hands to take the photo.`;
    }
    const interactArmed = this.clock.gameMs >= this.dropoffInteractReadyAt;
    if (!interactArmed) canAct = false;
    return {
      phase: d.phase,
      orderId: d.orderId,
      houseId: d.houseId,
      customerName: order?.customerName ?? null,
      customerLook: order ? customerLookIndex(order.customerName, order.idAge) : null,
      skuName: sku?.name ?? null,
      atCurb: d.phase === "atCurb",
      driverOnFoot: false,
      driver: d.driver ? { ...d.driver } : null,
      customer: d.customer ? { x: d.customer.x, y: d.customer.y, arrived } : null,
      photoTaken: d.photoTaken,
      idAsked: d.idAsked,
      idChecked: d.idChecked,
      bagHanded: d.bagHanded,
      actionLabel,
      canAct,
      hint,
      idCard:
        d.phase === "atDoor" && d.idAsked && !d.idChecked && order
          ? idCardFor(order.customerName, order.idAge)
          : null,
      interactArmed,
    };
  }

  private serveLine(): string {
    if (this.playerRole === "driver") {
      const stopId = this.nextStopId();
      const order = this.runOrderIds
        .map((id) => this.orderById(id))
        .find((o) => o?.destinationId === stopId && o.status === "onRun");
      if (order) {
        const sku = skuById(this.catalog, order.skuId);
        return `→  ${destLabel(order)}   ·   ${order.customerName}   ·   ${sku?.name ?? ""}   ·   ${this.runOrderIds.length} bag${this.runOrderIds.length === 1 ? "" : "s"}`;
      }
      return "Head back to Kindling";
    }
    const order = this.focusOrder();
    if (!order) return "No open tickets";
    const sku = skuById(this.catalog, order.skuId);
    if (order.type === "inStore") {
      if (this.handSkuId === order.skuId) return `HANDOFF  Counter  ·  tap ${order.customerName}`;
      return `COUNTER  ·  ${order.customerName} wants ${sku?.name ?? ""} — tap that TV`;
    }
    if (order.type === "pickup" && order.status === "readyForHandoff") {
      return `HANDOFF  Pickup  ·  tap ${order.customerName}`;
    }
    if (needsFetch(order) && this.selectedOrderId === order.id) {
      if (this.keyLeadPhase !== "idle") return `BACK ROOM  ·  grabbing ${sku?.name ?? ""}`;
      if (this.handSkuId === order.skuId) return `BAG  ·  tap a bag to pack ${sku?.name ?? ""}`;
      return `TV  ·  tap ${sku?.name ?? ""} on the wall`;
    }
    if (order.type === "pickup") {
      return `PICKUP  ·  ${order.customerName}  ·  ${sku?.name ?? ""} — tap ticket, then the strain, then a bag`;
    }
    if (order.status === "queued") {
      return `DELIVER  ${destLabel(order)}  ·  ${order.customerName}  ·  ${sku?.name ?? ""} — tap ticket, then the strain, then a bag`;
    }
    return `DELIVER  ${destLabel(order)}  ·  ${order.customerName}  ·  ${sku?.name ?? ""}`;
  }

  private focusOrder(): Order | undefined {
    if (this.selectedOrderId) {
      const selected = this.orderById(this.selectedOrderId);
      if (selected && isOpen(selected) && selected.type !== "inStore") return selected;
    }
    const instore = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (instore) return instore;
    return this.orders.find((o) => o.status === "readyForHandoff" || o.status === "inBin" || o.status === "onRun");
  }

  private focusSkuId(): string | null {
    if (this.keyLeadPhase !== "idle") return null;
    if (this.handSkuId) return null;
    const instore = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (instore && this.customerAtCounter(instore.id)) return instore.skuId;
    const ticket = this.selectedTicket();
    if (ticket) return ticket.skuId;
    return null;
  }

  private complete(order: Order): void {
    if (this.shiftEnded) return;
    order.status = "completed";
    if (order.type === "delivery") order.late = isDeliveryLate(order, this.clock.gameMs);
    if (this.playerRole === "driver" && order.type !== "delivery") this.coverServed += 1;
    const delta = scoreForComplete(order, this.clock.gameMs);
    this.score += delta;
    this.pushScoreFlash(delta);
    this.scoredActions += 1;
    this.customers = this.customers.filter((c) => c.orderId !== order.id);
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.dropQueuedTicket(order.id);
    const sku = skuById(this.catalog, order.skuId);
    if (order.type === "delivery" && order.late) {
      this.toast = `Late drop (−${Math.abs(SCORE_DELIVERY_LATE)}): ${sku?.name}.`;
    } else if (order.type === "delivery") {
      this.toast = `On-time drop (+${SCORE_DELIVERY_ON_TIME}): ${sku?.name} to ${order.customerName}!`;
    } else {
      this.toast = `Sold ${sku?.name ?? "item"} to ${order.customerName}! (+${delta})`;
    }
    this.pushSfx("sell");
  }

  private failOrder(order: Order, reason: string): void {
    if (this.shiftEnded) return;
    order.status = "failed";
    if (this.playerRole === "driver" && order.type !== "delivery") {
      this.coverLost += 1;
      this.coverLostName = order.customerName;
      this.coverLostAt = this.clock.gameMs;
    }
    const delta = scoreForFail();
    this.score += delta;
    this.pushScoreFlash(delta);
    this.scoredActions += 1;
    if (reason.includes("under 19")) this.under19Fails += 1;
    this.customers = this.customers.filter((c) => c.orderId !== order.id);
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.dropQueuedTicket(order.id);
    this.advancePackQueue();
    this.runOrderIds = this.runOrderIds.filter((id) => id !== order.id);
    if (this.dropoff?.orderId === order.id) this.clearDropoff();
    // Drop leftover fetch/hand when this order (or its SKU) was in flight — avoids ghost jars after walkout.
    if (
      order.type === "inStore" ||
      this.fetchSkuId === order.skuId ||
      this.handSkuId === order.skuId
    ) {
      this.handSkuId = null;
      this.fetchSkuId = null;
      this.keyLeadPhase = "idle";
      this.keyLeadX = KEYLEAD.x;
      this.keyLeadFacing = 1;
      this.backroomLeftMs = 0;
    }
    this.toast = `${reason} (${delta})`;
    this.pushSfx("deny");
  }

  private pushScoreFlash(delta: number): void {
    this.scoreFlashSeq += 1;
    this.scoreFlash = { id: this.scoreFlashSeq, delta };
  }

  private pushSfx(kind: SfxKind): void {
    this.sfxSeq += 1;
    this.sfxCue = { id: this.sfxSeq, kind };
  }

  private customerX(orderId: string): number | undefined {
    return this.customers.find((c) => c.orderId === orderId)?.x;
  }

  private customerAtCounter(orderId: string): boolean {
    const customer = this.customers.find((c) => c.orderId === orderId);
    if (!customer) return false;
    return Math.abs(customer.x - customer.targetX) <= 24;
  }

  private nextHouse(): string {
    const houses = CITY.houses;
    const house = houses[this.nextDeliveryHouse % houses.length]!;
    this.nextDeliveryHouse += 1;
    return house.id;
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function mulberryFrom(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function gpsPath(sim: GameSim): WorldPoint[] {
  const snap = sim.snapshot();
  const from = worldToTile(snap.vehicle.x, snap.vehicle.y);
  const start = CITY.walkable[from.r]?.[from.c] ? from : CITY.shopSpawn;
  const stopId = snap.run?.nextStopId;
  if (stopId) {
    const house = houseById(stopId);
    if (!house) return [];
    return routeWorldPoints(findPath(CITY.walkable, start, house.stop));
  }
  if (snap.playerRole !== "driver") return [];
  return routeWorldPoints(findPath(CITY.walkable, start, CITY.shopSpawn));
}

export type { HouseStop };
export type { DropoffView } from "./dropoff";
