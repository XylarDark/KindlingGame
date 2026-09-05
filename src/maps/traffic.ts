import { CITY, TILE, isEWStreet, isNSStreet } from "./cityT0";
import type { TileCell } from "../sim/pathfinding";
import { routeWorldPoints, type WorldPoint } from "../sim/driveRoute";

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

function rectangleLoop(c0: number, r0: number, c1: number, r1: number): TileCell[] | null {
  const cells: TileCell[] = [];
  for (let c = c0; c <= c1; c++) cells.push({ c, r: r0 });
  for (let r = r0 + 1; r <= r1; r++) cells.push({ c: c1, r });
  for (let c = c1 - 1; c >= c0; c--) cells.push({ c, r: r1 });
  for (let r = r1 - 1; r > r0; r--) cells.push({ c: c0, r });
  if (cells.length < 8) return null;
  if (!cells.every(isRoad)) return null;
  return cells;
}

/** Ambient cars on closed road loops (roads only — not parking stalls). */
export function buildTrafficLoops(max = TRAFFIC_LOOP_MAX): TrafficLoop[] {
  const loops: TrafficLoop[] = [];
  const seen = new Set<string>();
  const ewRows = CITY.kinds.map((_, r) => r).filter((r) => isEWStreet(r));
  const nsCols = CITY.kinds[0] ? CITY.kinds[0].map((_, c) => c).filter((c) => isNSStreet(c)) : [];

  for (let i = 0; i < ewRows.length && loops.length < max; i++) {
    for (let j = i + 1; j < ewRows.length && loops.length < max; j++) {
      const r0 = ewRows[i]!;
      const r1 = ewRows[j]!;
      if (r1 - r0 < 4) continue;
      for (let a = 0; a < nsCols.length && loops.length < max; a++) {
        for (let b = a + 1; b < nsCols.length && loops.length < max; b++) {
          const c0 = nsCols[a]!;
          const c1 = nsCols[b]!;
          if (c1 - c0 < 5) continue;
          if ((a + b + i + j) % 3 !== 0) continue;
          const cells = rectangleLoop(c0, r0, c1, r1);
          if (!cells) continue;
          const key = `${c0},${r0}-${c1},${r1}`;
          if (seen.has(key)) continue;
          seen.add(key);
          const points = routeWorldPoints(cells);
          loops.push({ id: `loop-${loops.length}`, points, length: loopLength(points) });
        }
      }
    }
  }

  return loops;
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

/**
 * Moving traffic that yields so cars keep a minimum gap — they do not pass through
 * each other or the delivery van when `obstacle` is provided.
 */
export function trafficCars(
  gameMs: number,
  loops: readonly TrafficLoop[],
  obstacle?: TrafficObstacle | null,
): TrafficCarView[] {
  if (loops.length === 0) return [];

  const states: CarState[] = [];
  loops.forEach((loop, i) => {
    const speed = 115 + (i % 3) * 22;
    const stagger = i * 2_800 + (i % 2) * 1_400;
    const dist = ((gameMs + stagger) * speed) / 1000;
    // Long loops can carry a second car; density trim below removes ~25% overall.
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

  // Thin the fleet by TRAFFIC_DENSITY while keeping even coverage across loops.
  const keep = Math.max(1, Math.round(states.length * TRAFFIC_DENSITY));
  if (states.length > keep) {
    const picked: CarState[] = [];
    for (let i = 0; i < keep; i++) {
      picked.push(states[Math.floor((i + 0.5) * (states.length / keep))]!);
    }
    states.length = 0;
    states.push(...picked);
  }
  // Resolve overlaps (car↔car and car↔van) by holding followers back along their path.
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
    if (obstacle) {
      for (const car of states) {
        const p = pointAlongLoop(car.loop.points, car.t);
        const gap = Math.hypot(p.x - obstacle.x, p.y - obstacle.y);
        if (gap >= TRAFFIC_MIN_SEP) continue;
        const heading = headingAlongLoop(car.loop.points, car.t);
        const toward =
          Math.cos(heading) * (obstacle.x - p.x) + Math.sin(heading) * (obstacle.y - p.y);
        const need = TRAFFIC_MIN_SEP - gap + 6;
        const step = need / Math.max(TILE, car.loop.length);
        // Cars driving into the van hold back; cars the van is eating from behind nudge forward.
        if (toward >= 0) car.t = ((car.t - step) % 1 + 1) % 1;
        else car.t = (car.t + step) % 1;
        moved = true;
      }
    }
    if (!moved) break;
  }

  return states.map((car) => {
    const pos = pointAlongLoop(car.loop.points, car.t);
    const angle = headingAlongLoop(car.loop.points, car.t);
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

/** Cruise speed for the van: match a lead car, and ease off if nose-to-tail. */
export function driveSpeedForTraffic(
  player: TrafficObstacle,
  cars: readonly TrafficCarView[],
  cruise: number,
  lookAhead = TRAFFIC_LOOK_AHEAD,
): number {
  const lead = findLeadCar(player, cars, lookAhead);
  if (!lead) return cruise;
  if (lead.dist < TRAFFIC_MIN_SEP * 0.92) return Math.min(cruise * 0.15, lead.car.speed * 0.4);
  if (lead.dist < TRAFFIC_MIN_SEP * 1.2) return Math.min(cruise, lead.car.speed);
  return Math.min(cruise, lead.car.speed + 20);
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

function headingAlongLoop(points: readonly WorldPoint[], t: number): number {
  const eps = 0.01;
  const a = pointAlongLoop(points, t);
  const b = pointAlongLoop(points, (t + eps) % 1);
  return Math.atan2(b.y - a.y, b.x - a.x);
}
