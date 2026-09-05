import { CITY, TILE, isEWStreet, isNSStreet } from "./cityT0";
import type { TileCell } from "../sim/pathfinding";
import { LANE_OFFSET_PX, routeWorldPoints, type WorldPoint } from "../sim/driveRoute";

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

function isRoad(cell: TileCell): boolean {
  return !!CITY.walkable[cell.r]?.[cell.c];
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

/** Ambient cars on closed road loops. Cosmetic only — no collision with each other or the van. */
export function buildTrafficLoops(max = 5): TrafficLoop[] {
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
          if ((a + b + i + j) % 4 !== 0) continue;
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

/**
 * Positions for decorative traffic. Cars never collide — they are drawn ghosts with
 * staggered timing and opposite-lane offsets so they do not stack on one path.
 */
export function trafficCars(gameMs: number, loops: readonly TrafficLoop[]): TrafficCarView[] {
  return loops.map((loop, i) => {
    const speed = 120 + (i % 3) * 28;
    const stagger = i * 3_600 + (i % 2) * 1_800;
    const dist = ((gameMs + stagger) * speed) / 1000;
    const t = (dist % loop.length) / loop.length;
    const pos = pointAlongLoop(loop.points, t);
    const angle = headingAlongLoop(loop.points, t);
    // Alternate curb side so cars on nearby loops do not sit on top of each other.
    const side = i % 2 === 0 ? 1 : -1;
    const lateral = side * (LANE_OFFSET_PX * 0.55);
    const x = pos.x + Math.cos(angle + Math.PI / 2) * lateral;
    const y = pos.y + Math.sin(angle + Math.PI / 2) * lateral;
    return {
      id: loop.id,
      x,
      y,
      key: CAR_KEYS[i % CAR_KEYS.length]!,
      depth: 5,
      angle,
    };
  });
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
  let target = t * total;
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
