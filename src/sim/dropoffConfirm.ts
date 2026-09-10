/** Edge-triggered confirm gate between doorstep dropoff steps. */
export interface DropoffConfirmGate {
  /** Earliest game time the next confirm may advance a step. */
  readyAt: number;
  /** True after a quiet tick (no held/queued confirm) once `readyAt` has passed. */
  released: boolean;
}

export function latchDropoffGate(now: number, cooldownMs: number): DropoffConfirmGate {
  return { readyAt: now + cooldownMs, released: false };
}

export function dropoffGateAccepts(gate: DropoffConfirmGate | null, now: number): boolean {
  if (!gate) return true;
  return now >= gate.readyAt && gate.released;
}

export type DropoffGateTick = {
  queuedInteract: boolean;
  confirmHeld: boolean;
};

/** Advance release detection and decide whether a queued confirm should be swallowed. */
export function tickDropoffGate(
  gate: DropoffConfirmGate | null,
  now: number,
  tick: DropoffGateTick,
): { gate: DropoffConfirmGate | null; swallowQueued: boolean } {
  if (!gate) return { gate: null, swallowQueued: false };

  if (tick.queuedInteract && !dropoffGateAccepts(gate, now)) {
    return { gate, swallowQueued: true };
  }

  if (!tick.queuedInteract && !tick.confirmHeld && now >= gate.readyAt && !gate.released) {
    return { gate: { ...gate, released: true }, swallowQueued: false };
  }

  return { gate, swallowQueued: false };
}
