import { createCatalog, skuById, type Sku } from "./catalog";
import { formatGameClock, GameClock } from "./clock";
import {
  CALL_CONNECT_MS,
  CUSTOMER_SPEED,
  HANDOFF_RADIUS,
  INSTORE_WALKOUT_MS,
  NPC_INTERACT_COOLDOWN_MS,
  KEYLEAD_WALK_SPEED,
  BACKROOM_MS,
  TABLET_QUEUE_MAX,
  TICKET_WAVE_MAX_MS,
  TICKET_WAVE_MIN_MS,
  FIRST_TICKET_WAVE_MS,
  MS_PER_GAME_HOUR,
  PICKUP_ARRIVE_MS,
  PICKUP_HANDOFF_WAIT_MS,
  VEHICLE_SPEED,
} from "./constants";
import { emptyDropoff, idCardFor, type DropoffPhase, type DropoffView } from "./dropoff";
import { destLabel, isOpen, needsFetch, tabletQueue, type Order, type OrderType } from "./orders";
import { findPath } from "./pathfinding";
import { generateCustomerName } from "./names";
import { isDeliveryLate, scoreForComplete, scoreForFail } from "./scoring";
import {
  CITY,
  doorstepWorld,
  houseById,
  houseTitle,
  isDriveWalkable,
  MAP_PX_H,
  MAP_PX_W,
  TILE,
  tileToWorld,
  worldToTile,
  type HouseStop,
} from "../maps/cityT0";
import { BACK_DOOR, CUSTOMER_SPOT, DOOR, KEYLEAD } from "../maps/shopT0";

export type PlayerRole = "keyLead" | "driver";

export type ShopClick =
  | { type: "keyLead" }
  | { type: "bagRack" }
  | { type: "strain"; skuId: string }
  | { type: "counterBag" }
  | { type: "receipt" }
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

export interface ReceiptView {
  customerName: string;
  skuName: string;
  destLabel: string;
  held: boolean;
}

export interface CounterBagView {
  skuId: string | null;
  skuName: string | null;
  customerName: string | null;
  destLabel: string | null;
  filled: boolean;
  hasItem: boolean;
}

export interface CustomerView {
  orderId: string;
  x: number;
  bubble: string;
  kind: "inStore" | "pickup";
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
  late: boolean;
}

export interface DeliveryRun {
  orderIds: string[];
  nextStopId: string | null;
}

export interface SimSnapshot {
  gameMs: number;
  clockLabel: string;
  score: number;
  playerRole: PlayerRole;
  catalog: Sku[];
  handSkuId: string | null;
  handSkuName: string | null;
  counterBag: CounterBagView | null;
  selectedOrderId: string | null;
  awaitingBag: boolean;
  keyLead: KeyLeadView;
  receipt: ReceiptView | null;
  vehicle: { x: number; y: number };
  customers: CustomerView[];
  orders: OrderView[];
  bagsOnPickup: string[];
  bagsInBin: string[];
  run: DeliveryRun | null;
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
  pendingDepart: boolean;
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
  idChecked: boolean;
}

interface CounterBag {
  skuId: string | null;
  orderId: string;
  hasItem: boolean;
}

export class GameSim {
  readonly catalog: Sku[];
  readonly clock = new GameClock();
  score = 0;
  playerRole: PlayerRole = "keyLead";
  vehicle = tileToWorld(CITY.shopSpawn);
  toast = "Welcome to Kindling. Watch the order screen.";
  input = { dx: 0, dy: 0 };
  autoSpawn: boolean;
  handSkuId: string | null = null;
  selectedOrderId: string | null = null;
  awaitingBag = false;
  private driverLine: string | null = null;
  private pendingDepart = false;
  private packQueue: string[] = [];

