import type { SimSnapshot } from "./gameSim";
import { lerpAngle } from "./driveRoute";

export interface MoverState {
  gameMs: number;
  vehicle: { x: number; y: number; heading: number };
  driverOnFoot: boolean;
  driver: { x: number; y: number } | null;
}

function fromSnapshot(snap: SimSnapshot): MoverState {
  return {
    gameMs: snap.gameMs,
    vehicle: { ...snap.vehicle },
    driverOnFoot: snap.dropoff.driverOnFoot,
    driver: snap.dropoff.driver ? { ...snap.dropoff.driver } : null,
  };
}

const EMPTY: MoverState = {
  gameMs: 0,
  vehicle: { x: 0, y: 0, heading: 0 },
  driverOnFoot: false,
  driver: null,
};

export function lerpMoverScalar(from: number, to: number, t: number): number {
  return from + (to - from) * t;
}

export function lerpMoverHeading(from: number, to: number, t: number): number {
  return lerpAngle(from, to, t);
}

export function lerpMoverState(from: MoverState, to: MoverState, t: number): MoverState {
  return {
    gameMs: lerpMoverScalar(from.gameMs, to.gameMs, t),
    vehicle: {
      x: lerpMoverScalar(from.vehicle.x, to.vehicle.x, t),
      y: lerpMoverScalar(from.vehicle.y, to.vehicle.y, t),
      heading: lerpMoverHeading(from.vehicle.heading, to.vehicle.heading, t),
    },
    driverOnFoot: to.driverOnFoot,
    driver: from.driver && to.driver
      ? { x: lerpMoverScalar(from.driver.x, to.driver.x, t), y: lerpMoverScalar(from.driver.y, to.driver.y, t) }
      : to.driver,
  };
}

/**
 * Previous/current sim positions for render interpolation between fixed steps.
 * Shop/Door actors are mostly static bakes — Drive vehicle/walker/camera/traffic
 * are the primary consumers; customer doorstep sprites still snap to sim ticks.
 */
export class SimInterpolator {
  private prev: MoverState = { ...EMPTY, vehicle: { ...EMPTY.vehicle } };
  private curr: MoverState = { ...EMPTY, vehicle: { ...EMPTY.vehicle } };
  private seeded = false;

  reset(): void {
    this.prev = { ...EMPTY, vehicle: { ...EMPTY.vehicle } };
    this.curr = { ...EMPTY, vehicle: { ...EMPTY.vehicle } };
    this.seeded = false;
  }

  seed(snap: SimSnapshot): void {
    const s = fromSnapshot(snap);
    this.prev = s;
    this.curr = s;
    this.seeded = true;
  }

  /** Call before the first fixed step of a frame — prev becomes last frame's end state. */
  markStepStart(_snap: SimSnapshot): void {
    if (!this.seeded) return;
    this.prev = this.curr;
  }

  push(snap: SimSnapshot): void {
    const s = fromSnapshot(snap);
    if (!this.seeded) {
      this.seed(snap);
      return;
    }
    this.curr = s;
  }

  /** No sim step ran — refresh curr without moving prev (alpha = 0). */
  hold(snap: SimSnapshot): void {
    if (!this.seeded) this.seed(snap);
    else this.curr = fromSnapshot(snap);
  }

  lerp(alpha: number): MoverState {
    if (!this.seeded) return this.curr;
    return lerpMoverState(this.prev, this.curr, alpha);
  }

  get current(): MoverState {
    return this.curr;
  }
}
