import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("titleHtmlInput pointer pass-through", () => {
  it("TitleScene owns overlay active state and install coach re-syncs on show", () => {
    const title = read("src/scenes/TitleScene.ts");
    expect(title).toContain("setTitleOverlayActive(true)");
    expect(title).toContain("setTitleOverlayActive(false)");
    expect(title).not.toContain("setTitleHtmlInputPassThrough(true)");

    const coach = read("src/ui/installCoach.ts");
    expect(coach).toContain("syncTitleHtmlInput()");
  });

  it("titleHtmlInput clears gate and coach pointer hits while title overlay is active", () => {
    const src = read("src/ui/titleHtmlInput.ts");
    expect(src).toContain("titleOverlayActive");
    expect(src).toContain("setTitleOverlayActive");
    expect(src).toContain("syncTitleHtmlInput");
    expect(src).toContain('gate.style.pointerEvents = "none"');
    expect(src).toContain('coach.style.pointerEvents = "none"');
    expect(src).toContain("passThrough || coach.hidden ? \"none\" : \"auto\"");
  });

  it("index.html keeps loading-gate clickable only while visible", () => {
    const html = read("index.html");
    const gateCss = html.slice(html.indexOf("#loading-gate {"), html.indexOf("#loading-gate[hidden]"));
    expect(gateCss).toContain("pointer-events: auto");
    const hiddenCss = html.slice(html.indexOf("#loading-gate[hidden]"), html.indexOf(".loading-gate__card"));
    expect(hiddenCss).toContain("pointer-events: none");
  });

  it("titleIntro guards still require HTML pass-through wiring", () => {
    const guards = read("src/scenes/titleIntro.test.ts");
    expect(guards).toContain("setTitleOverlayActive");
  });
});
