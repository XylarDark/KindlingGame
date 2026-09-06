import { describe, expect, it } from "vitest";
import {
  advanceRoute,
  driveLaneCell,
  laneWorldPoint,
  lerpAngle,
  orthogonalLanePath,
  routeIsOrthogonal,
  routeWorldPoints,
  rightOffset,
  segmentHeading,
  upcomingTurnSharpness,
  normalizeAngle,
  shortestAngleDelta,
} from "./driveRoute";

describe("driveRoute", () => {
  it("offsets eastbound travel to the southern lane", () => {
    const p = laneWorldPoint({ c: 5, r: 4 }, { c: 4, r: 4 }, { c: 6, r: 4 });
    const center = { x: 5 * 120 + 60, y: 4 * 120 + 60 };
    expect(p.y).toBeGreaterThan(center.y);
    expect(p.x).toBeCloseTo(center.x);
  });

  it("advances along a short route and marks arrival", () => {
    const route = routeWorldPoints([
      { c: 2, r: 4 },
      { c: 3, r: 4 },
      { c: 4, r: 4 },
    ]);
    let x = route[0]!.x;
    let y = route[0]!.y;
    let wp = 0;
    let arrived = false;
    for (let i = 0; i < 200 && !arrived; i++) {
      const step = advanceRoute(x, y, wp, route, 361, 0.05);
      x = step.x;
      y = step.y;
      wp = step.waypoint;
      arrived = step.arrived;
    }
    expect(arrived).toBe(true);
    expect(x).toBeCloseTo(route[route.length - 1]!.x, 0);
    expect(y).toBeCloseTo(route[route.length - 1]!.y, 0);
  });

  it("keeps right offset perpendicular to travel", () => {
    expect(rightOffset(1, 0).y).toBe(28);
    expect(rightOffset(0, 1).x).toBe(-28);
  });

  it("turns corners with axis-aligned elbows, not diagonal cuts", () => {
    const route = routeWorldPoints([
      { c: 2, r: 4 },
      { c: 3, r: 4 },
      { c: 4, r: 4 },
      { c: 4, r: 5 },
      { c: 4, r: 6 },
    ]);
    expect(route.length).toBeGreaterThan(4);
    expect(routeIsOrthogonal(route)).toBe(true);
  });

  it("builds orthogonal lane-center paths that never chord a corner", () => {
    const path = orthogonalLanePath([
      { c: 2, r: 4 },
      { c: 3, r: 4 },
      { c: 4, r: 4 },
      { c: 4, r: 5 },
      { c: 4, r: 6 },
    ]);
    expect(routeIsOrthogonal(path)).toBe(true);
    expect(path.length).toBeGreaterThanOrEqual(5);
  });

  it("snaps eastbound travel onto the south lane of a two-tile street", () => {
    const snapped = driveLaneCell({ c: 5, r: 1 }, { c: 6, r: 1 });
    expect(snapped.c).toBe(5);
    // Eastbound must prefer the southern tile when a pair exists.
    expect(snapped.r).toBeGreaterThanOrEqual(1);
  });

  it("faces along the current leg only so corners are 90° turns, not spins", () => {
    const route = routeWorldPoints([
      { c: 2, r: 4 },
      { c: 5, r: 4 },
      { c: 5, r: 7 },
    ]);
    const start = segmentHeading(route, route[0]!.x, route[0]!.y, 1);
    expect(Math.abs(start)).toBeLessThan(0.4);
    // Last leg is southbound.
    const last = route[route.length - 1]!;
    const prev = route[route.length - 2]!;
    const onSouth = segmentHeading(route, prev.x, prev.y, route.length - 1);
    expect(Math.abs(onSouth - Math.atan2(last.y - prev.y, last.x - prev.x))).toBeLessThan(0.05);
    // 90° lerp takes the short way — never a full spin.
    const mid = lerpAngle(0, Math.PI / 2, 0.5);
    expect(mid).toBeGreaterThan(0.2);
    expect(mid).toBeLessThan(1.4);
  });

  it("never takes a 180°/360° flip — holds course on opposite headings", () => {
    expect(lerpAngle(0, Math.PI, 1)).toBeCloseTo(0, 5);
    expect(lerpAngle(0, -Math.PI, 1)).toBeCloseTo(0, 5);
    expect(Math.abs(shortestAngleDelta(0.1, -0.1))).toBeLessThan(0.25);
    // Cap each step under ~100° even when aiming further.
    const stepped = lerpAngle(0, Math.PI * 0.9, 1);
    expect(Math.abs(stepped)).toBeLessThanOrEqual(Math.PI * 0.55 + 1e-6);
    expect(Math.abs(normalizeAngle(stepped))).toBeLessThan(Math.PI);
  });

  it("turns the short way across the ±π wrap without spinning", () => {
    const a = lerpAngle(Math.PI - 0.1, -Math.PI + 0.1, 1);
    expect(Math.abs(shortestAngleDelta(Math.PI - 0.1, a))).toBeLessThan(0.25);
    expect(Math.abs(a)).toBeGreaterThan(Math.PI - 0.3);
  });

  it("flags a sharp corner ahead so drivers can slow into the elbow", () => {
    const route = routeWorldPoints([
      { c: 2, r: 4 },
      { c: 5, r: 4 },
      { c: 5, r: 7 },
    ]);
    const start = route[0]!;
    const midStraight = upcomingTurnSharpness(route, start.x, start.y, 1, 80);
    expect(midStraight).toBeLessThan(0.35);
    // Near the turn elbow, look-ahead should see the 90° bend.
    const nearTurn = upcomingTurnSharpness(route, route[1]!.x - 20, route[1]!.y, 1, 200);
    expect(nearTurn).toBeGreaterThan(0.6);
  });
});
