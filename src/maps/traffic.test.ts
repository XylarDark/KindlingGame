import { describe, expect, it } from "vitest";
import { TILE } from "./cityT0";
import {
  TRAFFIC_BASE_SPEED,
  TRAFFIC_CROSS_DOT,
  TRAFFIC_CROSS_LOOK,
  TRAFFIC_CROSS_STOP_GAP,
  TRAFFIC_DENSITY,
  TRAFFIC_LANE_WIDTH,
  TRAFFIC_LOOK_AHEAD,
  TRAFFIC_LOOP_MAX,
  TRAFFIC_MIN_SEP,
  TRAFFIC_SPEED_SCALE,
  TRAFFIC_SPEED_STEP,
  TRAFFIC_VAN_DETECT,
  VAN_CRAWL_GAP,
  VAN_FOLLOW_GAP_SCALE,
  VAN_FOLLOW_MIN_SEP,
  VAN_MATCH_GAP,
  VAN_YIELD_CREEP,
  VAN_YIELD_STOP_GAP,
  vanHasRightOfWay,
  buildTrafficLoops,
  driveSpeedForTraffic,
  leadTrafficSpeed,
  trafficCars,
} from "./traffic";
import { routeIsOrthogonal } from "../sim/driveRoute";

/** A car's loop, recovered from its `${loop.id}-${index}` id. */
function loopOf(id: string): string {
  return id.slice(0, id.lastIndexOf("-"));
}

