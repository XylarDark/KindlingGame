import { describe, expect, it } from "vitest";
import { dropoffGateAccepts, latchDropoffGate, tickDropoffGate } from "./dropoffConfirm";

describe("dropoffConfirm gate", () => {
  it("accepts when no gate is latched", () => {
    expect(dropoffGateAccepts(null, 0)).toBe(true);
  });

  it("blocks until cooldown and a quiet release tick", () => {
    const gate = latchDropoffGate(0, 100);
    expect(dropoffGateAccepts(gate, 50)).toBe(false);

    let state = tickDropoffGate(gate, 50, { queuedInteract: false, confirmHeld: true });
    expect(dropoffGateAccepts(state.gate, 50)).toBe(false);

    state = tickDropoffGate(state.gate, 120, { queuedInteract: false, confirmHeld: false });
    expect(dropoffGateAccepts(state.gate, 120)).toBe(true);
  });

  it("swallows queued confirms during the lock", () => {
    const gate = latchDropoffGate(0, 100);
    const blocked = tickDropoffGate(gate, 40, { queuedInteract: true, confirmHeld: false });
    expect(blocked.swallowQueued).toBe(true);
    expect(dropoffGateAccepts(blocked.gate, 40)).toBe(false);
  });

  it("does not mark released while confirm is still held", () => {
    const gate = latchDropoffGate(0, 0);
    const held = tickDropoffGate(gate, 10, { queuedInteract: false, confirmHeld: true });
    expect(held.gate?.released).toBe(false);
    expect(dropoffGateAccepts(held.gate, 10)).toBe(false);
  });
});
