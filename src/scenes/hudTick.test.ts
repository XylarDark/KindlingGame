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
  it("dirty-guards clock/score/toast setText and relies on bindPolish for phone refit", () => {
    const src = read("HudScene.ts");
    const phone = read("../ui/hud/phone.ts");
    const readouts = read("../ui/hud/readouts.ts");
    expect(src).toContain("lastClockLabel");
    expect(src).toContain("if (snap.clockLabel !== this.lastClockLabel)");
    expect(src).toContain("if (scoreResized) this.readouts.scoreText.setText(scoreLabel)");
    expect(src).toContain("lastToast");
    expect(phone).toContain("lastPhoneLine");
    expect(phone).toContain("if (phoneLine !== this.lastPhoneLine)");
    expect(phone).toMatch(/setPadding\(10, 6, 10, 6\)[\s\S]*phoneStatus\.setText\(phoneLine\)/);
    expect(phone).not.toContain("refitType(this.phoneStatus)");
    const cover = readouts.slice(readouts.indexOf("paintCover("), readouts.indexOf("coverMaxWidth(): number"));
    expect(cover).not.toContain("refitType(this.coverText)");
    expect(readouts).toContain("clipCoverLine");
    expect(readouts).toContain("coverMaxWidth");
    expect(src).toContain("paintDoorTitle");
    expect(src).toContain("releaseDropoffConfirm()");
  });

  it("caches tutorial hints and music sync on sky band", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("tutorialFlashHint");
    expect(src).toContain("syncMusicIfNeeded");
    expect(src).toContain("lastShowPhone");
    expect(src).toContain("lastShowId");
  });

  it("calls setPwaIdle only on shiftEnded edge", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("pwaIdleShiftEnded");
    expect(src).toContain("if (snap.shiftEnded !== this.pwaIdleShiftEnded)");
  });

  it("hides score/clock/cog at door and during ID inspect", () => {
    const src = read("HudScene.ts");
    const readouts = read("../ui/hud/readouts.ts");
    expect(src).toContain("paintReadoutChrome");
    const fn = readouts.slice(readouts.indexOf("paintReadoutChrome("), readouts.indexOf("paintDoorTitle("));
    expect(fn).toMatch(/atDoor \|\| showId/);
    expect(fn).toContain("this.scoreText.setVisible(!hide)");
    expect(fn).toContain("this.clockText.setVisible(!hide)");
    expect(fn).toContain("chrome.cog.setVisible(!hide)");
  });

  it("hides the shop scene while driving so ORDERS cannot leak into Door", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("syncShopVisibility");
    expect(src).toContain('this.scene.setVisible(show, "shop")');
  });

  it("shows COUNTER cover only in shop (keyLead), not on Drive", () => {
    const readouts = read("../ui/hud/readouts.ts");
    const cover = readouts.slice(readouts.indexOf("paintCover("), readouts.indexOf("coverMaxWidth(): number"));
    expect(cover).toMatch(/playerRole\s*===\s*"keyLead"/);
    expect(cover).toContain("cover.active");
  });

  it("clamps drive pad label inside the HUD viewport; descriptive map chips stay hidden", () => {
    const src = read("HudScene.ts");
    expect(src).toContain("clampSignHost");
    expect(src).toContain("placePadLabel");
    const callouts = src.slice(src.indexOf("private paintDriveCallouts"), src.indexOf("private tutorialFlashHint"));
    expect(callouts).toContain("drivePinLabel.setVisible(false)");
    expect(callouts).not.toContain("clampSignHost(this.drivePinLabel");
  });

  it("sleeps drive/door when keyLead owns the shop world", () => {
    const src = read("HudScene.ts");
    const sync = src.slice(src.indexOf("private syncDriveScene"), src.indexOf("private makeResults"));
    expect(sync).toContain('this.lastDriveSceneKey !== "__shop__"');
    expect(sync).toContain("ensureShopVisible()");
  });
});
