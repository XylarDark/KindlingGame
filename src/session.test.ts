import { afterEach, describe, expect, it, vi } from "vitest";
import { beginPlay, consumePendingCaptureSeed, getSim, shouldShowHowTo, startSession } from "./session";
import { customerSlotX } from "./maps/shopT0";
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

describe("capture seed deferral", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("queues capture at beginPlay and applies on consume", () => {
    vi.stubGlobal("location", { search: "?capture=shop-counter&howto=0" });
    startSession(2);
    beginPlay();
    expect(getSim().snapshot().customers).toHaveLength(0);
    expect(consumePendingCaptureSeed()).toBe(true);
    expect(consumePendingCaptureSeed()).toBe(false);
    const c = getSim().snapshot().customers[0];
    expect(c?.bubble).toMatch(/I want /);
    expect(Math.abs((c?.x ?? 0) - customerSlotX(0))).toBeLessThan(2);
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
