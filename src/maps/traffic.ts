import { CITY, TILE, isEWStreet, isNSStreet } from "./cityT0";
import type { TileCell } from "../sim/pathfinding";
import { orthogonalLanePath, type WorldPoint } from "../sim/driveRoute";

export interface TrafficLoop {
  id: string;
  points: WorldPoint[];
  length: number;
}

export interface TrafficCarView {
  id: string;
  x: number;
  y: number;
  key: string;
  depth: number;
  angle: number;
  /** Travel speed along the loop in px/s. */
  speed: number;
}

type CarState = {
  id: string;
  loop: TrafficLoop;
  /** Progress 0–1 around the loop. */
  t: number;
  key: string;
  depth: number;
  speed: number;
};

export type TrafficObstacle = {
  x: number;
  y: number;
  heading: number;
};

const CAR_KEYS = ["tex-car", "tex-car-2"] as const;

/** Minimum center-to-center gap so cars never stack through each other (or the van). */
export const TRAFFIC_MIN_SEP = 110;

/** How far ahead the delivery van looks for a slower lead car. */
export const TRAFFIC_LOOK_AHEAD = 180;

/** How far traffic looks for the delivery van to hold back in-lane. */
export const TRAFFIC_VAN_DETECT = 240;

/** Lateral lane tolerance when deciding a car is “in front”. */
export const TRAFFIC_LANE_WIDTH = 72;

/** Ambient car pace in px/s: base plus a per-loop step so lanes are not lockstep. */
export const TRAFFIC_BASE_SPEED = 115;
export const TRAFFIC_SPEED_STEP = 22;

/**
 * Traffic pace trim layered on the base pace — 1.449 = 45% faster ambient cars, compounded
 * from the trims as they were asked for: 1.15, then 5% (1.2075), then 20%.
 */
export const TRAFFIC_SPEED_SCALE = 1.449;

/**
 * Extra room the van leaves behind the car it queues behind — 1.21 = 21% further back
 * (1.1 × 1.1). Layered on the {@link TRAFFIC_MIN_SEP} bands below; both stay inside
 * {@link TRAFFIC_LOOK_AHEAD} so the van still sees the lead car it is reacting to. At 1.21
 * the widest band, {@link VAN_MATCH_GAP}, sits at 159.7 against a 180 look-ahead.
 */
export const VAN_FOLLOW_GAP_SCALE = 1.21;

/** Nose-to-tail: inside this gap the van eases to a crawl. */
export const VAN_CRAWL_GAP = TRAFFIC_MIN_SEP * 0.92 * VAN_FOLLOW_GAP_SCALE;

/** Inside this gap the van holds the lead car's speed instead of closing in. */
export const VAN_MATCH_GAP = TRAFFIC_MIN_SEP * 1.2 * VAN_FOLLOW_GAP_SCALE;

/**
 * Hard clearance a lead car keeps from the van queued behind it. This is what the settled
 * queueing distance actually lands on, so it takes the same trim as the bands above.
 * Cars *behind* the van still use the plain {@link TRAFFIC_MIN_SEP}.
 */
export const VAN_FOLLOW_MIN_SEP = TRAFFIC_MIN_SEP * VAN_FOLLOW_GAP_SCALE;

/**
 * How near perpendicular two headings must be to count as crossing paths rather than one
 * following the other. The city is an orthogonal grid, so |cos Δ| is ~1 for a lead car in
 * the same lane, ~1 for an oncoming car (negated) and ~0 for a crossing one; a threshold of
 * 0.5 admits everything within 30° of a right angle and excludes both parallel cases.
 */
export const TRAFFIC_CROSS_DOT = 0.5;

/** How far ahead a vehicle looks for a junction another vehicle is crossing. */
export const TRAFFIC_CROSS_LOOK = 160;

/** Once a crossing vehicle is this far past the junction it no longer holds anyone up. */
export const TRAFFIC_CROSS_CLEAR = 40;

