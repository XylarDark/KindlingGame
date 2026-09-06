import { CITY, TILE, isEWStreet, isNSStreet } from "./cityT0";
import type { TileCell } from "../sim/pathfinding";
import { orthogonalLanePath, routeIsOrthogonal, type WorldPoint } from "../sim/driveRoute";

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

/** Hard floor — cars must never sit closer than this (overlap / clip). */
export const TRAFFIC_MIN_SEP = 120;

/** Comfortable following distance (center-to-center) when stacked in a lane. */
export const TRAFFIC_FOLLOW_GAP = 156;

/** How far ahead the delivery van looks for a slower lead car. */
export const TRAFFIC_LOOK_AHEAD = 220;

/** How far traffic looks for the delivery van to stop / go around. */
export const TRAFFIC_VAN_DETECT = 240;

/** Lateral lane tolerance when deciding a car is “in front”. */
export const TRAFFIC_LANE_WIDTH = 72;

/** Spawn density vs a full loop fill — 0.75 = 25% fewer cars on the road. */
export const TRAFFIC_DENSITY = 0.75;

/** Shared ambient loop budget (routes stay dense; cars are thinned by TRAFFIC_DENSITY). */
export const TRAFFIC_LOOP_MAX = 6;

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
 * Cars also stop or swing around when the van is closing in.
 */
