import { describe, expect, it } from "vitest";
import { CITY, isEWStreet, isNSStreet } from "../maps/cityT0";
import { findPath } from "./pathfinding";
import {
  advanceRoute,
  angleDelta,
  driveLaneCell,
  approachToStall,
  CROSS_SAVING_CELLS,
  kerbApproachRun,
  kerbParkHeading,
  stallRestHeading,
  laneWorldPoint,
  routeToStall,
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

describe("parked heading", () => {
  const EAST = 0;
  const SOUTH = Math.PI / 2;
  const WEST = Math.PI;
  const NORTH = -Math.PI / 2;

  it("faces the way the kerb lane beside the stall travels", () => {
    const stop = { c: 9, r: 6 };
    // Road to the south: the stall is on an E–W street's north kerb, which is westbound.
    expect(kerbParkHeading(stop, { c: 9, r: 7 })).toBeCloseTo(WEST);
    expect(kerbParkHeading(stop, { c: 9, r: 5 })).toBeCloseTo(EAST);
    // Road to the east: the stall is on a N–S street's west kerb, which is southbound.
    expect(kerbParkHeading(stop, { c: 10, r: 6 })).toBeCloseTo(SOUTH);
    expect(kerbParkHeading(stop, { c: 8, r: 6 })).toBeCloseTo(NORTH);
  });

  it("refuses a stall that claims to be its own street tile", () => {
    expect(() => kerbParkHeading({ c: 4, r: 4 }, { c: 4, r: 4 })).toThrow(/own street tile/);
  });

  /**
   * Lots are dealt round-robin across every city block, so they front streets of both
   * orientations. A sweep that happened to see only one would pass with half the city
   * parked wrong — hence the assertion that both groups are populated before any of the
   * per-lot checks run.
   */
  it("squares every lot in the city up with its own street, on both orientations", () => {
    const alongEW = CITY.houses.filter((h) => h.street.c === h.stop.c);
    const alongNS = CITY.houses.filter((h) => h.street.r === h.stop.r);
    expect(alongEW.length, "no lot fronts an E–W street").toBeGreaterThan(0);
    expect(alongNS.length, "no lot fronts a N–S street").toBeGreaterThan(0);
    expect(alongEW.length + alongNS.length).toBe(CITY.houses.length);

    for (const house of alongEW) {
      expect(isEWStreet(house.street.r), house.id).toBe(true);
      // Due east or west — no component across the street, which is the skew being fixed.
      expect(Math.abs(Math.sin(kerbParkHeading(house.stop, house.street))), house.id).toBeCloseTo(0);
    }
    for (const house of alongNS) {
      expect(isNSStreet(house.street.c), house.id).toBe(true);
      expect(Math.abs(Math.cos(kerbParkHeading(house.stop, house.street))), house.id).toBeCloseTo(0);
    }

    for (const house of CITY.houses) {
      const heading = kerbParkHeading(house.stop, house.street);
      // Kerb on the driver's right, carriageway on their left: right-hand traffic stated
      // from the pavement rather than from the lane table.
      const toRoad = { x: house.street.c - house.stop.c, y: house.street.r - house.stop.r };
      const right = { x: -Math.sin(heading), y: Math.cos(heading) };
      expect(right.x * toRoad.x + right.y * toRoad.y, house.id).toBeLessThan(0);

      // And the same claim checked against the game's own lane table: a car driving off
      // in the parked direction is already in the legal lane for it.
      const ahead = {
        c: house.street.c + Math.round(Math.cos(heading)),
        r: house.street.r + Math.round(Math.sin(heading)),
      };
      expect(driveLaneCell(house.street, ahead), house.id).toEqual(house.street);
    }
  });

  /**
   * The stall's frontage is the kerb the van parks against. Reaching it from the far lane
   * means crossing oncoming traffic, which is what the route builder exists to prevent —
   * so this checks the shape of the route rather than how it looked when driven.
   */
  it("reaches every stall along the kerb it fronts, never across the oncoming lane", () => {
    const stalls = [
      ...CITY.houses.map((h) => ({ label: h.id, stop: h.stop, street: h.street, parking: h.parking })),
      {
        label: "shop",
        stop: CITY.shopSpawn,
        street: CITY.shopLot.street,
        parking: CITY.shopLot.parking,
      },
    ];
    const orientations = new Set(stalls.map((s) => (s.street.c === s.stop.c ? "EW" : "NS")));
    expect(orientations, "one street orientation went unchecked").toEqual(new Set(["EW", "NS"]));

    // Collected rather than thrown one at a time: the lots that broke all sat on the same
    // side of their street, and a report naming every one of them says that immediately.
    const faults: string[] = [];
    for (const stall of stalls) {
      const axis = stall.street.c === stall.stop.c ? "EW" : "NS";
      const note = (why: string): number => faults.push(`${stall.label}(${axis}) ${why}`);
      // Route in from a junction on the far side of the city, so the approach is never
      // trivially correct just because the start happened to sit in the right lane.
      const cells = routeToStall(CITY.walkable, { c: 37, r: 25 }, stall);
      if (cells === null) {
        note("has no lawful approach");
        continue;
      }
      const last = cells[cells.length - 1]!;
      const frontage = cells[cells.length - 2]!;
      const before = cells[cells.length - 3]!;
      if (last.c !== stall.stop.c || last.r !== stall.stop.r) note("does not end on the stall");
      if (frontage?.c !== stall.street.c || frontage.r !== stall.street.r) note("arrives off its own frontage");

      // The step onto the frontage must run the way that lane runs.
      const heading = kerbParkHeading(stall.stop, stall.street);
      const dir = { c: Math.round(Math.cos(heading)), r: Math.round(Math.sin(heading)) };
      if (before && (before.c + dir.c !== stall.street.c || before.r + dir.r !== stall.street.r)) {
        note("enters its frontage against the lane");
      }

      // And a driveway is a destination, not a shortcut. The van may start parked on one
      // and must finish on one; every cell between them is road.
      if (cells.slice(1, -1).some((cell) => CITY.kinds[cell.r]![cell.c] === "parking")) {
        note("cuts through a parking pad");
      }
    }
    expect(faults).toEqual([]);
  });

  it("runs the approach from the first junction upstream of the frontage", () => {
    for (const house of CITY.houses) {
      const run = kerbApproachRun(house.stop, house.street);
      expect(run.length, house.id).toBeGreaterThan(0);
      expect(run[run.length - 1], house.id).toEqual(house.street);
      for (const cell of run) expect(CITY.kinds[cell.r]![cell.c], `${house.id} ${cell.c},${cell.r}`).toBe("road");
      // A lane is joined where another street meets it, so the run starts on a junction.
      const head = run[0]!;
      expect(isEWStreet(head.r) && isNSStreet(head.c), `${house.id} run does not start at a junction`).toBe(true);
    }
  });

  it("measures the shortest turn across the ±π seam", () => {
    expect(angleDelta(3.0, -3.0)).toBeCloseTo(2 * Math.PI - 6.0);
    expect(angleDelta(-3.0, 3.0)).toBeCloseTo(6.0 - 2 * Math.PI);
    expect(angleDelta(0, Math.PI / 2)).toBeCloseTo(Math.PI / 2);
  });
});

describe("crossing the road to a stall", () => {
  const stalls = CITY.houses.map((h) => ({
    id: h.id,
    stall: { stop: h.stop, street: h.street, parking: h.parking },
  }));

  it("crosses only where it saves a block, and keeps the kerb approach otherwise", () => {
    let crossed = 0;
    let kept = 0;
    for (const { id, stall } of stalls) {
      const lawful = routeToStall(CITY.walkable, CITY.shopSpawn, stall);
      const direct = findPath(CITY.walkable, CITY.shopSpawn, stall.stop);
      const chosen = approachToStall(CITY.walkable, CITY.shopSpawn, stall);
      expect(chosen.length, `${id} has no route at all`).toBeGreaterThan(0);
      expect(chosen[chosen.length - 1], `${id} does not end on the stall`).toEqual(stall.stop);

      const saving = (lawful?.length ?? 0) - direct.length;
      if (lawful !== null && saving >= CROSS_SAVING_CELLS) {
        expect(chosen.length, `${id} saves ${saving} cells and should cross`).toBe(direct.length);
        crossed += 1;
      } else if (lawful !== null) {
        expect(chosen.length, `${id} saves only ${saving} cells and should keep the kerb`).toBe(lawful.length);
        kept += 1;
      }
    }
    // Both branches are live on this city: a rule where every lot went one way would make
    // the threshold decorative, and neither count can be read off the other.
    expect(crossed, "no lot crosses — the threshold is doing nothing").toBeGreaterThan(0);
    expect(kept, "every lot crosses — the kerb approach is dead code").toBeGreaterThan(0);
  });

  it("falls back to the direct line for a stall with no lawful approach", () => {
    // The old behaviour, still the last resort: a stall that cannot be reached along its
    // own frontage gets a route anyway rather than none.
    const walled = CITY.walkable.map((row) => [...row]);
    const stall = stalls[0]!.stall;
    for (const cell of kerbApproachRun(stall.stop, stall.street)) walled[cell.r]![cell.c] = false;
    expect(routeToStall(walled, CITY.shopSpawn, stall), "still lawful — pick a tighter block").toBeNull();
    const chosen = approachToStall(walled, CITY.shopSpawn, stall);
    expect(chosen[chosen.length - 1]).toEqual(stall.stop);
  });

  it("rests nose-in when it crossed, and squares to the kerb when it came up the frontage", () => {
    const EAST = 0;
    const WEST = Math.PI;
    const SOUTH = Math.PI / 2;

    // Came up the frontage: the arrival is the tail of the turn into the pad, so square up.
    expect(stallRestHeading(SOUTH - 0.6, SOUTH), "40 degrees off the kerb").toBeCloseTo(SOUTH);
    expect(stallRestHeading(EAST, EAST), "already square").toBeCloseTo(EAST);

    // Crossed the road: lining up would be a half-circle on the pad, so hold the nose.
    expect(Math.abs(angleDelta(stallRestHeading(EAST, WEST), EAST)), "head-on to the kerb").toBeCloseTo(0);
    expect(Math.abs(angleDelta(stallRestHeading(SOUTH, EAST), SOUTH)), "square across it").toBeCloseTo(0);

    // A heading caught mid-turn still comes to rest on an axis, not skewed across the pad.
    for (const arrival of [SOUTH + 0.3, WEST - 0.4, -1.2]) {
      const rest = stallRestHeading(arrival, EAST);
      const onAxis = Math.min(Math.abs(Math.sin(rest)), Math.abs(Math.cos(rest)));
      expect(onAxis, `arrival ${arrival.toFixed(1)} left the van skewed`).toBeCloseTo(0);
    }
  });
});
