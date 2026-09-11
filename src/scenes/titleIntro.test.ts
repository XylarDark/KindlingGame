import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here — normalise before matching. */
const src = readFileSync(join(here, "TitleScene.ts"), "utf8").replace(/\r\n/g, "\n");

describe("title welcome / howto intro scale", () => {
  it("exports a dedicated 2× intro scale for welcome and howto", () => {
    expect(src).toContain("export const TITLE_INTRO_SCALE = 2.0");
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

describe("title how-to start flow", () => {
  it("does not stack setTopOnly above the OPEN THE SHOP button", () => {
    expect(src).toContain("this.input.setTopOnly(false)");
    expect(src).not.toContain("this.input.setTopOnly(true)");
  });

  it("makes the dim visual-only on how-to and routes the button straight to begin()", () => {
    const howto = src.slice(src.indexOf("private drawHowTo"), src.indexOf("private async finishDeferredWarm"));
    expect(howto).toContain("OPEN THE SHOP");
    expect(howto).toContain("void this.begin()");
    expect(howto).toContain("this.dimOverlay.disableInteractive()");
    expect(howto).not.toContain("HOWTO_HINT");
    expect(howto).not.toContain("addSignText");
  });

  it("does not start the shift from dim tap or any-key on how-to", () => {
    const advance = src.slice(src.indexOf("private async advanceAsync"), src.indexOf("private async begin"));
    expect(advance).toContain('if (this.phase === "howto") return');
    expect(src).toContain('if (this.phase === "howto") return');
  });

  it("caps deferred warm so begin() cannot hang forever", () => {
    const begin = src.slice(src.indexOf("private async begin"));
    expect(begin).toContain("Promise.race");
    expect(begin).toContain("TITLE_BEGIN_WARM_MS");
    expect(begin).toContain("beginPlay()");
    expect(begin).toContain('this.scene.resume("shop")');
    expect(begin).toContain('this.scene.resume("hud")');
    expect(begin).toContain("this.scene.stop()");
  });

  it("passes HTML overlay taps through to the canvas while title is up", () => {
    expect(src).toContain("setTitleHtmlInputPassThrough(true)");
    expect(src).toContain("setTitleHtmlInputPassThrough(false)");
  });

  it("hides HUD chrome under the title overlay", () => {
    expect(src).toContain('this.scene.setVisible(false, "hud")');
    expect(src).toContain('this.scene.setVisible(true, "hud")');
  });
});
