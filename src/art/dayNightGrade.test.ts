import { describe, expect, it } from "vitest";
import { GAME_HEIGHT, GAME_WIDTH, MS_PER_GAME_HOUR } from "../sim/constants";
import { skyAt } from "../sim/dayNight";
import { CEILING_POT_LEFT, CEILING_POT_RIGHT, COUNTER_FRONT, COUNTER_TOP, ceilingPots, WINDOW } from "../maps/shopT0";
import { DAY_NIGHT_TUNE, driveGrade, shopGrade, windowGlowLook, worldToUv } from "./dayNightGrade";

function atHour(hour: number): number {
  return (hour - 9) * MS_PER_GAME_HOUR;
}

function blueOverRed(hex: number): number {
  const r = Math.max(1, (hex >> 16) & 255);
  const b = hex & 255;
  return b / r;
}

const SHOP_VIEW = { x: 0, y: 0, width: GAME_WIDTH, height: GAME_HEIGHT };

describe("worldToUv", () => {
  it("maps shop top-left and center into 0–1 UVs", () => {
    expect(worldToUv(0, 0, SHOP_VIEW)).toEqual({ u: 0, v: 0 });
    expect(worldToUv(GAME_WIDTH / 2, GAME_HEIGHT / 2, SHOP_VIEW)).toEqual({ u: 0.5, v: 0.5 });
  });
});

describe("shopGrade", () => {
  it("keeps tungsten key pots constant as circular floor pools", () => {
    const noon = shopGrade(skyAt(atHour(12)), ceilingPots());
    const night = shopGrade(skyAt(atHour(20.5)), ceilingPots());
    const noonPots = noon.lights.filter((l) => l.kind === "pot");
    const nightPots = night.lights.filter((l) => l.kind === "pot");
    expect(noonPots).toHaveLength(5);
    expect(nightPots).toHaveLength(5);
    expect(noonPots[0]!.intensity).toBe(nightPots[0]!.intensity);
    expect(noonPots[0]!.color).toBe(DAY_NIGHT_TUNE.potColor);
    expect(noonPots[0]!.y).toBeGreaterThan(COUNTER_TOP);
    expect(noonPots[0]!.y).toBeGreaterThanOrEqual(COUNTER_FRONT);
    expect(noonPots[0]!.scaleX ?? 1).toBeLessThan(1);
    expect(noonPots[0]!.scaleY ?? 1).toBeGreaterThan(0.9);
    expect(noonPots[0]!.scaleY ?? 1).toBeLessThan(1.35);
    expect(noonPots[0]!.intensity).toBeGreaterThanOrEqual(0.45);
    expect(noonPots.map((l) => l.x)).toEqual(ceilingPots());
    const xs = noonPots.map((l) => l.x);
    expect(xs[0]).toBe(CEILING_POT_LEFT);
    expect(xs[xs.length - 1]).toBe(CEILING_POT_RIGHT);
    const span = xs[xs.length - 1]! - xs[0]!;
    xs.forEach((x, i) => {
      expect(x).toBe(Math.round(xs[0]! + (span * i) / (xs.length - 1)));
    });
    expect(noon.ambientMul).toBeGreaterThan(night.ambientMul);
    expect(nightPots[0]!.intensity).toBeGreaterThan(night.ambientMul);
    expect(noon.ambient[0]).toBeGreaterThanOrEqual(noon.ambient[2]);
  });

  it("spills a modest outdoor glow through the delivery window only", () => {
    const noon = shopGrade(skyAt(atHour(12)), ceilingPots());
    const night = shopGrade(skyAt(atHour(20.5)), ceilingPots());
    const noonWin = noon.lights.filter((l) => l.kind === "window");
    const nightWin = night.lights.filter((l) => l.kind === "window");
    const pot = noon.lights.find((l) => l.kind === "pot")!;
    expect(noon.lights.every((l) => l.kind !== "door")).toBe(true);
    expect(night.lights.every((l) => l.kind !== "door")).toBe(true);
    expect(noonWin).toHaveLength(1);
    expect(noonWin[0]!.x).toBe(WINDOW.x);
    expect(noonWin[0]!.scaleX ?? 1).toBeLessThan(0.55);
    expect(noonWin[0]!.scaleY ?? 1).toBeGreaterThan(1.4);
    expect(noonWin[0]!.intensity).toBeGreaterThan(nightWin[0]!.intensity);
    expect(noonWin[0]!.intensity).toBeLessThan(pot.intensity);
    expect(blueOverRed(noonWin[0]!.color)).toBeGreaterThan(blueOverRed(DAY_NIGHT_TUNE.potColor));
    expect(blueOverRed(nightWin[0]!.color)).toBeGreaterThan(blueOverRed(noonWin[0]!.color));
  });

  it("adds a day-only rim kick on the driver bench", () => {
    const noon = shopGrade(skyAt(atHour(12)), ceilingPots());
    const night = shopGrade(skyAt(atHour(20.5)), ceilingPots());
    expect(noon.lights.some((l) => l.kind === "rim")).toBe(true);
    expect(night.lights.every((l) => l.kind !== "rim")).toBe(true);
  });

  it("glows from the window without hard sun shafts", () => {
    const noon = windowGlowLook(skyAt(atHour(12)));
    const night = windowGlowLook(skyAt(atHour(20.5)));
    const deep = windowGlowLook(skyAt(atHour(23)));
    expect(noon.alpha).toBeGreaterThan(0.04);
    expect(noon.alpha).toBeLessThan(0.14);
    expect(noon.alpha).toBeGreaterThan(night.alpha);
    expect(night.alpha).toBeLessThan(0.05);
    expect(deep.alpha).toBeLessThanOrEqual(night.alpha);
    expect(blueOverRed(night.color)).toBeGreaterThan(blueOverRed(noon.color));
  });

  it("does not globally grade the interior as hard at night as the drive map", () => {
    const night = shopGrade(skyAt(atHour(20.5)), ceilingPots());
    const drive = driveGrade(skyAt(atHour(20.5)), { x: 400, y: 300 });
    expect(night.gradeStrength).toBeLessThan(0.12);
    expect(night.gradeStrength).toBeLessThan(drive.gradeStrength);
    expect(night.ambientMul).toBeGreaterThan(DAY_NIGHT_TUNE.ambientFloor - 0.001);
    expect(night.ambientMul).toBeLessThan(0.5);
  });
});

describe("driveGrade", () => {
  it("grades dusk/night without ceiling pots", () => {
    const night = driveGrade(skyAt(atHour(20.5)), { x: 400, y: 300 });
    expect(night.lights.every((l) => l.kind !== "pot")).toBe(true);
    expect(night.gradeStrength).toBeGreaterThan(0.3);
    expect(night.ambientMul).toBeLessThan(0.7);
    expect(night.lights.some((l) => l.kind === "lamp")).toBe(true);
  });

  it("stays subtle at noon", () => {
    const noon = driveGrade(skyAt(atHour(12)));
    expect(noon.lights).toHaveLength(0);
    expect(noon.ambientMul).toBeGreaterThan(0.9);
  });
});
