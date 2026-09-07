import { afterEach, describe, expect, it, vi } from "vitest";
import { beginPlay, getSim, shouldShowHowTo, startSession } from "./session";
import { SHIFT_MS } from "./sim/constants";

describe("shouldShowHowTo", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("hides welcome and how-to in npm run dev (vitest is not PROD)", () => {
    vi.stubGlobal("location", { search: "" });
    expect(shouldShowHowTo()).toBe(false);
  });

  it("skips both overlays when ?howto=0", () => {
    vi.stubGlobal("location", { search: "?howto=0" });
    expect(shouldShowHowTo()).toBe(false);
  });

  it("forces welcome then how-to when ?howto=1", () => {
    vi.stubGlobal("location", { search: "?howto=1" });
    expect(shouldShowHowTo()).toBe(true);
  });
});

describe("startSession hour=23", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("ends the shift immediately so results are ready without a frozen shop", () => {
    vi.stubGlobal("location", { search: "?howto=0&hour=23" });
    const sim = startSession(1);
    expect(sim.clock.gameMs).toBe(SHIFT_MS);
    expect(sim.snapshot().shiftEnded).toBe(true);
    expect(sim.snapshot().shiftResults).not.toBeNull();
    beginPlay();
    expect(getSim().snapshot().shiftEnded).toBe(true);
    expect(getSim().snapshot().orders.length).toBe(0);
  });
});
