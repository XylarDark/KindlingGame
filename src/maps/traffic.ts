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
}

const CAR_KEYS = ["tex-car", "tex-car-2"] as const;

/** Minimum center-to-center gap so cars never stack through each other. */
export const TRAFFIC_MIN_SEP = 110;

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
export function buildTrafficLoops(max = 6): TrafficLoop[] {
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
};

/**
 * Moving traffic that yields so cars keep a minimum gap — they do not pass through each other.
 * Still cosmetic vs the player van (no physics).
 */
export function trafficCars(gameMs: number, loops: readonly TrafficLoop[]): TrafficCarView[] {
  if (loops.length === 0) return [];

  const states: CarState[] = [];
  loops.forEach((loop, i) => {
    const speed = 115 + (i % 3) * 22;
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
      });
    }
  });

  // Same-loop cars already share speed + even spacing. Resolve cross-loop overlaps
  // by holding the later-indexed car back along its path until gaps clear.
  for (let pass = 0; pass < 10; pass++) {
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
        // Prefer backing the car that is "behind" relative to the other along heading;
        // fall back to higher index for a stable deterministic order.
        const follower = pickFollower(ca, cb, pa, pb) === ca ? ca : cb;
        const retreat = need / Math.max(TILE, follower.loop.length);
        follower.t = ((follower.t - retreat) % 1 + 1) % 1;
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
    };
  });
}

function pickFollower(
  a: CarState,
  b: CarState,
  pa: WorldPoint,
  pb: WorldPoint,
): CarState {
  const ha = headingAlongLoop(a.loop.points, a.t);
  const hb = headingAlongLoop(b.loop.points, b.t);
  // Vector from a→b; if a is driving toward b, a is the follower (should yield).
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
