import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("game scale config", () => {
  it("uses Scale.NONE so CSS can stretch the 1920×1080 canvas", () => {
    const src = readFileSync(join(root, "src/config.ts"), "utf8");
    expect(src).toContain("Phaser.Scale.NONE");
    expect(src).not.toContain("EXACT_FIT");
    expect(src).not.toMatch(/Phaser\.Scale\.FIT\b/);
    expect(src).not.toMatch(/Phaser\.Scale\.RESIZE\b/);
  });

  it("leaves Phaser audio enabled so the session loop can play", () => {
    const src = readFileSync(join(root, "src/config.ts"), "utf8");
    expect(src).not.toMatch(/noAudio\s*:\s*true/);
  });

  it("sizes HUD buttons from the worst-case CSS stretch", () => {
    const src = readFileSync(join(root, "src/ui/chrome.ts"), "utf8");
    expect(src).toContain("HUD_BUTTON_MIN_H = HUD_TOUCH_MIN_DESIGN");
  });
});
