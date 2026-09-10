import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("HudScene wall-clock sim tick", () => {
  it("ticks the sim from loop.rawDelta, not Phaser's smoothed delta", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("this.game.loop.rawDelta");
    expect(src).toContain("MAX_SIM_STEP_MS");
    expect(src).not.toMatch(/sim\.tick\(delta\)/);
  });

  it("disables Phaser fps.smoothStep so focus/cooldown cannot soft-throttle the loop", () => {
    const config = read("../config.ts");
    expect(config).toContain("smoothStep: false");
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
