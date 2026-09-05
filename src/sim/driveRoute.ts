import { tileToWorld } from "../maps/cityT0";
import type { TileCell } from "./pathfinding";

/** Nudge path points into the right-hand lane on two-tile streets. */
export const LANE_OFFSET_PX = 28;

export type WorldPoint = { x: number; y: number };

export function segmentDir(from: TileCell, to: TileCell): { dc: number; dr: number } {
  const dc = Math.sign(to.c - from.c);
  const dr = Math.sign(to.r - from.r);
  return { dc, dr };
}

/** Right-hand offset for a grid step direction (screen y-down). */
export function rightOffset(dc: number, dr: number, amount = LANE_OFFSET_PX): { x: number; y: number } {
  const len = Math.hypot(dc, dr);
  if (len <= 0) return { x: 0, y: 0 };
  return { x: (-dr / len) * amount, y: (dc / len) * amount };
}

export function laneWorldPoint(cell: TileCell, prev?: TileCell, next?: TileCell): WorldPoint {
  const base = tileToWorld(cell);
  let dc = 0;
  let dr = 0;
  if (next) ({ dc, dr } = segmentDir(cell, next));
  else if (prev) ({ dc, dr } = segmentDir(prev, cell));
  const off = rightOffset(dc, dr);
  return { x: base.x + off.x, y: base.y + off.y };
}

/**
 * Build a right-lane world path. Each grid step keeps a shared offset so straights
 * stay axis-aligned; turns insert an L-shaped elbow instead of cutting diagonally.
 */
export function routeWorldPoints(cells: readonly TileCell[], laneOffset = LANE_OFFSET_PX): WorldPoint[] {
  if (cells.length === 0) return [];
  if (cells.length === 1) return [tileToWorld(cells[0]!)];

  const out: WorldPoint[] = [];
  const push = (p: WorldPoint): void => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1) return;
    out.push(p);
  };

  for (let i = 0; i < cells.length - 1; i++) {
    const a = cells[i]!;
    const b = cells[i + 1]!;
    const { dc, dr } = segmentDir(a, b);
    const off = rightOffset(dc, dr, laneOffset);
    const wa = { x: tileToWorld(a).x + off.x, y: tileToWorld(a).y + off.y };
    const wb = { x: tileToWorld(b).x + off.x, y: tileToWorld(b).y + off.y };

    if (out.length === 0) {
      push(wa);
    } else {
      const last = out[out.length - 1]!;
      const dx = wa.x - last.x;
      const dy = wa.y - last.y;
      if (Math.abs(dx) > 1 && Math.abs(dy) > 1) {
        // Lane offset changed at a corner — bend with an axis-aligned elbow,
        // continuing the previous travel axis first (outer corner of a right turn).
        const prev = cells[i - 1]!;
        const prevDir = segmentDir(prev, a);
        if (Math.abs(prevDir.dc) >= Math.abs(prevDir.dr)) {
          push({ x: wa.x, y: last.y });
        } else {
          push({ x: last.x, y: wa.y });
        }
      }
      push(wa);
    }
    push(wb);
  }

  return out;
}

export function advanceRoute(
  x: number,
  y: number,
  waypoint: number,
  route: readonly WorldPoint[],
  speed: number,
  dt: number,
): { x: number; y: number; waypoint: number; heading: number; arrived: boolean } {
  if (route.length === 0) return { x, y, waypoint, heading: 0, arrived: true };
  let px = x;
  let py = y;
  let wp = Math.min(Math.max(0, waypoint), route.length);
  let remaining = speed * dt;

  while (remaining > 0 && wp < route.length) {
    const target = route[wp]!;
    const dx = target.x - px;
    const dy = target.y - py;
    const seg = Math.hypot(dx, dy);
    if (seg <= 0.5) {
      px = target.x;
      py = target.y;
      wp += 1;
      continue;
    }
    if (seg <= remaining) {
      remaining -= seg;
      px = target.x;
      py = target.y;
      wp += 1;
      continue;
    }
    px += (dx / seg) * remaining;
    py += (dy / seg) * remaining;
    remaining = 0;
  }

  const arrived = wp >= route.length;
  const heading = headingAlongRoute(route, px, py, wp, arrived);
  return { x: px, y: py, waypoint: wp, heading, arrived };
}

/** Blend toward the next stretch so the van/car model eases through corners. */
export function headingAlongRoute(
  route: readonly WorldPoint[],
  x: number,
  y: number,
  waypoint: number,
  arrived = false,
  lookAhead = 56,
): number {
  if (route.length === 0) return 0;
  if (arrived || route.length === 1) {
    const last = route[route.length - 1]!;
    const prev = route[Math.max(0, route.length - 2)]!;
    return Math.atan2(last.y - prev.y, last.x - prev.x);
  }
  const look = pointAheadOnRoute(route, x, y, waypoint, lookAhead);
  return Math.atan2(look.y - y, look.x - x);
}

export function pointAheadOnRoute(
  route: readonly WorldPoint[],
  x: number,
  y: number,
  waypoint: number,
  distPx: number,
): WorldPoint {
  let remaining = distPx;
  let cx = x;
  let cy = y;
  let wp = Math.min(Math.max(0, waypoint), route.length);
  while (remaining > 0 && wp < route.length) {
    const target = route[wp]!;
    const dx = target.x - cx;
    const dy = target.y - cy;
    const seg = Math.hypot(dx, dy);
    if (seg <= 0.5) {
      cx = target.x;
      cy = target.y;
      wp += 1;
      continue;
    }
    if (seg <= remaining) {
      remaining -= seg;
      cx = target.x;
      cy = target.y;
      wp += 1;
      continue;
    }
    return { x: cx + (dx / seg) * remaining, y: cy + (dy / seg) * remaining };
  }
  return route[route.length - 1] ?? { x, y };
}

/** Shortest-path lerp for headings in (-π, π]. */
export function lerpAngle(from: number, to: number, t: number): number {
  const fromN = Math.atan2(Math.sin(from), Math.cos(from));
  const toN = Math.atan2(Math.sin(to), Math.cos(to));
  let delta = toN - fromN;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return fromN + delta * Math.max(0, Math.min(1, t));
}

export function routeLength(route: readonly WorldPoint[]): number {
  let total = 0;
  for (let i = 1; i < route.length; i++) {
    total += Math.hypot(route[i]!.x - route[i - 1]!.x, route[i]!.y - route[i - 1]!.y);
  }
  return total;
}

export function estimateRouteMs(route: readonly WorldPoint[], speed: number): number {
  if (speed <= 0) return 0;
  return (routeLength(route) / speed) * 1000;
}

/** True when every consecutive pair shares an axis (no diagonal cuts). */
export function routeIsOrthogonal(route: readonly WorldPoint[], epsilon = 1.5): boolean {
  for (let i = 1; i < route.length; i++) {
    const a = route[i - 1]!;
    const b = route[i]!;
    const axisAligned = Math.abs(a.x - b.x) <= epsilon || Math.abs(a.y - b.y) <= epsilon;
    if (!axisAligned) return false;
  }
  return true;
}
