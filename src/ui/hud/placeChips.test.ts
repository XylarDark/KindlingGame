import { describe, expect, it } from "vitest";
import {
  aabbOverlap,
  ChipPlacer,
  clampChipHost,
  expandAabb,
  type ChipAabb,
} from "./chipCollision";
import { CHIP_GAP } from "./slots";
import type { ChipPlaqueExtents } from "./chipCollision";

const safe = { left: 0, top: 0, right: 500, bottom: 500 };

const plaque200x40 = (): ChipPlaqueExtents => ({
  panelW: 200,
  panelH: 40,
  leftLocal: -100,
  rightLocal: 100,
  topLocal: -40,
  bottomLocal: 0,
});

describe("placeChips collision math", () => {
  it("treats two 200×40 panels 5px apart as overlapping at CHIP_GAP", () => {
    const placer = new ChipPlacer(safe, 500, 500);
    placer.register("first", { left: 50, top: 50, right: 250, bottom: 90 }, 80);
    const fivePxGap: ChipAabb = { left: 255, top: 50, right: 455, bottom: 90 };
    expect(placer.collides(fivePxGap, 70)).toBe(true);
    const atGap: ChipAabb = { left: 250 + CHIP_GAP, top: 50, right: 450 + CHIP_GAP, bottom: 90 };
    expect(placer.collides(atGap, 70)).toBe(false);
  });

  it("expands AABB by CHIP_GAP for clearance checks", () => {
    const inner: ChipAabb = { left: 100, top: 100, right: 300, bottom: 140 };
    const expanded = expandAabb(inner, CHIP_GAP);
    expect(expanded.left).toBe(100 - CHIP_GAP);
    expect(expanded.right).toBe(300 + CHIP_GAP);
  });

  it("offset east by CHIP_GAP + panel width clears a blocker", () => {
    const placer = new ChipPlacer(safe, 500, 500);
    placer.register("first", { left: 50, top: 50, right: 250, bottom: 90 }, 80);
    const plaque = plaque200x40();
    const preferredX = 150;
    const preferredY = 70;
    const eastX = preferredX + CHIP_GAP + plaque.panelW;
    const { aabb } = clampChipHost(eastX, preferredY, plaque, safe);
    expect(placer.collides(aabb, 70)).toBe(false);
    expect(aabb.left - 250).toBeGreaterThanOrEqual(CHIP_GAP);
  });

  it("findOpenSlot moves the second panel so AABBs are CHIP_GAP clear or returns null", () => {
    const placer = new ChipPlacer(safe, 500, 500);
    const first: ChipAabb = { left: 50, top: 50, right: 250, bottom: 90 };
    placer.register("first", first, 80);
    const plaque = plaque200x40();
    const placed = placer.findOpenSlot(150, 70, plaque, 70, "second");
    expect(placed).not.toBeNull();
    const second = placed!.aabb;
    const separated =
      second.right <= first.left - CHIP_GAP ||
      second.left >= first.right + CHIP_GAP ||
      second.bottom <= first.top - CHIP_GAP ||
      second.top >= first.bottom + CHIP_GAP;
    expect(separated).toBe(true);
  });

  it("detects overlap when expanded boxes are closer than CHIP_GAP", () => {
    const a: ChipAabb = { left: 0, top: 0, right: 100, bottom: 40 };
    const b: ChipAabb = { left: 105, top: 0, right: 205, bottom: 40 };
    expect(aabbOverlap(a, b)).toBe(false);
    expect(aabbOverlap(a, expandAabb(b, CHIP_GAP))).toBe(true);
  });
});