/**
 * Where a giving-way vehicle waits: far enough short of the junction that the vehicle
 * crossing it still clears {@link TRAFFIC_MIN_SEP} at the moment it is on the junction.
 */
export const TRAFFIC_CROSS_STOP_GAP = TRAFFIC_MIN_SEP;

/**
 * Ceiling on how far back a wait may pin an ambient car. A car's position is derived from
 * `gameMs`, so a hold is applied fresh each call as a retreat from where the car would
 * otherwise be, and it snaps forward by that much when the junction clears. Capping the
 * retreat keeps that catch-up no larger than the one the existing van hold already makes.
 * Past the cap the car noses on and {@link TRAFFIC_MIN_SEP} is the backstop, as before.
 */
export const TRAFFIC_CROSS_MAX_HOLD = TRAFFIC_MIN_SEP;

/** Van cruise fraction while it eases up to a junction it has to give way at. */
export const VAN_YIELD_CREEP = 0.3;

/**
 * How far the van's steering has to diverge from where its nose points before the turn
 * counts as cutting across a lane rather than following one.
 */
export const VAN_CROSS_INTENT_MIN = Math.PI / 4;

/**
 * Room an approaching car must leave before the van will cut across its lane to park.
 *
 * This is gap acceptance, deliberately not the nearest-goes rule the junctions use. Turning
 * across a lane puts the van *nearer* the point it is crossing than the car coming down
 * that lane, so right of way would wave it straight into the flank it is trying to avoid.
 * What matters is whether the lane is clear enough to traverse: one car length, against a
 * crossing that takes the van a fraction of a second at cruise.
 */
export const VAN_CROSS_ACCEPT_GAP = TRAFFIC_MIN_SEP;

/** Inside this distance to the junction the van has stopped creeping and is holding. */
export const VAN_YIELD_STOP_GAP = TRAFFIC_CROSS_STOP_GAP;

/** Spawn density vs a full loop fill — 0.75 = 25% fewer cars on the road. */
export const TRAFFIC_DENSITY = 0.75;

/** Shared ambient loop budget (routes stay dense; cars are thinned by TRAFFIC_DENSITY). */
export const TRAFFIC_LOOP_MAX = 6;

/**
 * Hard cap on DriveScene traffic sprites — matches max cars after density filter
 * (6 loops × 2 cars × 0.75 density ≈ 9; 12 leaves headroom for loop growth).
 */
export const TRAFFIC_VISUAL_MAX = 12;

let cachedLoops: TrafficLoop[] | null = null;

/** Shared city loops so DriveScene and the sim use the same cars. */
export function cityTrafficLoops(): TrafficLoop[] {
  if (!cachedLoops) cachedLoops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
  return cachedLoops;
}

function isRoad(cell: TileCell): boolean {
  return CITY.kinds[cell.r]?.[cell.c] === "road";
}

function loopLength(points: readonly WorldPoint[]): number {
  if (points.length < 2) return 0;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  length += Math.hypot(points[0]!.x - points[points.length - 1]!.x, points[0]!.y - points[points.length - 1]!.y);
  return Math.max(TILE * 2, length);
}

type EwPair = { north: number; south: number };
type NsPair = { west: number; east: number };

function ewStreetPairs(): EwPair[] {
  const pairs: EwPair[] = [];
  for (let r = 0; r < CITY.kinds.length - 1; r++) {
    if (isEWStreet(r) && isEWStreet(r + 1)) pairs.push({ north: r, south: r + 1 });
  }
  return pairs;
}

function nsStreetPairs(): NsPair[] {
  const pairs: NsPair[] = [];
  const cols = CITY.kinds[0]?.length ?? 0;
  for (let c = 0; c < cols - 1; c++) {
    if (isNSStreet(c) && isNSStreet(c + 1)) pairs.push({ west: c, east: c + 1 });
  }
  return pairs;
}

/**
 * Clockwise one-way loop on the legal curb lanes of two EW + two NS street pairs.
 * Eastbound uses the south tile, westbound the north, southbound the west, northbound the east —
 * so opposing traffic never shares a lane.
 */