describe("city traffic", () => {
  it("keeps every traffic loop strictly in-lane — no diagonal corner cuts", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    expect(loops.length).toBeGreaterThan(0);
    for (const loop of loops) {
      expect(routeIsOrthogonal(loop.points), loop.id).toBe(true);
      const a = loop.points[loop.points.length - 1]!;
      const b = loop.points[0]!;
      expect(
        Math.abs(a.x - b.x) <= 1.5 || Math.abs(a.y - b.y) <= 1.5,
        `${loop.id} close`,
      ).toBe(true);
    }
  });

  it("spawns about 25% fewer cars than a full loop fill", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const full = trafficCars(0, loops);
    let slots = 0;
    for (const loop of loops) slots += loop.length > TILE * 14 ? 2 : 1;
    expect(full.length).toBe(Math.max(1, Math.round(slots * TRAFFIC_DENSITY)));
  });

  it("moves cars along loops over time", () => {
    const loops = buildTrafficLoops(4);
    const a = trafficCars(0, loops);
    const b = trafficCars(8_000, loops);
    expect(a.length).toBeGreaterThan(0);
    expect(b).toHaveLength(a.length);
    const moved = a.some((car, i) => Math.hypot(car.x - b[i]!.x, car.y - b[i]!.y) > 8);
    expect(moved).toBe(true);
  });

  it("keeps cars from overlapping each other, including across loops at intersections", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    // Three minutes at 300ms. Cars only meet at an intersection when two loops happen to
    // phase into one, which a handful of hand-picked timestamps will miss entirely.
    let crossLoopPairs = 0;
    let perpendicularPairs = 0;
    let carSamples = 0;
    for (let t = 0; t <= 180_000; t += 300) {
      const cars = trafficCars(t, loops);
      carSamples += cars.length;
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i]!;
          const b = cars[j]!;
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          expect(gap, `t=${t} ${a.id} vs ${b.id}`).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
          if (gap > TRAFFIC_CROSS_LOOK || loopOf(a.id) === loopOf(b.id)) continue;
          crossLoopPairs += 1;
          const facing = Math.cos(a.angle) * Math.cos(b.angle) + Math.sin(a.angle) * Math.sin(b.angle);
          if (Math.abs(facing) < TRAFFIC_CROSS_DOT) perpendicularPairs += 1;
        }
      }
    }
    // The sweep is worthless unless it actually put crossing traffic in front of itself —
    // a silent zero here would let the separation rule pass by never being exercised.
    expect(carSamples, "no cars sampled").toBeGreaterThan(1_000);
    expect(crossLoopPairs, "no cars from different loops ever met").toBeGreaterThan(0);
    expect(perpendicularPairs, "no crossing pair ever sampled").toBeGreaterThan(0);
  });

  it("never lets cars pass through the delivery van", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    // Dense sweep: at the faster pace, cars meet the van mid-corner where a single
    // shove back along the lane opens less straight-line gap than it does on a straight.
    const times = Array.from({ length: 60 }, (_, i) => i * 900);
    for (const t of [...times, 2_000, 7_500, 14_000, 22_000]) {
      const raw = trafficCars(t, loops);
      if (raw.length === 0) continue;
      const van = { x: raw[0]!.x, y: raw[0]!.y, heading: raw[0]!.angle };
      const cars = trafficCars(t, loops, van);
      for (const car of cars) {
        const gap = Math.hypot(car.x - van.x, car.y - van.y);
        expect(gap, `t=${t} ${car.id}`).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
      }
    }
  });

  it("keeps one-way lane directions — no oncoming traffic in the same corridor", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    expect(loops.length).toBeGreaterThan(0);
    for (const t of [0, 3_000, 9_000, 18_000]) {
      const cars = trafficCars(t, loops);
      for (let i = 0; i < cars.length; i++) {
        for (let j = i + 1; j < cars.length; j++) {
          const a = cars[i]!;
          const b = cars[j]!;
          const gap = Math.hypot(a.x - b.x, a.y - b.y);
          if (gap > 160) continue;
          const facing =
            Math.cos(a.angle) * Math.cos(b.angle) + Math.sin(a.angle) * Math.sin(b.angle);
          if (facing > -0.5) continue;
          const lateral = Math.abs(-Math.sin(a.angle) * (b.x - a.x) + Math.cos(a.angle) * (b.y - a.y));
          expect(lateral, `oncoming ${a.id}/${b.id} t=${t}`).toBeGreaterThan(40);
        }
      }
    }
  });

  it("holds back for the delivery van without leaving the lane", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const base = trafficCars(4_000, loops);
    expect(base.length).toBeGreaterThan(0);
    const lead = base[0]!;
    const van = {
      x: lead.x + Math.cos(lead.angle) * (TRAFFIC_VAN_DETECT * 0.45),
      y: lead.y + Math.sin(lead.angle) * (TRAFFIC_VAN_DETECT * 0.45),
      heading: lead.angle,
    };
    const cars = trafficCars(4_000, loops, van);
    const reacted = cars.find((c) => c.id === lead.id);
    expect(reacted).toBeTruthy();
    const gap = Math.hypot(reacted!.x - van.x, reacted!.y - van.y);
    expect(gap).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP - 1);
    expect(reacted!.speed).toBe(0);
    const lateral = Math.abs(
      -(Math.sin(lead.angle) * (reacted!.x - lead.x)) + Math.cos(lead.angle) * (reacted!.y - lead.y),
    );
    expect(lateral).toBeLessThan(12);
  });

  it("does not zero speed when the van approaches from behind", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const base = trafficCars(5_000, loops);
    expect(base.length).toBeGreaterThan(0);
    const lead = base[0]!;
    const van = {
      x: lead.x - Math.cos(lead.angle) * 80,
      y: lead.y - Math.sin(lead.angle) * 80,
      heading: lead.angle,
    };
    const cars = trafficCars(5_000, loops, van);
    const reacted = cars.find((c) => c.id === lead.id)!;
    expect(reacted.speed).toBeGreaterThan(0);
    // The car the van queues behind leaves the wider follow clearance.
    expect(Math.hypot(reacted.x - van.x, reacted.y - van.y)).toBeGreaterThanOrEqual(
      VAN_FOLLOW_MIN_SEP - 1,
    );
    expect(VAN_FOLLOW_MIN_SEP).toBeCloseTo(TRAFFIC_MIN_SEP * VAN_FOLLOW_GAP_SCALE, 6);
  });

  it("reports lead speed when a car is ahead in the same lane", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const cars = trafficCars(3_000, loops);
    expect(cars.length).toBeGreaterThan(0);
    const lead = cars[0]!;
    const player = {
      x: lead.x - Math.cos(lead.angle) * 90,
      y: lead.y - Math.sin(lead.angle) * 90,
      heading: lead.angle,
    };
    expect(leadTrafficSpeed(player, cars)).toBe(lead.speed);
    expect(leadTrafficSpeed({ x: lead.x + 400, y: lead.y + 400, heading: 0 }, cars)).toBeNull();
  });

  it("modulates cruise for clear / soft / hard / stopped lead bands", () => {
    const cruise = 380;
    const lead = {
      id: "lead",
      x: 200,
      y: 0,
      key: "tex-car",
      depth: 5,
      angle: 0,
      speed: 120,
    };
    const player = { x: 0, y: 0, heading: 0 };
    expect(driveSpeedForTraffic(player, [], cruise)).toBe(cruise);
    // Clear of the follow band: close the gap at lead speed + 20.
    expect(driveSpeedForTraffic(player, [{ ...lead, x: VAN_MATCH_GAP + 8 }], cruise)).toBe(
      Math.min(cruise, 140),
    );
    // Inside the follow band: match the lead car.
    expect(driveSpeedForTraffic(player, [{ ...lead, x: VAN_MATCH_GAP - 8 }], cruise)).toBe(
      Math.min(cruise, 120),
    );
    const nose = driveSpeedForTraffic(
      player,
      [{ ...lead, x: VAN_CRAWL_GAP - 8, speed: 0 }],
      cruise,
    );
    expect(nose).toBeGreaterThanOrEqual(cruise * 0.2);
    expect(nose).toBeLessThan(cruise);
  });

  it("keeps ambient cars at the scaled traffic pace", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const cars = trafficCars(6_000, loops);
    expect(cars.length).toBeGreaterThan(0);
    const tiers = [0, 1, 2].map((i) => (TRAFFIC_BASE_SPEED + i * TRAFFIC_SPEED_STEP) * TRAFFIC_SPEED_SCALE);
    for (const car of cars) {
      expect(tiers.some((t) => Math.abs(car.speed - t) < 1e-6), `${car.id} @ ${car.speed}`).toBe(true);
      // The compounded trim must land every tier above the old unscaled base pace.
      expect(car.speed).toBeGreaterThan(TRAFFIC_BASE_SPEED);
    }
    expect(Math.max(...cars.map((c) => c.speed))).toBeCloseTo(
      (TRAFFIC_BASE_SPEED + 2 * TRAFFIC_SPEED_STEP) * TRAFFIC_SPEED_SCALE,
      6,
    );
  });

  it("holds the van further back than the raw separation, still inside its look-ahead", () => {
    expect(VAN_FOLLOW_GAP_SCALE).toBeGreaterThan(1);
    expect(VAN_CRAWL_GAP).toBeCloseTo(TRAFFIC_MIN_SEP * 0.92 * VAN_FOLLOW_GAP_SCALE, 6);
    expect(VAN_MATCH_GAP).toBeCloseTo(TRAFFIC_MIN_SEP * 1.2 * VAN_FOLLOW_GAP_SCALE, 6);
    // A lead car must still be detectable at the widest band, or the van would never react.
    expect(VAN_MATCH_GAP).toBeLessThan(TRAFFIC_LOOK_AHEAD);
    // Crawl band clears the hard car↔car separation so the van settles behind, not inside it.
    expect(VAN_CRAWL_GAP).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP);

    const cruise = 380;
    const lead = { id: "lead", x: 0, y: 0, key: "tex-car", depth: 5, angle: 0, speed: 120 };
    const player = { x: 0, y: 0, heading: 0 };
    // At the old match-band edge the van now already matches speed instead of closing in.
    const atOldEdge = TRAFFIC_MIN_SEP * 1.2 + 1;
    expect(atOldEdge).toBeLessThan(VAN_MATCH_GAP);
    expect(driveSpeedForTraffic(player, [{ ...lead, x: atOldEdge }], cruise)).toBe(120);
  });

  it("never stalls the van behind a stopped lead car", () => {
    const cruise = 380;
    const lead = { id: "lead", x: 40, y: 0, key: "tex-car", depth: 5, angle: 0, speed: 0 };
    const player = { x: 0, y: 0, heading: 0 };
    for (const gap of [VAN_CRAWL_GAP * 0.5, VAN_CRAWL_GAP - 1, VAN_MATCH_GAP - 1, VAN_MATCH_GAP + 1]) {
      expect(driveSpeedForTraffic(player, [{ ...lead, x: gap }], cruise)).toBeGreaterThan(0);
    }
  });

  it("gives way to a car crossing the van's nose instead of driving through it", () => {
    const cruise = 380;
    const player = { x: 0, y: 0, heading: 0 };
    // Southbound car crossing the eastbound van's path. The lateral offset is wider than
    // TRAFFIC_LANE_WIDTH on purpose: this is precisely the car findLeadCar throws away, so
    // without the crossing rule the van reads the road as clear and drives into its flank.
    const crosser = {
      id: "cross",
      x: 130,
      y: -90,
      key: "tex-car",
      depth: 5,
      angle: Math.PI / 2,
      speed: 120,
    };
    expect(Math.abs(crosser.y), "must be outside the lane the lead-car check looks down")
      .toBeGreaterThan(TRAFFIC_LANE_WIDTH);
    expect(leadTrafficSpeed(player, [crosser]), "not a lead car").toBeNull();

    // Still short of the stop line: ease off rather than carry full cruise into the junction.
    const easing = driveSpeedForTraffic(player, [crosser], cruise);
    expect(easing).toBeCloseTo(cruise * VAN_YIELD_CREEP, 6);
    expect(easing).toBeGreaterThan(0);

    // At the stop line: a genuine hold, because a crawl into a crossing car still hits it.
    const atLine = driveSpeedForTraffic(player, [{ ...crosser, x: VAN_YIELD_STOP_GAP - 10 }], cruise);
    expect(atLine).toBe(0);

    // Past the junction it is no longer in the way — fall in behind and go.
    expect(driveSpeedForTraffic(player, [{ ...crosser, y: 90 }], cruise)).toBe(cruise);
    // And a junction beyond the crossing look-ahead is not yet the van's problem.
    expect(driveSpeedForTraffic(player, [{ ...crosser, x: TRAFFIC_CROSS_LOOK + 20 }], cruise)).toBe(cruise);
  });

  it("keeps right of way rather than waiting on a car that is already waiting", () => {
    const cruise = 380;
    const player = { x: 0, y: 0, heading: 0 };
    const crosser = { id: "cross", x: 100, y: -90, key: "tex-car", depth: 5, angle: Math.PI / 2, speed: 120 };
    // Baseline: this one does hold the van up.
    expect(driveSpeedForTraffic(player, [crosser], cruise)).toBe(0);

    // The van is nearer the junction (100) than the car is (140), so the van goes first.
    expect(driveSpeedForTraffic(player, [{ ...crosser, y: -140 }], cruise)).toBe(cruise);

    // A stopped car is not crossing anything, and it may well have stopped *for the van* —
    // trafficCars zeroes the speed of every car it holds. Taking right of way over a stopped
    // vehicle is what makes it impossible for the two of them to sit waiting on each other.
    expect(driveSpeedForTraffic(player, [{ ...crosser, speed: 0 }], cruise)).toBe(cruise);

    // An oncoming car is head-on, not crossing, and must not be mistaken for one.
    expect(driveSpeedForTraffic(player, [{ ...crosser, angle: Math.PI }], cruise)).toBe(cruise);
  });

  it("settles an equidistant junction on one side only", () => {
    // Both 120 from the junction. The van and the car decide through this one predicate, so
    // a draw cannot come out as both driving on, or as both sitting there waiting.
    expect(vanHasRightOfWay(120, 120), "a draw goes to the van").toBe(true);
    expect(vanHasRightOfWay(140, 120), "car nearer, so the van holds").toBe(false);
    expect(vanHasRightOfWay(100, 120), "van nearer, so the van goes").toBe(true);

    // End to end, an exact draw is not reachable: the grid's headings come out of Math.PI / 2,
    // so two nominally equal projections land a float apart. What the road needs is that the
    // decision flips cleanly either side of level, with no band where both sides drive on.
    const van = { x: 0, y: 0, heading: 0 };
    const level = { id: "cross", x: 120, y: -120, key: "tex-car", depth: 5, angle: Math.PI / 2, speed: 120 };
    expect(driveSpeedForTraffic(van, [level], 380), "car level: van gives way").toBeLessThan(380);
    expect(driveSpeedForTraffic(van, [{ ...level, y: -121 }], 380), "van nearer: van goes").toBe(380);
  });

  it("gives way at a real city junction, and releases once the crossing car is through", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    // Sitting on the north approach to the junction at (2340, 300), where loop-0 turns south
    // across the eastbound corridor loop-1 and loop-4 run along.
    const van = { x: 2340, y: 300 - 100, heading: Math.PI / 2 };
    let held = 0;
    let longestHold = 0;
    let run = 0;
    let samples = 0;
    for (let t = 0; t <= 120_000; t += 100) {
      samples += 1;
      const cars = trafficCars(t, loops, van);
      expect(cars.length, `t=${t}`).toBeGreaterThan(0);
      const speed = driveSpeedForTraffic(van, cars, 380);
      expect(speed, `t=${t} negative`).toBeGreaterThanOrEqual(0);
      if (speed > 0) {
        run = 0;
        continue;
      }
      held += 1;
      run += 1;
      longestHold = Math.max(longestHold, run);
      // A hold is only ever legitimate with a moving car actually crossing in front.
      const blocker = cars.find(
        (c) =>
          c.speed > 0 &&
          Math.abs(Math.cos(c.angle) * Math.cos(van.heading) + Math.sin(c.angle) * Math.sin(van.heading)) <
            TRAFFIC_CROSS_DOT &&
          Math.hypot(c.x - van.x, c.y - van.y) < TRAFFIC_CROSS_LOOK * 2,
      );
      expect(blocker, `t=${t} held with nothing crossing`).toBeTruthy();
    }
    // It engages on the real map — not just against hand-placed cars.
    expect(held, "never gave way anywhere on a two-minute sweep").toBeGreaterThan(0);
    // And it lets go. A wait is bounded by the crossing car clearing the junction, and the
    // cars are a pure function of the clock, so no wait can outlive one vehicle passing.
    expect(longestHold * 100, "van held at a junction far too long").toBeLessThan(3_000);
    expect(held, "held for most of the sweep — that is a stall, not a yield").toBeLessThan(samples * 0.5);
  });

  it("holds ambient cars short of a junction another car is crossing", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    // loop-2 runs north up x=2460 into the eastbound corridor at y=300; at this moment it
    // has to wait for the traffic already coming along it.
    const cars = trafficCars(50_200, loops);
    expect(cars.length).toBeGreaterThan(0);
    const waiting = cars.find((c) => c.id === "loop-2-0")!;
    expect(waiting, "loop-2-0 missing — the loop set moved").toBeTruthy();
    expect(waiting.speed, "loop-2-0 should be giving way here").toBe(0);

    // It is waiting for something real: a moving car on another loop, crossing its path.
    const crossing = cars.filter(
      (c) =>
        c.id !== waiting.id &&
        loopOf(c.id) !== loopOf(waiting.id) &&
        c.speed > 0 &&
        Math.abs(
          Math.cos(c.angle) * Math.cos(waiting.angle) + Math.sin(c.angle) * Math.sin(waiting.angle),
        ) < TRAFFIC_CROSS_DOT &&
        Math.hypot(c.x - waiting.x, c.y - waiting.y) < TRAFFIC_CROSS_LOOK * 2,
    );
    expect(crossing.length, "nothing to give way to").toBeGreaterThan(0);
    // Waiting means waiting short of it, not nosing in and being shoved back out.
    for (const other of crossing) {
      expect(Math.hypot(other.x - waiting.x, other.y - waiting.y)).toBeGreaterThanOrEqual(
        TRAFFIC_MIN_SEP - 1,
      );
    }
  });

  it("bounds every junction wait — traffic gives way without gridlocking", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const run = new Map<string, number>();
    const longest = new Map<string, number>();
    let everHeld = 0;
    let frozenFrames = 0;
    let samples = 0;
    for (let t = 0; t <= 180_000; t += 100) {
      const cars = trafficCars(t, loops);
      expect(cars.length, `t=${t}`).toBeGreaterThan(0);
      samples += 1;
      let stopped = 0;
      for (const car of cars) {
        if (car.speed > 0) {
          run.set(car.id, 0);
          continue;
        }
        stopped += 1;
        everHeld += 1;
        const next = (run.get(car.id) ?? 0) + 1;
        run.set(car.id, next);
        longest.set(car.id, Math.max(longest.get(car.id) ?? 0, next));
      }
      if (stopped === cars.length) frozenFrames += 1;
    }
    // Cars do give way — if this is zero the rule is inert and everything below is vacuous.
    expect(everHeld, "no car ever gave way in three minutes").toBeGreaterThan(0);
    // Nobody is ever waiting on somebody who is waiting on them.
    expect(frozenFrames, "every car stopped at once — that is a deadlock").toBe(0);
    for (const [id, frames] of longest) {
      expect(frames * 100, `${id} stuck at a junction`).toBeLessThan(3_000);
    }
    expect(longest.size, "the wait tracker measured nothing").toBeGreaterThan(0);
  });

  it("stays a pure function of the clock so the sim and the renderer agree", () => {
    const loops = buildTrafficLoops(TRAFFIC_LOOP_MAX);
    const van = { x: 2340, y: 200, heading: Math.PI / 2 };
    for (const t of [0, 600, 14_200, 50_200, 98_765]) {
      // Both callers ask independently for the same timestamp and must be handed the same
      // cars, whichever order they ask in — the yield rules must not have left state behind.
      const plain = trafficCars(t, loops);
      const withVan = trafficCars(t, loops, van);
      expect(trafficCars(t, loops), `t=${t} plain`).toEqual(plain);
      expect(trafficCars(t, loops, van), `t=${t} with van`).toEqual(withVan);
      expect(plain.length, `t=${t}`).toBeGreaterThan(0);
      expect(withVan).toHaveLength(plain.length);
    }
  });

  it("compounds the pace and follow-gap trims without outrunning the look-ahead", () => {
    expect(TRAFFIC_SPEED_SCALE).toBeCloseTo(1.15 * 1.05, 6);
    expect(VAN_FOLLOW_GAP_SCALE).toBeCloseTo(1.1 * 1.1, 6);
    // The invariant the follow-gap comment claims: the widest band the van reacts at has to
    // stay inside the distance it can see, or it would queue behind a car it cannot detect.
    expect(VAN_MATCH_GAP).toBeLessThan(TRAFFIC_LOOK_AHEAD);
    // A car giving way stops far enough back that the one crossing still clears it.
    expect(TRAFFIC_CROSS_STOP_GAP).toBeGreaterThanOrEqual(TRAFFIC_MIN_SEP);
    // ...and it can see the junction from further away than it needs to stop short of it.
    expect(TRAFFIC_CROSS_LOOK).toBeGreaterThan(TRAFFIC_CROSS_STOP_GAP);
  });
});