  private orders: Order[] = [];
  private customers: CustomerState[] = [];
  private nextOrderId = 1;
  private nextDeliveryHouse = 0;
  private queuedInteract = false;
  private npcCooldown = 0;
  private npcStep = 0;
  private spawnQueue: SpawnEvent[] = [];
  private lastAutoSpawn = 0;
  private nextTicketWaveAt = 0;
  private rng: () => number;
  private runOrderIds: string[] = [];
  private counterBag: CounterBag | null = null;
  private nameSeed: number;
  private dropoff: DropoffState | null = null;
  private keyLeadX = KEYLEAD.x;
  private keyLeadPhase: KeyLeadPhase = "idle";
  private keyLeadFacing = 1;
  private fetchSkuId: string | null = null;
  private backroomLeftMs = 0;
  private receiptHeld = false;

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
    this.spawnQueue = [{ atMs: this.clock.gameMs + 400, type: "inStore" }];
    this.nextTicketWaveAt = this.clock.gameMs + FIRST_TICKET_WAVE_MS;
  }

  static create(options?: SimOptions): GameSim {
    return new GameSim(options);
  }

  snapshot(): SimSnapshot {
    const bagSku = this.counterBag?.skuId ? skuById(this.catalog, this.counterBag.skuId) : undefined;
    const bagOrder = this.counterBag ? this.orderById(this.counterBag.orderId) : undefined;
    const receiptSku = bagOrder ? skuById(this.catalog, bagOrder.skuId) : undefined;
    const selected = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    return {
      gameMs: this.clock.gameMs,
      clockLabel: formatGameClock(this.clock.gameMs),
      score: this.score,
      playerRole: this.playerRole,
      catalog: this.catalog,
      handSkuId: this.handSkuId,
      handSkuName: this.handSkuId ? (skuById(this.catalog, this.handSkuId)?.name ?? null) : null,
      counterBag: this.counterBag
        ? {
            skuId: this.counterBag.skuId,
            skuName: bagSku?.name ?? receiptSku?.name ?? null,
            customerName: bagOrder?.customerName ?? null,
            destLabel: bagOrder ? destLabel(bagOrder) : null,
            filled: this.counterBag.hasItem,
            hasItem: this.counterBag.hasItem,
          }
        : null,
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
      receipt: bagOrder
        ? {
            customerName: bagOrder.customerName,
            skuName: receiptSku?.name ?? bagOrder.skuId,
            destLabel: destLabel(bagOrder),
            held: this.receiptHeld,
          }
        : null,
      vehicle: { ...this.vehicle },
      customers: this.customers.map((c) => ({
        orderId: c.orderId,
        x: c.x,
        kind: c.kind,
        bubble: this.customerBubble(c),
      })),
      orders: this.orders.filter(isOpen).map((o) => this.toView(o)),
      bagsOnPickup: this.orders.filter((o) => o.status === "onPickupShelf" || o.status === "readyForHandoff").map((o) => o.id),
      bagsInBin: this.orders.filter((o) => o.status === "inBin").map((o) => o.id),
      run: this.runSnapshot(),
      dropoff: this.toDropoffView(),
      toast: this.toast,
      serveLine: this.serveLine(),
      highlightSkuId: this.focusSkuId(),
      canHitTheRoad:
        this.playerRole === "keyLead" &&
        (this.pendingDepart ||
          this.orders.some((o) => o.status === "inBin") ||
          this.runOrderIds.length > 0),
      tabletTicket: this.toViewOrNull(this.tabletFront()),
      tabletQueueCount: tabletQueue(this.orders).length,
      keyLeadLine: this.keyLeadCallout(selected),
      driverLine: this.playerRole === "keyLead" ? this.driverLine : null,
      pendingDepart: this.playerRole === "keyLead" && this.pendingDepart,
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
    switch (click.type) {
      case "keyLead":
        this.toast = "Pick a flashing ticket, then the strain.";
        return;
      case "bagRack":
      case "counterBag":
        this.packSelected();
        return;
      case "strain":
        this.pickStrain(click.skuId);
        return;
      case "receipt":
        this.toast = "Tap a bag to pack — no extra slip to grab.";
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
  }

  spawnOrder(type: OrderType, opts: { skuId?: string; destinationId?: string } = {}): Order {
    const sku = opts.skuId
      ? skuById(this.catalog, opts.skuId)
      : this.catalog[Math.floor(this.rng() * this.catalog.length)];
    if (!sku) throw new Error("catalog empty");
    const order: Order = {
      id: `ord-${this.nextOrderId++}`,
      type,
      skuId: sku.id,
      status: type === "inStore" ? "atRegister" : "queued",
      createdAtGameMs: this.clock.gameMs,
      customerName: generateCustomerName(this.nameSeed++),
      destinationId: type === "delivery" ? (opts.destinationId ?? this.nextHouse()) : undefined,
    };
    this.orders.push(order);
    if (type === "inStore") {
      this.customers.push({
        orderId: order.id,
        x: DOOR.x,
        targetX: CUSTOMER_SPOT.x,
        kind: "inStore",
      });
      this.toast = `${order.customerName} walked in and wants ${sku.name}. Tap that TV, then tap them.`;
    } else if (type === "pickup") {
      this.toast = `Pickup ticket: ${order.customerName} — ${sku.name}`;
    } else {
      this.toast = `Delivery to ${destLabel(order)}: ${order.customerName} — ${sku.name}`;
    }
    return order;
  }

  hitTheRoad(): boolean {
    const fresh = this.orders.filter((o) => o.status === "inBin");
    if (this.playerRole === "keyLead" && fresh.length === 0 && this.runOrderIds.length === 0) {
      this.toast = "Need a named delivery bag first.";
      return false;
    }
    for (const order of fresh) {
      order.status = "onRun";
      this.runOrderIds.push(order.id);
    }
    this.playerRole = "driver";
    this.pendingDepart = false;
    this.driverLine = null;
    this.toast = this.runOrderIds.length > 1 ? "Multi-stop run. Follow the GPS." : "Hit the road. Follow the GPS.";
    return true;
  }

  backToShop(): boolean {
    this.clearDropoff();
    this.playerRole = "keyLead";
    this.pendingDepart = false;
    this.driverLine = null;
    this.toast = this.runOrderIds.length
      ? "Back at Kindling. Remaining bags stay on the bike."
      : "Back at Kindling. Watch the order screen.";
    return true;
  }

  tick(dtMs: number): void {
    this.clock.tick(dtMs);
    this.syncCurb();
    if (this.playerRole === "driver" && this.dropoff?.phase !== "atDoor") this.moveVehicle(this.input.dx, this.input.dy, dtMs / 1000);
    this.moveCustomers(dtMs);
    this.tickKeyLead(dtMs);
    this.tickCall();
    if (this.queuedInteract) {
      this.queuedInteract = false;
      this.interact();
    }
    if (this.playerRole === "driver") this.tickNpc(dtMs);
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
    const ticket = this.selectedTicket();
    const walkIn = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (ticket) {
      if (this.handSkuId === ticket.skuId) {
        this.toast = `Already holding ${skuById(this.catalog, ticket.skuId)?.name}. Tap a bag.`;
        return;
      }
      if (skuId !== ticket.skuId) {
        this.toast = `Wrong TV. ${ticket.customerName} ordered ${skuById(this.catalog, ticket.skuId)?.name}.`;
        return;
      }
      this.startFetch(skuId);
      return;
    }
    if (walkIn) {
      if (skuId !== walkIn.skuId) {
        this.toast = `Wrong TV. ${walkIn.customerName} wants ${skuById(this.catalog, walkIn.skuId)?.name}.`;
        return;
      }
      if (this.handSkuId === skuId) {
        this.toast = `Already holding ${sku.name}. Tap ${walkIn.customerName}.`;
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
      order.slaStartGameMs = this.clock.gameMs;
      this.toast = `Bag labeled ${destLabel(order)} · ${order.customerName}. Ready to roll.`;
    } else {
      order.status = "onPickupShelf";
      order.slaStartGameMs = this.clock.gameMs;
      this.toast = `Pickup bag for ${order.customerName} is waiting.`;
    }
    this.counterBag = null;
    this.receiptHeld = false;
    this.awaitingBag = false;
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.advancePackQueue();
  }

  private claimedTicketIds(): Set<string> {
    const ids = new Set(this.packQueue);
    if (this.selectedOrderId) ids.add(this.selectedOrderId);
    if (this.counterBag) ids.add(this.counterBag.orderId);
    return ids;
  }

  private ticketInProgress(): boolean {
    if (this.counterBag) return true;
    const selected = this.selectedOrderId ? this.orderById(this.selectedOrderId) : undefined;
    return !!selected && selected.type !== "inStore" && needsFetch(selected);
  }

  private beginTicket(order: Order): void {
    this.selectedOrderId = order.id;
    this.driverLine = null;
    this.pendingDepart = false;
    const sku = skuById(this.catalog, order.skuId);
    this.toast =
      order.type === "delivery"
        ? `Delivery to ${destLabel(order)}: ${order.customerName} — ${sku?.name}. Tap that TV, then a bag.`
        : `Pickup: ${order.customerName} — ${sku?.name}. Tap that TV, then a bag.`;
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
    if (this.selectedOrderId === order.id || this.counterBag?.orderId === order.id) {
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
    const here = waiting && Math.abs((this.customerX(waiting.id) ?? 0) - CUSTOMER_SPOT.x) < 40;
    if (waiting && here) {
      this.complete(waiting);
      return;
    }
    this.toast = waiting ? "Wait for them at the counter." : "Nobody is waiting for a bag.";
  }

  private onCustomerTap(orderId: string): void {
    const order = this.orderById(orderId);
    if (!order || !isOpen(order)) return;
    if (order.type === "inStore") {
      this.selectedOrderId = orderId;
      this.tryServeWalkIn(order);
      return;
    }
    if (order.status === "readyForHandoff") {
      this.complete(order);
      return;
    }
    this.tryHandoff();
  }

  private tryServeWalkIn(order?: Order): boolean {
    const target =
      order ?? this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (!target) return false;
    const sku = skuById(this.catalog, target.skuId);
    if (!this.handSkuId) {
      this.toast = `Tap the ${sku?.name ?? "strain"} TV, then tap ${target.customerName}.`;
      return true;
    }
    if (this.keyLeadPhase !== "idle") {
      this.toast = "Wait — they're grabbing it.";
      return true;
    }
    if (this.handSkuId !== target.skuId) {
      this.toast = `Wrong strain. ${target.customerName} wants ${sku?.name ?? "a different jar"}.`;
      return true;
    }
    this.handSkuId = null;
    this.complete(target);
    return true;
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
      late: order.type === "delivery" && isDeliveryLate(order, this.clock.gameMs),
    };
  }

  private customerBubble(customer: CustomerState): string {
    const order = this.orderById(customer.orderId);
    const sku = order ? skuById(this.catalog, order.skuId) : undefined;
    if (!order || !sku) return "";
    if (customer.kind === "pickup") return order.status === "readyForHandoff" ? "Tap me — pickup" : "Pickup";
    if (Math.abs(customer.x - customer.targetX) > 24) return "Coming in…";
    if (order.status === "readyForHandoff") return `Tap me — ${sku.name}`;
    if (this.handSkuId === order.skuId) return `Tap me — ${sku.name}`;
    return `I want ${sku.name}`;
  }

  private moveVehicle(dx: number, dy: number, dt: number): void {
    const len = Math.hypot(dx, dy);
    if (len < 0.05) return;
    const nx = dx / len;
    const ny = dy / len;
    const speed = VEHICLE_SPEED * dt;
    const tryX = this.vehicle.x + nx * speed;
    const tryY = this.vehicle.y + ny * speed;
    if (!collides(tryX, this.vehicle.y)) this.vehicle.x = tryX;
    if (!collides(this.vehicle.x, tryY)) this.vehicle.y = tryY;
    this.vehicle.x = clamp(this.vehicle.x, TILE, MAP_PX_W - TILE);
    this.vehicle.y = clamp(this.vehicle.y, TILE, MAP_PX_H - TILE);
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
          const sku = skuById(this.catalog, order.skuId);
          this.toast = `${order.customerName} is at the counter and wants ${sku?.name ?? "a strain"}. Tap that TV, then tap them.`;
        }
        continue;
      }
      customer.x += Math.sign(delta) * step;
    }
  }

  private tickNpc(dtMs: number): void {
    this.npcCooldown -= dtMs;
    if (this.npcCooldown > 0) return;
    if (this.keyLeadPhase !== "idle") {
      this.npcCooldown = NPC_INTERACT_COOLDOWN_MS;
      return;
    }
    const instore = this.orders.find((o) => o.type === "inStore" && o.status === "atRegister");
    if (instore) {
      if (this.handSkuId !== instore.skuId) this.shopClick({ type: "strain", skuId: instore.skuId });
      else this.shopClick({ type: "customer", orderId: instore.id });
      this.npcCooldown = NPC_INTERACT_COOLDOWN_MS;
      return;
    }
    const open = this.orders.find((o) => needsFetch(o) && o.type !== "inStore");
    const pickupWait = this.orders.find((o) => o.status === "readyForHandoff");
    if (pickupWait) {
      this.shopClick({ type: "handoff" });
      this.npcCooldown = NPC_INTERACT_COOLDOWN_MS;
      return;
    }
    if (!open) return;
    if (this.selectedOrderId !== open.id) this.shopClick({ type: "tablet", orderId: open.id });
    else if (!this.handSkuId) this.shopClick({ type: "strain", skuId: open.skuId });
    else this.shopClick({ type: "bagRack" });
    this.npcCooldown = NPC_INTERACT_COOLDOWN_MS;
    this.npcStep += 1;
  }

  private tickTimers(): void {
    for (const order of [...this.orders]) {
      if (
        (order.status === "onPickupShelf" || order.status === "readyForHandoff") &&
        order.slaStartGameMs !== undefined
      ) {
        const elapsed = this.clock.gameMs - order.slaStartGameMs;
        if (elapsed >= PICKUP_ARRIVE_MS + PICKUP_HANDOFF_WAIT_MS) {
          this.failOrder(order, "Pickup no-show.");
          continue;
        }
        if (elapsed >= PICKUP_ARRIVE_MS && order.status === "onPickupShelf") {
          order.status = "readyForHandoff";
          order.arriveAtGameMs = order.slaStartGameMs + PICKUP_ARRIVE_MS;
          if (!this.customers.some((c) => c.orderId === order.id)) {
            this.customers.push({
              orderId: order.id,
              x: DOOR.x,
              targetX: CUSTOMER_SPOT.x,
              kind: "pickup",
            });
          }
          this.toast = `${order.customerName} is here for pickup.`;
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
    const stopId = this.nextStopId();
    if (!stopId) {
      this.toast = "Nothing on the bike. Head back to Kindling.";
      return;
    }
    const house = houseById(stopId);
    if (!house) return;
    const pos = tileToWorld(house.stop);
    const atCurb = dist(this.vehicle.x, this.vehicle.y, pos.x, pos.y) <= HANDOFF_RADIUS;

    if (!this.dropoff || this.dropoff.houseId !== stopId) {
      if (!atCurb) {
        this.toast = `Park at ${houseTitle(stopId)}, then call the customer.`;
        return;
      }
      this.beginCurb(stopId);
    }

    const d = this.dropoff;
    if (!d) return;

    if (d.phase === "atCurb") {
      d.phase = "calling";
      d.callDoneAt = this.clock.gameMs + CALL_CONNECT_MS;
      this.toast = `Calling ${this.orderById(d.orderId)?.customerName ?? "customer"}…`;
      return;
    }
    if (d.phase === "calling") {
      this.toast = "Phone is ringing…";
      return;
    }

    if (d.phase === "atDoor") {
      if (!d.photoTaken) {
        d.photoTaken = true;
        this.toast = "Bag photo saved.";
        return;
      }
      if (!d.idChecked) {
        const order = this.orderById(d.orderId);
        const card = idCardFor(order?.customerName ?? "Customer");
        if (!card.ageOk) {
          this.toast = "ID check failed.";
          return;
        }
        d.idChecked = true;
        this.toast = `ID checks out — 21+. Hand ${order?.customerName ?? "them"} the bag.`;
        return;
      }
      const order = this.runOrderIds
        .map((id) => this.orderById(id))
        .find((o) => o?.destinationId === d.houseId && o.status === "onRun");
      if (!order) return;
      this.complete(order);
      this.runOrderIds = this.runOrderIds.filter((id) => id !== order.id);
      this.clearDropoff();
      if (this.runOrderIds.length === 0) {
        this.toast = "Run complete. Back to Kindling.";
      } else {
        this.toast = `Dropped. GPS → ${this.nextStopId() ? houseTitle(this.nextStopId()!) : "Kindling"}.`;
      }
      return;
    }
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
      idChecked: false,
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
    let hint = order ? `Park at ${destLabel(order)} — ${order.customerName}.` : "Park on the pin, then call from your phone.";
    if (d.phase === "atCurb") {
      actionLabel = "CALL";
      canAct = true;
      hint = `Call ${order?.customerName ?? "the customer"} at ${order ? destLabel(order) : "this house"}.`;
    } else if (d.phase === "calling") {
      actionLabel = "RINGING";
      hint = `Calling ${order?.customerName ?? "customer"} at ${order ? destLabel(order) : "the house"}…`;
    } else if (d.phase === "atDoor" && !d.photoTaken) {
      actionLabel = "PHOTO";
      canAct = true;
      hint = `Photo the bag for ${order?.customerName ?? "the drop"}.`;
    } else if (d.phase === "atDoor" && !d.idChecked) {
      actionLabel = "CHECK ID";
      canAct = true;
      hint = `Check ID for ${order?.customerName ?? "the customer"} — must be 21+.`;
    } else if (d.phase === "atDoor") {
      actionLabel = "HAND BAG";
      canAct = true;
      hint = `Hand ${order?.customerName ?? "them"} the bag.`;
    }
    return {
      phase: d.phase,
      orderId: d.orderId,
      houseId: d.houseId,
      customerName: order?.customerName ?? null,
      skuName: sku?.name ?? null,
      atCurb: d.phase === "atCurb",
      driverOnFoot: false,
      driver: d.driver ? { ...d.driver } : null,
      customer: d.customer ? { x: d.customer.x, y: d.customer.y, arrived } : null,
      photoTaken: d.photoTaken,
      idChecked: d.idChecked,
      actionLabel,
      canAct,
      hint,
      idCard: d.phase === "atDoor" && d.photoTaken && !d.idChecked ? idCardFor(order?.customerName ?? "Customer") : null,
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
        return `GPS  →  ${destLabel(order)}   ·   ${order.customerName}   ·   ${sku?.name ?? ""}   ·   ${this.runOrderIds.length} bag${this.runOrderIds.length === 1 ? "" : "s"}`;
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
    if (this.counterBag) {
      const packing = this.orderById(this.counterBag.orderId);
      if (packing && isOpen(packing)) return packing;
    }
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
    if (instore) return instore.skuId;
    const ticket = this.selectedTicket();
    if (ticket) return ticket.skuId;
    return null;
  }

  private complete(order: Order): void {
    order.status = "completed";
    if (order.type === "delivery") order.late = isDeliveryLate(order, this.clock.gameMs);
    this.score += scoreForComplete(order, this.clock.gameMs);
    this.customers = this.customers.filter((c) => c.orderId !== order.id);
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.dropQueuedTicket(order.id);
    const sku = skuById(this.catalog, order.skuId);
    if (order.type === "delivery" && order.late) this.toast = `Late drop: ${sku?.name}.`;
    else this.toast = `Sold ${sku?.name ?? "item"} to ${order.customerName}!`;
  }

  private failOrder(order: Order, reason: string): void {
    order.status = "failed";
    this.score += scoreForFail();
    this.customers = this.customers.filter((c) => c.orderId !== order.id);
    if (this.counterBag?.orderId === order.id) {
      this.counterBag = null;
      this.receiptHeld = false;
    }
    if (this.selectedOrderId === order.id) this.selectedOrderId = null;
    this.dropQueuedTicket(order.id);
    this.advancePackQueue();
    this.toast = reason;
  }

  private customerX(orderId: string): number | undefined {
    return this.customers.find((c) => c.orderId === orderId)?.x;
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

function collides(x: number, y: number): boolean {
  return pointsBlocked(x, y, 24, (t) => !isDriveWalkable(t));
}

function pointsBlocked(
  x: number,
  y: number,
  half: number,
  blocked: (t: { c: number; r: number }) => boolean,
): boolean {
  const points = [
    { x: x - half, y: y - half },
    { x: x + half, y: y - half },
    { x: x - half, y: y + half },
    { x: x + half, y: y + half },
  ];
  return points.some((p) => blocked(worldToTile(p.x, p.y)));
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

export function gpsPath(sim: GameSim): { x: number; y: number }[] {
  const snap = sim.snapshot();
  const stopId = snap.run?.nextStopId;
  if (!stopId) return [];
  const house = houseById(stopId);
  if (!house) return [];
  const from = worldToTile(snap.vehicle.x, snap.vehicle.y);
  if (!CITY.walkable[from.r]?.[from.c]) {
    const spawn = CITY.shopSpawn;
    return findPath(CITY.walkable, spawn, house.stop).map(tileToWorld);
  }
  return findPath(CITY.walkable, from, house.stop).map(tileToWorld);
}

export type { HouseStop };
export type { DropoffView } from "./dropoff";