function oneWayBlockLoop(north: EwPair, south: EwPair, west: NsPair, east: NsPair): TileCell[] | null {
  const topR = north.south;
  const botR = south.north;
  const leftC = west.east;
  const rightC = east.west;
  if (botR - topR < 3 || rightC - leftC < 4) return null;
  const cells: TileCell[] = [];
  for (let c = leftC; c <= rightC; c++) cells.push({ c, r: topR });
  for (let r = topR + 1; r <= botR; r++) cells.push({ c: rightC, r });
  for (let c = rightC - 1; c >= leftC; c--) cells.push({ c, r: botR });
  for (let r = botR - 1; r > topR; r--) cells.push({ c: leftC, r });
  if (cells.length < 8) return null;
  if (!cells.every(isRoad)) return null;
  return cells;
}

/** Ambient cars on closed road loops (roads only — not parking stalls). */
export function buildTrafficLoops(max = TRAFFIC_LOOP_MAX): TrafficLoop[] {
  const loops: TrafficLoop[] = [];
  const seen = new Set<string>();
  const ew = ewStreetPairs();
  const ns = nsStreetPairs();

  for (let i = 0; i < ew.length && loops.length < max; i++) {
    for (let j = i + 1; j < ew.length && loops.length < max; j++) {
      const north = ew[i]!;
      const south = ew[j]!;
      if (south.north - north.south < 3) continue;
      for (let a = 0; a < ns.length && loops.length < max; a++) {
        for (let b = a + 1; b < ns.length && loops.length < max; b++) {
          const west = ns[a]!;
          const east = ns[b]!;
          if (east.west - west.east < 4) continue;
          if ((a + b + i + j) % 3 !== 0) continue;
          const cells = oneWayBlockLoop(north, south, west, east);
          if (!cells) continue;
          const key = `${north.south},${west.east}-${south.north},${east.west}`;
          if (seen.has(key)) continue;
          seen.add(key);
          // Tile centers on legal one-way lanes — orthogonal only, no corner cutting.
          const points = orthogonalLanePath(cells);
          loops.push({ id: `loop-${loops.length}`, points, length: loopLength(points) });
        }
      }
    }
  }

  return loops;
}

/**
 * Moving traffic that yields so cars keep a minimum gap — they do not pass through
 * each other or the delivery van when `obstacle` is provided.
 * When the van is ahead in-lane, cars hold back (never change lanes).
 */
