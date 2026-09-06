import { isEWStreet, isNSStreet, tileToWorld } from "../maps/cityT0";
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
 * stay axis-aligned; turns pass through the tile center so cars never chord across
 * the inside of a corner into the wrong lane.
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
    const centerA = tileToWorld(a);
    const wa = { x: centerA.x + off.x, y: centerA.y + off.y };
    const wb = { x: tileToWorld(b).x + off.x, y: tileToWorld(b).y + off.y };

    if (out.length === 0) {
      push(wa);
    } else {
      const last = out[out.length - 1]!;
      const dx = wa.x - last.x;
      const dy = wa.y - last.y;
      if (Math.abs(dx) > 1 && Math.abs(dy) > 1) {
        // Offset flipped at a corner — settle through the tile center with axis elbows
        // so the path stays in-lane instead of cutting the inside chord.
        const prev = cells[i - 1]!;
        const prevDir = segmentDir(prev, a);
        if (Math.abs(prevDir.dc) >= Math.abs(prevDir.dr)) {
          push({ x: centerA.x, y: last.y });
          push(centerA);
          push({ x: centerA.x, y: wa.y });
        } else {
          push({ x: last.x, y: centerA.y });
          push(centerA);
          push({ x: wa.x, y: centerA.y });
        }
      }
      push(wa);
    }
    push(wb);
  }

  return out;
}

/**
 * Strict tile-center path for one-way lane traffic. Cells must be rook-adjacent;
 * any accidental diagonal is expanded into an L so cars never cut corners.
 */
export function orthogonalLanePath(cells: readonly TileCell[]): WorldPoint[] {
  if (cells.length === 0) return [];
  const out: WorldPoint[] = [];
  const push = (p: WorldPoint): void => {
    const last = out[out.length - 1];
    if (last && Math.hypot(last.x - p.x, last.y - p.y) < 1) return;
    out.push(p);
  };

  push(tileToWorld(cells[0]!));
  for (let i = 1; i < cells.length; i++) {
    const prev = out[out.length - 1]!;
    const cur = tileToWorld(cells[i]!);
    if (Math.abs(prev.x - cur.x) > 1 && Math.abs(prev.y - cur.y) > 1) {
      const before = out[out.length - 2];
      const alongX = before ? Math.abs(before.x - prev.x) >= Math.abs(before.y - prev.y) : true;
      // Finish the inbound axis first (outer edge of a right-hand turn), then enter the new lane.
      if (alongX) push({ x: cur.x, y: prev.y });
      else push({ x: prev.x, y: cur.y });
    }
    push(cur);
  }

  // Ensure the loop can close on an axis (last → first).
  if (out.length >= 2) {
    const first = out[0]!;
    const last = out[out.length - 1]!;
    if (Math.abs(first.x - last.x) > 1 && Math.abs(first.y - last.y) > 1) {
      push({ x: first.x, y: last.y });
    }
  }

  return out;
}


/** 0 = straight ahead, 1 = hard ~90° corner within lookAhead px along the route. */
export function upcomingTurnSharpness(
  route: readonly WorldPoint[],
  x: number,
  y: number,
  waypoint: number,
  lookAhead = 140,
): number {
  if (route.length < 3) return 0;
  let remaining = lookAhead;
  let cx = x;
  let cy = y;
  let wp = Math.min(Math.max(0, waypoint), route.length);
  let prevHeading: number | null = null;
  let maxBend = 0;

  while (remaining > 0 && wp < route.length) {
    const target = route[wp]!;
    const dx = target.x - cx;
    const dy = target.y - cy;
    const seg = Math.hypot(dx, dy);
    if (seg > 0.5) {
      const heading = Math.atan2(dy, dx);
      if (prevHeading !== null) {
        let delta = heading - prevHeading;
        while (delta > Math.PI) delta -= Math.PI * 2;
        while (delta < -Math.PI) delta += Math.PI * 2;
        maxBend = Math.max(maxBend, Math.min(1, Math.abs(delta) / (Math.PI / 2)));
      }
      prevHeading = heading;
    }
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
    break;
  }
  return maxBend;
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
  const heading = segmentHeading(route, px, py, wp, arrived);
  return { x: px, y: py, waypoint: wp, heading, arrived };
}

