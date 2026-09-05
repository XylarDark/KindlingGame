import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "HudScene.ts"), "utf8");

describe("settings cog panel", () => {
  it("offers music, volume, and a 9am reset without tutorial toggles", () => {
    expect(src).not.toContain("Tutorial arrows");
    expect(src).not.toContain("setTutorialMode");
    expect(src).toContain("Music");
    expect(src).toContain("Volume");
    expect(src).toContain("RESET DAY TO 9:00 AM");
    expect(src).toContain("resetToMorning");
    expect(src).toContain("setMusicEnabled");
    expect(src).toContain("setMusicVolume");
  });
});