export function trafficCars(
  gameMs: number,
  loops: readonly TrafficLoop[],
  obstacle?: TrafficObstacle | null,
): TrafficCarView[] {
  if (loops.length === 0) return [];

  const states: CarState[] = [];
  loops.forEach((loop, i) => {
    const speed = (115 + (i % 3) * 22) * 0.95;
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

  // Same-loop convoys: hold a steady follow gap and match the lead's speed (no shove fights).
  enforceLoopFollowing(states);

  // Cross-traffic / Euclidean floor — soft, exact, no overshoot (avoids frame jitter).
  for (let pass = 0; pass < 8; pass++) {
    let moved = false;
    for (let a = 0; a < states.length; a++) {
      for (let b = a + 1; b < states.length; b++) {
        const ca = states[a]!;
        const cb = states[b]!;
        if (ca.loop.id === cb.loop.id) continue; // already handled as a convoy
        const pa = pointAlongLoop(ca.loop.points, ca.t);
        const pb = pointAlongLoop(cb.loop.points, cb.t);
        const gap = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        if (gap >= TRAFFIC_MIN_SEP) continue;
        const need = TRAFFIC_MIN_SEP - gap;
        const follower = pickFollower(ca, cb, pa, pb) === ca ? ca : cb;
        const lead = follower === ca ? cb : ca;
        const retreat = need / Math.max(TILE, follower.loop.length);
        follower.t = ((follower.t - retreat) % 1 + 1) % 1;
        follower.speed = Math.min(follower.speed, lead.speed);
        moved = true;
      }
    }
    if (!moved) break;
  }

  // Van awareness: ease back in-lane — clamp once, match a crawl (no stop-go yank).
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
      const vanToward =
        Math.cos(obstacle.heading) * (p.x - obstacle.x) + Math.sin(obstacle.heading) * (p.y - obstacle.y);

      if (gap < TRAFFIC_VAN_DETECT && Math.abs(lateral) < TRAFFIC_LANE_WIDTH * 1.35) {
        const closing = forward > 24 || (vanToward > 24 && forward > -40);
        if (closing && forward > 8) {
          const want = Math.max(TRAFFIC_MIN_SEP, TRAFFIC_FOLLOW_GAP * 0.85);
          if (gap < want) {
            const hold = want - gap;
            const step = hold / Math.max(TILE, car.loop.length);
            car.t = ((car.t - step) % 1 + 1) % 1;
          }
          // Crawl with the van instead of slamming to 0 (that caused speed jitter).
          const crawl = Math.max(18, Math.min(car.speed, 55 + gap * 0.15));
          car.speed = Math.min(car.speed, crawl);
        }
      }

      if (gap < TRAFFIC_MIN_SEP) {
        const need = TRAFFIC_MIN_SEP - gap;
        const step = need / Math.max(TILE, car.loop.length);
        if (forward >= 0) car.t = ((car.t - step) % 1 + 1) % 1;
        else car.t = (car.t + step) % 1;
        car.speed = Math.min(car.speed, 40);
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

/** Cruise speed for the van: smooth follow curve (no hard brake bands = less jitter). */
export function driveSpeedForTraffic(
  player: TrafficObstacle,
  cars: readonly TrafficCarView[],
  cruise: number,
  lookAhead = TRAFFIC_LOOK_AHEAD,
): number {
  const lead = findLeadCar(player, cars, lookAhead);
  if (!lead) return cruise;
  const dist = lead.dist;
  const leadSpeed = Math.max(0, lead.car.speed);
  // Nose-to-tail: crawl. At follow gap: match lead. Farther: gently close.
  if (dist <= TRAFFIC_MIN_SEP) return Math.min(cruise * 0.12, Math.max(12, leadSpeed * 0.35));
  if (dist >= lookAhead) return Math.min(cruise, leadSpeed + 24);
  const follow = TRAFFIC_FOLLOW_GAP;
  if (dist <= follow) {
    const u = (dist - TRAFFIC_MIN_SEP) / Math.max(1, follow - TRAFFIC_MIN_SEP);
    const s = u * u * (3 - 2 * u); // smoothstep
    return Math.min(cruise, leadSpeed * (0.4 + 0.6 * s));
  }
  const u = (dist - follow) / Math.max(1, lookAhead - follow);
  const s = u * u * (3 - 2 * u);
  return Math.min(cruise, leadSpeed + 24 * s);
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


/** Forward arc length from `fromT` to `toT` along a unit loop (0..length). */
function loopArcAhead(fromT: number, toT: number, length: number): number {
  const dt = ((toT - fromT) % 1 + 1) % 1;
  return dt * length;
}

/**
 * On each shared loop, keep followers a steady TRAFFIC_FOLLOW_GAP behind the
 * car ahead and match that car's speed so stacks don't accordion every frame.
 */
function enforceLoopFollowing(states: CarState[]): void {
  const byLoop = new Map<string, CarState[]>();
  for (const car of states) {
    const list = byLoop.get(car.loop.id);
    if (list) list.push(car);
    else byLoop.set(car.loop.id, [car]);
  }
  for (const group of byLoop.values()) {
    if (group.length < 2) continue;
    // Stable order so clamps don't flip identities frame-to-frame.
    group.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    // Multiple passes so a chain of three+ settles without overshoot fighting.
    for (let pass = 0; pass < group.length; pass++) {
      for (let i = 0; i < group.length; i++) {
        const follower = group[i]!;
        let bestLead: CarState | null = null;
        let bestArc = Infinity;
        for (let j = 0; j < group.length; j++) {
          if (i === j) continue;
          const lead = group[j]!;
          const arc = loopArcAhead(follower.t, lead.t, follower.loop.length);
          // Ignore the long way around (nearly full lap behind).
          if (arc < 1 || arc > follower.loop.length * 0.5) continue;
          if (arc < bestArc) {
            bestArc = arc;
            bestLead = lead;
          }
        }
        if (!bestLead) continue;
        const want = TRAFFIC_FOLLOW_GAP;
        if (bestArc < want) {
          const retreat = (want - bestArc) / Math.max(TILE, follower.loop.length);
          follower.t = ((follower.t - retreat) % 1 + 1) % 1;
          follower.speed = Math.min(follower.speed, bestLead.speed);
        } else if (bestArc < want * 1.35) {
          // Closing in — match pace before the hard gap clamp kicks in.
          follower.speed = Math.min(follower.speed, bestLead.speed);
        }
      }
      group.sort((a, b) => a.t - b.t || a.id.localeCompare(b.id));
    }
  }
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

function approxLoopLen(points: readonly WorldPoint[]): number {
  if (points.length < 2) return TILE;
  let length = 0;
  for (let i = 1; i < points.length; i++) {
    length += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y);
  }
  length += Math.hypot(points[0]!.x - points[points.length - 1]!.x, points[0]!.y - points[points.length - 1]!.y);
  return Math.max(TILE, length);
}
