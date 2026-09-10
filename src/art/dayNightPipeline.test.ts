import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { GRADE_APPLY_MIN_MS, shouldApplyGrade } from "./dayNightGradeGate";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("shouldApplyGrade", () => {
  it("rebuilds immediately when dirty", () => {
    expect(
      shouldApplyGrade({ nowMs: 100, lastMs: 99, dirty: true, minMs: GRADE_APPLY_MIN_MS }),
    ).toBe(true);
  });

  it("throttles clean rebuilds to ~80ms (Shop cadence)", () => {
    expect(GRADE_APPLY_MIN_MS).toBe(80);
    expect(shouldApplyGrade({ nowMs: 50, lastMs: 0, dirty: false })).toBe(false);
    expect(shouldApplyGrade({ nowMs: 80, lastMs: 0, dirty: false })).toBe(true);
    expect(shouldApplyGrade({ nowMs: 79, lastMs: 0, dirty: false, minMs: 80 })).toBe(false);
  });
});

describe("DayNight upload-once wiring", () => {
  const src = read("dayNightPipeline.ts");

  it("uploads uniforms from onDraw only — not onPreRender (diag rank #2)", () => {
    const pre = src.slice(src.indexOf("onPreRender("), src.indexOf("onDraw("));
    expect(pre).toContain("syncViewFromCamera");
    expect(pre).not.toContain("uploadThrottled");
    const draw = src.slice(src.indexOf("onDraw("), src.indexOf("private syncViewFromCamera"));
    expect(draw).toContain("uploadThrottled");
    expect(draw).toContain("bindAndDraw");
  });

  it("runs DayNight on halfFrame when postFxScale < 1", () => {
    expect(src).toContain("shouldRunHalfResPostFx");
    expect(src).toContain("halfFrame1");
    expect(src).toContain("halfFrame2");
    expect(src).toContain("copyFrame(renderTarget, half)");
    expect(src).toContain("copyToGame(graded)");
    expect(src).toContain("postFxScale");
  });

  it("guards double upload with Phaser loop frame id", () => {
    expect(src).toContain("lastUploadFrame");
    expect(src).toContain("this.game.loop.frame");
    expect(src).toContain("if (frame === this.lastUploadFrame) return");
  });

  it("mutates grade in place instead of object spread / lights.slice", () => {
    const setGrade = src.slice(src.indexOf("setGrade("), src.indexOf("onPreRender("));
    expect(setGrade).not.toContain("{ ...frame");
    expect(setGrade).not.toContain("frame.lights.slice");
    expect(setGrade).toContain("lights.length = count");
  });
});