export function trafficCars(
  gameMs: number,
  loops: readonly TrafficLoop[],
  obstacle?: TrafficObstacle | null,
): TrafficCarView[] {
  if (loops.length === 0) return [];

  const states: CarState[] = [];
  loops.forEach((loop, i) => {
    const speed = (TRAFFIC_BASE_SPEED + (i % 3) * TRAFFIC_SPEED_STEP) * TRAFFIC_SPEED_SCALE;
    const stagger = i * 2_800 + (i % 2) * 1_400;
    const dist = ((gameMs + stagger) * speed) / 1000;
    const carsOnLoop = loop.length > TILE * 14 ? 2 : 1;
    for (let k = 0; k < carsOnLoop; k++) {
      const spaced = dist / loop.length + k / carsOnLoop;
      states.push({
        id: `${loop.id}-${k}`,
        loop,
        t: ((spaced % 1) + 1) % 1,
        key: CAR_KEYS[(i + k) % CAR_KEYS.length]!,
        depth: 5,
        speed,
      });
    }
  });

  const keep = Math.max(1, Math.round(states.length * TRAFFIC_DENSITY));
  if (states.length > keep) {
    const picked: CarState[] = [];
    for (let i = 0; i < keep; i++) {
      picked.push(states[Math.floor((i + 0.5) * (states.length / keep))]!);
    }
    states.length = 0;
    states.push(...picked);
  }

  // Junction yield: where two paths cross, whoever is further from the crossing gives way
  // and waits short of it instead of driving through the other's flank. Cars sharing a loop
  // share one path, so they follow rather than cross — that is the separation pass below.
  const poses = states.map((car) => {
    const p = pointAlongLoop(car.loop.points, car.t);
    return { x: p.x, y: p.y, heading: headingAlongLoop(car.loop.points, car.t) };
  });
  const junctionHold = states.map(() => 0);
  for (let a = 0; a < states.length; a++) {
    for (let b = 0; b < states.length; b++) {
      if (a === b) continue;
      const car = states[a]!;
      const other = states[b]!;
      if (car.loop === other.loop) continue;
      const conflict = crossingConflict(poses[a]!, poses[b]!);
      if (!conflict || !givesWay(conflict.self, conflict.other, car.id > other.id)) continue;
      junctionHold[a] = Math.max(junctionHold[a]!, holdBackFor(conflict.self));
    }
  }
  // Decided against the same snapshot for every car, so the outcome does not depend on the
  // order the pairs happen to be visited in.
  states.forEach((car, i) => {
    const hold = junctionHold[i]!;
    if (hold <= 0) return;
    car.t = ((car.t - hold / Math.max(TILE, car.loop.length)) % 1 + 1) % 1;
    car.speed = 0;
  });

  // Car↔car separation.
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let a = 0; a < states.length; a++) {
      for (let b = a + 1; b < states.length; b++) {
        const ca = states[a]!;
        const cb = states[b]!;
        const pa = pointAlongLoop(ca.loop.points, ca.t);
        const pb = pointAlongLoop(cb.loop.points, cb.t);
        const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (gap >= TRAFFIC_MIN_SEP) continue;
        const need = TRAFFIC_MIN_SEP - gap + 4;
        const follower = pickFollower(ca, cb, pa, pb) === ca ? ca : cb;
        const retreat = need / Math.max(TILE, follower.loop.length);
        follower.t = ((follower.t - retreat) % 1 + 1) % 1;
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Van awareness: hold only when the van is ahead in-lane (not when catching up from behind).
  if (obstacle) {
    for (const car of states) {
      const p = pointAlongLoop(car.loop.points, car.t);
      const heading = headingAlongLoop(car.loop.points, car.t);
      const dx = obstacle.x - p.x;
      const dy = obstacle.y - p.y;
      const gap = Math.hypot(dx, dy);
      const cos = Math.cos(heading);
      const sin = Math.sin(heading);
      const forward = cos * dx + sin * dy;
      const lateral = -sin * dx + cos * dy;

      let hold = 0;
      if (gap < TRAFFIC_VAN_DETECT && Math.abs(lateral) < TRAFFIC_LANE_WIDTH * 1.35 && forward > 24) {
        // Van is ahead in this lane — hold back. A van approaching from behind must not stop us
        // (that caused mutual crawl when auto-drive matched speed 0).
        hold = Math.max(4, (TRAFFIC_MIN_SEP * 1.35 - Math.min(gap, TRAFFIC_MIN_SEP * 1.35)) + 8);
      }

      // Give way where the van's path crosses this lane, on the same nearest-goes rule cars
      // use between themselves. Setting speed to 0 here is also what releases the van:
      // driveSpeedForTraffic will not wait on a car that has already stopped for it.
      const conflict = crossingConflict({ x: p.x, y: p.y, heading }, obstacle);
      if (conflict && vanHasRightOfWay(conflict.other, conflict.self)) {
        hold = Math.max(hold, holdBackFor(conflict.self));
      }

      if (hold > 0) {
        const step = hold / Math.max(TILE, car.loop.length);
        car.t = ((car.t - step) % 1 + 1) % 1;
        car.speed = 0;
      }

      // Clear the van's footprint. Re-measure each pass: around a corner, backing up N px
      // along the lane opens less than N px of straight-line gap, so one shove can fall short.
      // A car the van is queued behind leaves the wider follow clearance.
      const away = forward >= 0 ? -1 : 1;
      const minSep = forward >= 0 ? TRAFFIC_MIN_SEP : VAN_FOLLOW_MIN_SEP;
      for (let pass = 0; pass < 8; pass++) {
        const q = pointAlongLoop(car.loop.points, car.t);
        const short = minSep - Math.hypot(obstacle.x - q.x, obstacle.y - q.y);
        if (short <= 0) break;
        const step = (short + 6) / Math.max(TILE, car.loop.length);
        car.t = ((car.t + away * step) % 1 + 1) % 1;
      }
    }
  }

  return states.map((car) => {
    const pos = pointAlongLoop(car.loop.points, car.t);
    const angle = headingAlongLoop(car.loop.points, car.t, car.loop.length);
    return {
      id: car.id,
      x: pos.x,
      y: pos.y,
      key: car.key,
      depth: car.depth,
      angle,
      speed: car.speed,
    };
  });
}

/** Speed of the nearest same-lane car ahead of the delivery van, or null if clear. */
export function leadTrafficSpeed(
  player: TrafficObstacle,
  cars: readonly TrafficCarView[],
  lookAhead = TRAFFIC_LOOK_AHEAD,
): number | null {
  const lead = findLeadCar(player, cars, lookAhead);
  return lead ? lead.car.speed : null;
}

/**
 * Cruise speed for the van: match a lead car, ease off if nose-to-tail, give way to a car
 * crossing the junction ahead, and wait for a gap before cutting across a lane.
 *
 * `intent` is the heading the van is steering toward, which is not the one it is pointing
 * along while it turns. Pass it and the van sees the lane it is about to enter; leave it out
 * and the van reacts only to what is in front of its nose.
 */
export function driveSpeedForTraffic(
  player: TrafficObstacle,
  cars: readonly TrafficCarView[],
  cruise: number,
  lookAhead = TRAFFIC_LOOK_AHEAD,
  intent?: number,
): number {
  const lead = findLeadCar(player, cars, lookAhead);
  let speed = cruise;
  if (lead) {
    if (lead.dist < VAN_CRAWL_GAP) speed = Math.min(cruise * 0.15, lead.car.speed * 0.4);
    else if (lead.dist < VAN_MATCH_GAP) speed = Math.min(cruise, lead.car.speed);
    else speed = Math.min(cruise, lead.car.speed + 20);
    // Never softlock behind a fully stopped lead (yield-to-van zero).
    speed = Math.max(speed, cruise * 0.2);
  }

  // Ease up to the junction, hold at the stop line, then fall in behind. Unlike the lead-car
  // bands this may reach a true zero, because a crawl into a car crossing your nose is still
  // a collision — but only ever while a *moving* car owns the junction, which is what bounds
  // the wait. See findCrossingCar for why the two sides can never both be waiting.
  const crossing = findCrossingCar(player, cars, lookAhead);
  if (crossing) {
    speed = crossing.dist <= VAN_YIELD_STOP_GAP ? 0 : Math.min(speed, cruise * VAN_YIELD_CREEP);
  }

  // Cutting across a lane to reach a stall is a crossing the van's nose cannot see: while it
  // is still pointing along its own lane, the lane it is about to cross carries *oncoming*
  // traffic, and oncoming is deliberately not a crossing conflict. Looking down the heading
  // it is steering toward is what puts that lane in view before the van is in it.
  if (intent !== undefined && Math.abs(headingGap(intent, player.heading)) > VAN_CROSS_INTENT_MIN) {
    const lane = findLaneToCross(player, intent, cars, lookAhead);
    if (lane) speed = lane.dist <= VAN_YIELD_STOP_GAP ? 0 : Math.min(speed, cruise * VAN_YIELD_CREEP);
  }
  return speed;
}

/** Signed smallest angle from `b` to `a`, in (-π, π]. */
function headingGap(a: number, b: number): number {
  return Math.atan2(Math.sin(a - b), Math.cos(a - b));
}

/**
 * The nearest car whose lane the van's next turn would cut through, and which has not left
 * enough room to take the gap. Stopped cars are skipped for the same reason as at junctions:
 * a car that has stopped may well have stopped for the van, and waiting on it would be the
 * one way the two of them could sit there forever.
 */
function findLaneToCross(
  player: TrafficObstacle,
  intent: number,
  cars: readonly TrafficCarView[],
  lookAhead: number,
): { car: TrafficCarView; dist: number } | null {
  const steering = { x: player.x, y: player.y, heading: intent };
  let best: TrafficCarView | null = null;
  let bestDist = Infinity;
  for (const car of cars) {
    if (car.speed <= 0) continue;
    const conflict = crossingConflict(steering, { x: car.x, y: car.y, heading: car.angle });
    if (!conflict || conflict.self > lookAhead) continue;
    if (conflict.other > VAN_CROSS_ACCEPT_GAP) continue;
    if (conflict.self >= bestDist) continue;
    best = car;
    bestDist = conflict.self;
  }
  return best ? { car: best, dist: bestDist } : null;
}

/** Signed distances from each vehicle to the point where their paths cross. */
type CrossConflict = { self: number; other: number };

/**
 * Where two vehicles' paths cross, measured along each one's own heading, or null when they
 * do not conflict. Positive means the crossing is still ahead of that vehicle.
 *
 * The city is an orthogonal grid, so a crossing pair is perpendicular and the intersection
 * of their two rays reduces to one projection each. A conflict needs the crossing to be
 * ahead of `self` and within reach, and `other` to be at the junction — not still a street
 * away from it, and not already through it.
 */
function crossingConflict(self: TrafficObstacle, other: TrafficObstacle): CrossConflict | null {
  const ux = Math.cos(self.heading);
  const uy = Math.sin(self.heading);
  const vx = Math.cos(other.heading);
  const vy = Math.sin(other.heading);
  if (Math.abs(ux * vx + uy * vy) >= TRAFFIC_CROSS_DOT) return null;
  const dx = other.x - self.x;
  const dy = other.y - self.y;
  const selfToJunction = dx * ux + dy * uy;
  const otherToJunction = -(dx * vx + dy * vy);
  if (selfToJunction <= 0 || selfToJunction > TRAFFIC_CROSS_LOOK) return null;
  if (otherToJunction <= -TRAFFIC_CROSS_CLEAR || otherToJunction > TRAFFIC_CROSS_LOOK) return null;
  return { self: selfToJunction, other: otherToJunction };
}

/**
 * Right of way: whoever is still furthest from the junction gives way. It is one strict
 * comparison on one number, so of any pair exactly one side yields and the other keeps
 * moving — a mutual wait is not a state this can produce. `tieBreak` settles an exact draw.
 */
function givesWay(selfToJunction: number, otherToJunction: number, tieBreak: boolean): boolean {
  if (selfToJunction > otherToJunction) return true;
  if (selfToJunction < otherToJunction) return false;
  return tieBreak;
}

/**
 * The same rule for a van/car pair, as one predicate both sides read: the car holds when this
 * says the van goes, and the van holds when it says otherwise. Kept in one place because two
 * separate comparisons could agree on every distance except an exact draw and leave an
 * equidistant pair either both driving on or both waiting. Draws fall to the van — the player
 * is never the side frozen by a coin flip.
 */
export function vanHasRightOfWay(vanToJunction: number, carToJunction: number): boolean {
  return vanToJunction <= carToJunction;
}

/** How far short of a junction to wait, capped so the catch-up on release stays small. */
function holdBackFor(selfToJunction: number): number {
  const short = TRAFFIC_CROSS_STOP_GAP - selfToJunction;
  if (short <= 0) return 0;
  return Math.min(short, TRAFFIC_CROSS_MAX_HOLD);
}

/**
 * The nearest junction ahead of the van that a moving car is crossing and owns.
 *
 * Stopped cars are skipped deliberately. A car that has stopped is not about to cross, and
 * more to the point it may have stopped *for the van* — `trafficCars` zeroes the speed of
 * every car it holds. Taking right of way over a stopped car is therefore the guarantee
 * that the van and a car can never each be waiting on the other: whichever of them yields
 * first stops, and stopping is exactly what frees the other to go.
 */
function findCrossingCar(
  player: TrafficObstacle,
  cars: readonly TrafficCarView[],
  lookAhead: number,
): { car: TrafficCarView; dist: number } | null {
  let best: TrafficCarView | null = null;
  let bestDist = Infinity;
  for (const car of cars) {
    if (car.speed <= 0) continue;
    const conflict = crossingConflict(player, { x: car.x, y: car.y, heading: car.angle });
    if (!conflict || conflict.self > lookAhead) continue;
    if (vanHasRightOfWay(conflict.self, conflict.other)) continue;
    if (conflict.self >= bestDist) continue;
    best = car;
    bestDist = conflict.self;
  }
  return best ? { car: best, dist: bestDist } : null;
}

function findLeadCar(
  player: TrafficObstacle,
  cars: readonly TrafficCarView[],
  lookAhead: number,
): { car: TrafficCarView; dist: number } | null {
  let best: TrafficCarView | null = null;
  let bestDist = lookAhead;
  const cos = Math.cos(player.heading);
  const sin = Math.sin(player.heading);
  for (const car of cars) {
    const dx = car.x - player.x;
    const dy = car.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 24 || dist >= bestDist) continue;
    const forward = cos * dx + sin * dy;
    if (forward < 36) continue;
    const lateral = Math.abs(-sin * dx + cos * dy);
    if (lateral > TRAFFIC_LANE_WIDTH) continue;
    best = car;
    bestDist = dist;
  }
  return best ? { car: best, dist: bestDist } : null;
}

