import { describe, expect, it } from "vitest";
import { advanceRoute, laneWorldPoint, routeWorldPoints, rightOffset } from "./driveRoute";

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
});
