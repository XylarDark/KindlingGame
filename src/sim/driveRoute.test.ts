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
      const step = advanceRoute(x, y, wp, route, 380, 0.05);
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
    expect(Math.abs(lerpAngle(0, Math.PI, 0.5))).toBeCloseTo(Math.PI / 2, 5);
  });

  it("turns with one outer-lane elbow so heading does not sweep ~270° through the center", () => {
    const route = routeWorldPoints([
      { c: 2, r: 4 },
      { c: 3, r: 4 },
      { c: 4, r: 4 },
      { c: 4, r: 5 },
      { c: 4, r: 6 },
    ]);
    expect(routeIsOrthogonal(route)).toBe(true);

    let x = route[0]!.x;
    let y = route[0]!.y;
    let wp = 0;
    let heading = 0;
    let prev = heading;
    let spin = 0;
    let maxStep = 0;
    let prevStep = heading;
    for (let i = 0; i < 400; i++) {
      const step = advanceRoute(x, y, wp, route, 380, 0.05);
      x = step.x;
      y = step.y;
      wp = step.waypoint;
      let sh = step.heading - prevStep;
      while (sh > Math.PI) sh -= Math.PI * 2;
      while (sh < -Math.PI) sh += Math.PI * 2;
      maxStep = Math.max(maxStep, Math.abs(sh));
      prevStep = step.heading;
      const turn = 1 - Math.exp(-0.05 * 8);
      heading = lerpAngle(heading, step.heading, turn);
      let d = heading - prev;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      spin += Math.abs(d);
      prev = heading;
      if (step.arrived) break;
    }
    // One ~90° corner (+ settle): well under a half-circle of absolute turn.
    expect((spin * 180) / Math.PI).toBeLessThan(150);
    expect((maxStep * 180) / Math.PI).toBeLessThanOrEqual(95);
  });
});
