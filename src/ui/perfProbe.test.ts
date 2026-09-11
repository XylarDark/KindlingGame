import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  notePerfPlaquePump,
  notePerfRawDelta,
  notePerfSetText,
  resetPerfProbeForTests,
  resetPerfProbeWindow,
  samplePerfProbe,
} from "./perfProbe";

describe("perfProbe", () => {
  it("tracks raw delta p95 and counter windows", () => {
    resetPerfProbeForTests();
    resetPerfProbeWindow(0);
    for (let i = 0; i < 20; i++) notePerfRawDelta(i);
    notePerfSetText();
    notePerfSetText();
    notePerfPlaquePump();
    const game = { loop: { actualFps: 29.7 }, scene: { getScenes: () => [] } } as never;
    const sample = samplePerfProbe(game, 1000);
    expect(sample.actualFps).toBe(29.7);
    expect(sample.p95RawDeltaMs).toBe(19);
    expect(sample.setTextCount).toBe(2);
    expect(sample.plaquePumpCount).toBe(1);
    expect(sample.windowMs).toBe(1000);
  });

  it("exposes kindlingPerfProbe on boot for agent-shot eval", () => {
    const main = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../main.ts"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(main).toContain("kindlingPerfProbe");
    expect(main).toContain("resetPerfProbeWindow");
    expect(main).toContain("samplePerfProbe");
  });

  it("Hud update feeds rawDelta into the probe", () => {
    const hud = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../scenes/HudScene.ts"), "utf8").replace(
      /\r\n/g,
      "\n",
    );
    expect(hud).toContain("notePerfRawDelta(rawDelta)");
  });
});