function pickFollower(
  a: CarState,
  b: CarState,
  pa: WorldPoint,
  pb: WorldPoint,
): CarState {
  const ha = headingAlongLoop(a.loop.points, a.t);
  const hb = headingAlongLoop(b.loop.points, b.t);
  const abx = pb.x - pa.x;
  const aby = pb.y - pa.y;
  const aToward = Math.cos(ha) * abx + Math.sin(ha) * aby;
  const bToward = Math.cos(hb) * -abx + Math.sin(hb) * -aby;
  if (aToward > 8 && aToward >= bToward) return a;
  if (bToward > 8 && bToward > aToward) return b;
  return a.id < b.id ? b : a;
}

function pointAlongLoop(points: readonly WorldPoint[], t: number): WorldPoint {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length === 1) return points[0]!;
  const closed = [...points, points[0]!];
  let total = 0;
  const segLens: number[] = [];
  for (let i = 1; i < closed.length; i++) {
    const len = Math.hypot(closed[i]!.x - closed[i - 1]!.x, closed[i]!.y - closed[i - 1]!.y);
    segLens.push(len);
    total += len;
  }
  let target = ((t % 1) + 1) % 1 * total;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]!;
    if (target <= len) {
      const a = closed[i]!;
      const b = closed[i + 1]!;
      const f = len <= 0 ? 0 : target / len;
      return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
    }
    target -= len;
  }
  return closed[closed.length - 1]!;
}

function headingAlongLoop(points: readonly WorldPoint[], t: number, _loopLen?: number): number {
  if (points.length < 2) return 0;
  const closed = [...points, points[0]!];
  let total = 0;
  const segLens: number[] = [];
  for (let i = 1; i < closed.length; i++) {
    const len = Math.hypot(closed[i]!.x - closed[i - 1]!.x, closed[i]!.y - closed[i - 1]!.y);
    segLens.push(len);
    total += len;
  }
  if (total <= 0) return 0;
  let target = ((t % 1) + 1) % 1 * total;
  for (let i = 0; i < segLens.length; i++) {
    const len = segLens[i]!;
    if (target <= len || i === segLens.length - 1) {
      const a = closed[i]!;
      const b = closed[i + 1]!;
      // Face along this segment only — matching ambient cars, no cross-corner aim.
      return Math.atan2(b.y - a.y, b.x - a.x);
    }
    target -= len;
  }
  const a = closed[closed.length - 2]!;
  const b = closed[closed.length - 1]!;
  return Math.atan2(b.y - a.y, b.x - a.x);
}
