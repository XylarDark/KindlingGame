import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here — normalise before matching. */
const src = readFileSync(join(here, "TitleScene.ts"), "utf8").replace(/\r\n/g, "\n");

describe("title welcome / howto intro scale", () => {
  it("uses baked TYPE_INTRO tokens from typeScale, not TITLE_INTRO_SCALE", () => {
    expect(src).toContain("TYPE_INTRO");
    expect(src).toContain("typeIntroPx");
    expect(src).toContain("typeIntroN");
    expect(src).not.toContain("TITLE_INTRO_SCALE");
    expect(src).not.toMatch(/size: "36\.3px"/);
    expect(src).not.toMatch(/size: "21\.8px"/);
  });

  it("sizes welcome copy from TYPE_INTRO welcome tokens", () => {
    expect(src).toContain("typeIntroPx(TYPE_INTRO.welcomeTitle)");
    expect(src).toContain("typeIntroPx(TYPE_INTRO.welcomeHint)");
  });

  it("grows howto card type and boxes through intro helpers", () => {
    expect(src).toContain("typeIntroPx(TYPE_INTRO.howtoHeading)");
    expect(src).toContain("typeIntroPx(TYPE_INTRO.howtoBody)");
    expect(src).toContain("typeIntroN(216)");
    expect(src).toContain("labelMaxHeight: typeIntroN(36)");
  });

  it("keeps three howto cards inside the 1920 design width", () => {
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

  it("hides HUD chrome under the title overlay and during how-to", () => {
    expect(src).toContain('this.scene.setVisible(false, "hud")');
    expect(src).toContain('this.scene.setVisible(true, "hud")');
    const howto = src.slice(src.indexOf("private drawHowTo"), src.indexOf("private async finishDeferredWarm"));
    expect(howto).toContain('this.scene.setVisible(false, "hud")');
  });
});
