import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("DriveScene grade throttle and dirty guards", () => {
  const src = read("DriveScene.ts");

  it("throttles applyDayNight with shouldApplyGrade (diag rank #3)", () => {
    expect(src).toContain("shouldApplyGrade");
    expect(src).toContain("lastGradeKey");
    expect(src).toContain("lastGradeMs");
    const paint = src.slice(src.indexOf("private paintDayNight"), src.indexOf("private paintNightGlow"));
    expect(paint).toContain("shouldApplyGrade");
    expect(paint).toContain("applyDayNight");
  });

  it("dirty-guards pinLabel setText and lot glow redraw", () => {
    expect(src).toContain("lastPinWho");
    expect(src).toContain("if (who !== this.lastPinWho)");
    expect(src).toContain("lastLotGlowKey");
    expect(src).toContain("if (stopId !== this.lastLotGlowKey)");
  });
});

describe("DoorScene grade throttle", () => {
  it("gates applyDayNight like Shop (~80ms / dirty sky)", () => {
    const src = read("DoorScene.ts");
    expect(src).toContain("shouldApplyGrade");
    expect(src).toContain("lastGradeKey");
    const from = src.indexOf("if (getRenderBudget().postFx)");
    const to = src.indexOf("const destOrder", from);
    const block = src.slice(from, to);
    expect(block).toContain("shouldApplyGrade");
    expect(block).toContain("applyDayNight");
  });
});
