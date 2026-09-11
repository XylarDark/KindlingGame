import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("HudScene fixed-step wall-clock sim tick", () => {
  it("advances sim through kindlingClock with scene delta for both clock modes", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("advanceSimClock");
    expect(src).toContain("const frameMs = delta");
    expect(src).toMatch(/frameMs[,\s]/);
    expect(src).not.toMatch(/fixedRaw\s*\?\s*rawDelta/);
    expect(src).not.toMatch(/getClockMode\(\)\s*===\s*"fixedRaw"\s*\?\s*rawDelta/);
    expect(src).not.toMatch(/sim\.tick\(Math\.min\(Math\.max\(0, delta\), MAX_SIM_STEP_MS\)\)/);
  });

  it("defaults smooth with smoothStep on at boot; fixedRaw opt-in via clock mode", () => {
    const config = read("../config.ts");
    expect(config).toContain("smoothStep: false");
    const main = read("../main.ts");
    expect(main).toContain("wantsSmoothStep(clockMode)");
    expect(main).toContain("resolveClockMode()");
    const clock = read("../sim/kindlingClock.ts");
    expect(clock).toContain('return "smooth"');
  });

  it("limits coarse phones to ~30fps target for sustained smoothness", () => {
    const main = read("../main.ts");
    expect(main).toContain("limit: coarse ? 30 : 0");
    expect(main).toContain("target: coarse ? 30 : 60");
    const config = read("../config.ts");
    expect(config).toContain("autoMobilePipeline: true");
    expect(config).toContain("pixelArt: true");
    expect(config).toContain("antialias: false");
  });

  it("exposes feel meter hook from Hud update", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("updateFeelMeter");
    expect(src).toContain("sceneDeltaMs: delta");
  });
});

describe("HudScene paint dirty guards", () => {
  it("dirty-guards clock/score/toast setText and phone refit", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("lastClockLabel");
    expect(src).toContain("if (snap.clockLabel !== this.lastClockLabel)");
    expect(src).toContain("if (scoreResized) this.scoreText.setText(scoreLabel)");
    expect(src).toContain("lastToast");
    expect(src).toContain("lastPhoneLine");
    expect(src).toContain("refitType(this.phoneStatus)");
    // refit only inside phoneLine change guard
    const phone = src.slice(src.indexOf("const phoneLine"), src.indexOf("const showId"));
    expect(phone).toContain("if (phoneLine !== this.lastPhoneLine)");
    expect(phone).toMatch(/if \(phoneLine !== this\.lastPhoneLine\)[\s\S]*refitType\(this\.phoneStatus\)/);
  });

  it("calls setPwaIdle only on shiftEnded edge", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("pwaIdleShiftEnded");
    expect(src).toContain("if (snap.shiftEnded !== this.pwaIdleShiftEnded)");
  });
});