/** Facing along the current route leg only — no look-ahead past corners (avoids 360° spins). */
export function segmentHeading(
  route: readonly WorldPoint[],
  x: number,
  y: number,
  waypoint: number,
  arrived = false,
): number {
  if (route.length === 0) return 0;
  if (route.length === 1) return 0;
  if (arrived) {
    const last = route[route.length - 1]!;
    const prev = route[route.length - 2]!;
    return Math.atan2(last.y - prev.y, last.x - prev.x);
  }
  const wp = Math.min(Math.max(0, waypoint), route.length - 1);
  const to = route[wp]!;
  // Prefer the active leg (previous waypoint → current target).
  if (wp > 0) {
    const from = route[wp - 1]!;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    if (Math.hypot(dx, dy) > 0.5) return Math.atan2(dy, dx);
  }
  const dx = to.x - x;
  const dy = to.y - y;
  if (Math.hypot(dx, dy) > 0.5) return Math.atan2(dy, dx);
  if (wp + 1 < route.length) {
    const next = route[wp + 1]!;
    return Math.atan2(next.y - to.y, next.x - to.x);
  }
  return 0;
}

/** @deprecated Prefer segmentHeading — look-ahead across L-corners caused full spins. */
export function headingAlongRoute(
  route: readonly WorldPoint[],
  x: number,
  y: number,
  waypoint: number,
  arrived = false,
  _lookAhead = 56,
): number {
  return segmentHeading(route, x, y, waypoint, arrived);
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

/** Wrap to (-π, π]. */
export function normalizeAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** Shortest signed delta from → to in (-π, π]. */
export function shortestAngleDelta(from: number, to: number): number {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/**
 * Shortest-path lerp for headings. Caps each step so vehicles never take a
 * ≥180° flip (reads as a 360° spin on screen). Ambiguous ±π holds course.
 */
export function lerpAngle(
  from: number,
  to: number,
  t: number,
  /** Max |delta| applied before t — ~100° keeps 90° corners, blocks flips. */
  maxAbsDelta = Math.PI * 0.55,
): number {
  const fromN = normalizeAngle(from);
  let delta = shortestAngleDelta(fromN, to);
  // Exactly opposite: either way is a flip — hold heading instead.
  if (Math.abs(delta) > Math.PI - 1e-3) return fromN;
  if (delta > maxAbsDelta) delta = maxAbsDelta;
  else if (delta < -maxAbsDelta) delta = -maxAbsDelta;
  return normalizeAngle(fromN + delta * Math.max(0, Math.min(1, t)));
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

/** North-American right-hand lane tile for a grid step (2-tile streets). */
export function driveLaneCell(cell: TileCell, next: TileCell): TileCell {
  const dc = Math.sign(next.c - cell.c);
  const dr = Math.sign(next.r - cell.r);
  if (dc !== 0 && Math.abs(dc) >= Math.abs(dr)) {
    const pair = ewPairContaining(cell.r);
    if (!pair) return cell;
    return { c: cell.c, r: dc > 0 ? pair.south : pair.north };
  }
  if (dr !== 0) {
    const pair = nsPairContaining(cell.c);
    if (!pair) return cell;
    return { c: dr > 0 ? pair.west : pair.east, r: cell.r };
  }
  return cell;
}

/** Snap a path onto legal one-way curb lanes (keeps the final cell as-is for parking). */
export function snapPathToDriveLanes(cells: readonly TileCell[]): TileCell[] {
  if (cells.length === 0) return [];
  if (cells.length === 1) return [cells[0]!];
  const out: TileCell[] = [];
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i]!;
    if (i === cells.length - 1) {
      out.push(cell);
      break;
    }
    out.push(driveLaneCell(cell, cells[i + 1]!));
  }
  return out;
}

function ewPairContaining(r: number): { north: number; south: number } | null {
  if (isEWStreet(r) && isEWStreet(r + 1)) return { north: r, south: r + 1 };
  if (isEWStreet(r) && isEWStreet(r - 1)) return { north: r - 1, south: r };
  return null;
}

function nsPairContaining(c: number): { west: number; east: number } | null {
  if (isNSStreet(c) && isNSStreet(c + 1)) return { west: c, east: c + 1 };
  if (isNSStreet(c) && isNSStreet(c - 1)) return { west: c - 1, east: c };
  return null;
}
