import { CITY, isEWStreet, isNSStreet, tileToWorld } from "../maps/cityT0";
import { findPath, type TileCell } from "./pathfinding";

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
 * Build a right-lane world path. Straights stay axis-aligned; turns use a single
 * outer-lane corner. Avoids pushing past the corner on the inbound leg (that
 * forced a reverse) and avoids routing through tile center (E→N→W→S spins).
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
    const ab = segmentDir(a, b);
    const off = rightOffset(ab.dc, ab.dr, laneOffset);
    const centerA = tileToWorld(a);
    const centerB = tileToWorld(b);
    const wa = { x: centerA.x + off.x, y: centerA.y + off.y };
    const wb = { x: centerB.x + off.x, y: centerB.y + off.y };

    if (out.length === 0) push(wa);
    else {
      const last = out[out.length - 1]!;
      if (Math.abs(wa.x - last.x) > 1 && Math.abs(wa.y - last.y) > 1) {
        const prev = cells[i - 1]!;
        const prevDir = segmentDir(prev, a);
        push(
          Math.abs(prevDir.dc) >= Math.abs(prevDir.dr)
            ? { x: wa.x, y: last.y }
            : { x: last.x, y: wa.y },
        );
      }
      // Skip wa when it sits behind the corner relative to travel toward wb.
      const last2 = out[out.length - 1]!;
      const toWaX = wa.x - last2.x;
      const toWaY = wa.y - last2.y;
      const toWbX = wb.x - last2.x;
      const toWbY = wb.y - last2.y;
      if (toWaX * toWbX + toWaY * toWbY > 0 && Math.hypot(toWaX, toWaY) > 1) {
        push(wa);
      }
    }

    const c = cells[i + 2];
    if (c) {
      const bc = segmentDir(b, c);
      // Axis change ahead: stop at the outer-lane corner instead of overshooting wb.
      const axisTurn = (ab.dc !== 0) !== (bc.dc !== 0);
      if (axisTurn) {
        const off2 = rightOffset(bc.dc, bc.dr, laneOffset);
        const outbound = { x: centerB.x + off2.x, y: centerB.y + off2.y };
        const last = out[out.length - 1]!;
        const corner =
          Math.abs(ab.dc) >= Math.abs(ab.dr)
            ? { x: outbound.x, y: last.y }
            : { x: last.x, y: outbound.y };
        push(corner);
        continue;
      }
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

/** Normalise a heading into (-π, π]. */
export function normalizeAngle(angle: number): number {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/** Signed shortest turn from one heading to another, in (-π, π]. */
export function angleDelta(from: number, to: number): number {
  let delta = normalizeAngle(to) - normalizeAngle(from);
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  return delta;
}

/** Shortest-path lerp for headings in (-π, π]. */
export function lerpAngle(from: number, to: number, t: number): number {
  const fromN = normalizeAngle(from);
  return fromN + angleDelta(fromN, to) * Math.max(0, Math.min(1, t));
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

/**
 * How a car actually sits in a stall: squared up with the street it fronts, pointing the
 * way traffic legally moves in the kerb lane beside it.
 *
 * Both halves fall out of one vector — stall → the road tile it opens onto:
 *
 * - **Axis.** The stall is a lot tile, so a road tile sharing its row can only belong to a
 *   north–south street, and one sharing its column can only belong to an east–west street
 *   (a tile on an E–W street row is road for its whole length, so a lot tile could not sit
 *   there). The offset therefore names the axis outright, on either street orientation.
 * - **Direction.** Of the two headings along that axis, the legal one is the one that puts
 *   the kerb — the stall side — on the car's right, which is {@link driveLaneCell}'s rule
 *   seen from the pavement. Rotating stall→road a quarter turn clockwise in screen space
 *   (y down) is exactly that heading: a stall north of an E–W street faces west, matching
 *   the northern (westbound) lane it backs onto; one west of a N–S street faces south.
 *
 * Deliberately independent of how the van approached. The last leg into a stall is
 * perpendicular to the street, so an approach-based choice would be picking between two
 * headings that are both 90° away — a coin toss that flips half the city the wrong way.
 */
export function kerbParkHeading(stop: TileCell, street: TileCell): number {
  const dc = street.c - stop.c;
  const dr = street.r - stop.r;
  if (dc === 0 && dr === 0) throw new Error("A stall cannot be its own street tile");
  // (dc, dr) rotated +90° with y pointing down is (-dr, dc).
  return Math.atan2(dc, -dr);
}

/**
 * How far off the kerb lane an arrival can be and still be worth squaring up to it.
 *
 * A van coming up the frontage turns into the pad across that lane, so it always arrives
 * some way off the rest heading — measured across all fourteen lots, never worse than 48°.
 * Anything wider means the van came off the far lane instead, and pivoting it into line
 * would be a spin on the spot rather than the last of a turn.
 */
export const STALL_SQUARE_UP_MAX = (55 * Math.PI) / 180;

/**
 * The heading the van comes to rest at in a stall.
 *
 * Lining up with the kerb lane is right when the van arrived along that kerb — it is how a
 * vehicle sits at a frontage, and it is what every lot did while the kerb approach was the
 * only route in. It is wrong when the van crossed the road to get there: squaring up would
 * mean pivoting most of a half-circle on the spot, which reads as a glitch rather than as
 * parking. A van that pulled across the road rests nose-in, the way it came, snapped to the
 * axis so a heading caught mid-turn does not leave it skewed across the pad.
 *
 * Note what this does *not* do, and what {@link kerbParkHeading} rules out above: it never
 * picks *which* way along the kerb to face from the approach, because both directions are a
 * quarter turn from the last leg in and choosing between them that way is a coin toss. The
 * kerb heading is still the lane's own, and this only decides whether to take it at all.
 */
export function stallRestHeading(arrival: number, kerb: number): number {
  if (Math.abs(angleDelta(arrival, kerb)) <= STALL_SQUARE_UP_MAX) return kerb;
  const quarter = Math.PI / 2;
  return normalizeAngle(Math.round(normalizeAngle(arrival) / quarter) * quarter);
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

/** A stall the van can be routed to: where it parks, the kerb it fronts, and its pad. */
export interface StallApproach {
  /** The pad cell the van comes to rest on. */
  stop: TileCell;
  /** The road tile that pad opens onto — see `HouseStop.street`. */
  street: TileCell;
  /** Every driveable cell of the pad, so a route cannot treat the driveway as a shortcut. */
  parking: readonly TileCell[];
}

/** A junction is a tile both street predicates claim — the 2x2 overlap where lanes meet. */
function isJunctionCell(cell: TileCell): boolean {
  return isEWStreet(cell.r) && isNSStreet(cell.c);
}

function isRoadCell(cell: TileCell): boolean {
  return CITY.kinds[cell.r]?.[cell.c] === "road";
}

function sameCell(a: TileCell, b: TileCell): boolean {
  return a.c === b.c && a.r === b.r;
}

/** No block interior is anywhere near this long; the cap only stops a runaway walk. */
const APPROACH_RUN_MAX = 16;

/**
 * The stretch of kerb lane a van has to drive to reach `stall` legally: from the first
 * junction upstream of the frontage, forward to the frontage itself, in travel order.
 *
 * A one-way lane can only be joined where another street meets it, so that junction is
 * the last point on the route a pathfinder is free to choose. Everything after it is
 * forced. A run of one means the frontage is itself a junction and can be turned into
 * directly.
 */
export function kerbApproachRun(stall: TileCell, street: TileCell): TileCell[] {
  const heading = kerbParkHeading(stall, street);
  const step = { c: Math.round(Math.cos(heading)), r: Math.round(Math.sin(heading)) };
  const run: TileCell[] = [street];
  let cell = street;
  while (!isJunctionCell(cell) && run.length < APPROACH_RUN_MAX) {
    const back = { c: cell.c - step.c, r: cell.r - step.r };
    if (!isRoadCell(back)) break;
    run.unshift(back);
    cell = back;
  }
  return run;
}

/** A copy of the grid with `blocked` closed off, less anything the van is already standing on. */
function gridWithout(walkable: boolean[][], blocked: readonly TileCell[], keep: TileCell): boolean[][] {
  const grid = walkable.map((row) => [...row]);
  for (const cell of blocked) {
    if (sameCell(cell, keep)) continue;
    if (grid[cell.r]?.[cell.c] !== undefined) grid[cell.r]![cell.c] = false;
  }
  return grid;
}

/**
 * Route to a parking stall that arrives on the kerb the stall fronts, travelling the way
 * that lane runs — so the van never crosses the oncoming lane to reach a driveway.
 *
 * Reaching the approach run's head is ordinary pathfinding; the run itself is not
 * negotiable, so it is closed off while that search happens. Without that, A* simply
 * joins the run halfway by cutting across the oncoming lane, which is the failure being
 * fixed rather than a fix for it. The pad is closed for the same reason: it is driveable,
 * so a two-cell driveway was otherwise a legal shortcut into the stall from the wrong end.
 *
 * Returns `null` when no legal approach exists, rather than quietly producing an illegal
 * one — the caller decides what to do about a stall that cannot be reached lawfully.
 */
export function routeToStall(
  walkable: boolean[][],
  start: TileCell,
  stall: StallApproach,
): TileCell[] | null {
  if (sameCell(start, stall.stop)) return [start];
  const run = kerbApproachRun(stall.stop, stall.street);
  const head = run[0]!;
  const heading = kerbParkHeading(stall.stop, stall.street);
  const ahead = {
    c: stall.street.c + Math.round(Math.cos(heading)),
    r: stall.street.r + Math.round(Math.sin(heading)),
  };
  // Closing the cell just past the frontage stops a head-on arrival when the frontage is
  // itself the junction and the run is therefore a single cell.
  const blocked = [...run.slice(1), ...stall.parking, ahead];
  const lead = findPath(gridWithout(walkable, blocked, start), start, head);
  if (lead.length === 0) return null;
  const cells = [...lead, ...run.slice(1), stall.stop];
  return cells.filter((cell, i) => i === 0 || !sameCell(cell, cells[i - 1]!));
}

/**
 * Cells the direct line has to save before the van crosses the road to a stall instead of
 * driving round to come up the kerb it fronts. Roughly a block: below that the lawful
 * approach is worth keeping, because arriving along the frontage parks tidily and needs no
 * gap in the oncoming lane at all.
 */
export const CROSS_SAVING_CELLS = 6;

/**
 * How the van will actually reach a stall: along the kerb it fronts, unless crossing the
 * road saves enough to be worth it.
 *
 * The kerb approach used to be the only answer, with the direct line kept as a fallback for
 * stalls that had no lawful approach at all. That made every far-side delivery drive most of
 * a block to come back on itself. Crossing is a real option now that the van waits for a gap
 * in the lane it cuts through (see `driveSpeedForTraffic`), so the choice is a cost one, and
 * `snapPathToDriveLanes` still holds the crossing route to legal lanes right up to the last
 * cell — the crossing happens at the stall, not for the length of the run.
 */
export function approachToStall(
  walkable: boolean[][],
  start: TileCell,
  stall: StallApproach,
): TileCell[] {
  const lawful = routeToStall(walkable, start, stall);
  const direct = findPath(walkable, start, stall.stop);
  if (lawful === null || lawful.length === 0) return direct;
  if (direct.length === 0) return lawful;
  return direct.length + CROSS_SAVING_CELLS <= lawful.length ? direct : lawful;
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
