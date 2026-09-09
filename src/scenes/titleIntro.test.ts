import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here — normalise before matching. */
const src = readFileSync(join(here, "TitleScene.ts"), "utf8").replace(/\r\n/g, "\n");

describe("title welcome / howto intro scale", () => {
  it("exports a dedicated ~50% intro scale for welcome and howto", () => {
    expect(src).toContain("export const TITLE_INTRO_SCALE = 1.5");
  });

  it("scales welcome type from the pre-bump baselines by TITLE_INTRO_SCALE", () => {
    expect(src).toContain("WELCOME_TITLE_BASE_PX = 36.3");
    expect(src).toContain("WELCOME_HINT_BASE_PX = 21.8");
    expect(src).toContain("introPx(WELCOME_TITLE_BASE_PX)");
    expect(src).toContain("introPx(WELCOME_HINT_BASE_PX)");
    // Hardcoded pre-bump sizes must not remain as final font sizes.
    expect(src).not.toMatch(/size: "36\.3px"/);
    expect(src).not.toMatch(/size: "21\.8px"/);
  });

  it("grows howto card type and boxes through intro helpers", () => {
    expect(src).toContain("introPx(20)");
    expect(src).toContain("introPx(16)");
    expect(src).toContain("introN(216)");
    expect(src).toContain("labelMaxHeight: introN(36)");
  });

  it("keeps three howto cards inside the 1920 design width", () => {
    // Width is derived from GAME_WIDTH minus side/gap — not a blind 1.5× of 440
    // which would overflow (440*1.5*3 + gaps > 1920).
    expect(src).toContain("Math.floor((GAME_WIDTH - side * 2 - gap * 2) / 3)");
    expect(src).not.toContain("const cardW = 440");
  });
});
