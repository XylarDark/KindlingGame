import { describe, expect, it, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  clearBootWarmPending,
  peekBootWarmPending,
  setBootWarmPending,
  takeBootWarmPending,
} from "./bootWarm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("bootWarm pending", () => {
  beforeEach(() => clearBootWarmPending());

  it("stores only when drive or door still need warm", () => {
    setBootWarmPending({ drive: false, door: false });
    expect(peekBootWarmPending()).toBeNull();
    setBootWarmPending({ drive: true, door: false });
    expect(peekBootWarmPending()).toEqual({ drive: true, door: false });
    expect(takeBootWarmPending()).toEqual({ drive: true, door: false });
    expect(peekBootWarmPending()).toBeNull();
  });
});

describe("boot warm wiring", () => {
  it("compiles DayNight even when PostFX budget is mid", () => {
    const src = read("src/scenes/BootScene.ts");
    const warm = src.slice(src.indexOf("private async warmBootPipeline"), src.indexOf("private async warmAndSleepScene"));
    expect(warm).not.toContain("!getRenderBudget().postFx) return");
    expect(warm).toContain("registerDayNightPipeline");
    expect(warm).toContain("setPostPipeline(DAY_NIGHT_PIPELINE)");
    expect(warm).toContain("if (!keepAttached) detachDayNight(cam)");
  });

  it("warms shop PostFX and marks degraded warm; Title finishes under the gate", () => {
    const boot = read("src/scenes/BootScene.ts");
    expect(boot).toContain("warmShopPostFx");
    expect(boot).toContain("setBootWarmPending");
    expect(boot).toContain("warm degraded");
    expect(boot).toContain("warmDriveOk");
    expect(boot).toContain("warmDoorOk");
    const warmSleep = boot.slice(boot.indexOf("private async warmAndSleepScene"), boot.indexOf("private async waitFrames"));
    expect(warmSleep).not.toContain("Promise.race");
    const title = read("src/scenes/TitleScene.ts");
    expect(title).toContain("finishDeferredWarm");
    expect(title).toContain("takeBootWarmPending");
    const body = title.slice(title.indexOf("finishDeferredWarm"), title.indexOf("private advance"));
    expect(body).toContain("showLoading");
    expect(body).toContain("hideLoading()");
    expect(body).toContain("finally");
    const showAt = body.indexOf("showLoading");
    const finallyAt = body.indexOf("finally");
    const hideAt = body.indexOf("hideLoading()", finallyAt);
    expect(showAt).toBeGreaterThanOrEqual(0);
    expect(hideAt).toBeGreaterThan(finallyAt);
  });
});
