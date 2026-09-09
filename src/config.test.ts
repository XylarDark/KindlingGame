import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

describe("game scale config", () => {
  it("uses Scale.NONE so CSS can size the 1920×1080 canvas", () => {
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

  it("sizes HUD buttons from the worst-case CSS scale", () => {
    const src = readFileSync(join(root, "src/ui/chrome.ts"), "utf8");
    expect(src).toContain("HUD_BUTTON_MIN_H = HUD_TOUCH_MIN_DESIGN");
  });

  it("letterboxes a 16:9 stage with Kindling side rails (no fill-stretch)", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    expect(html).toContain("object-fit: contain");
    expect(html).not.toContain("object-fit: fill");
    expect(html).toContain("kindling-rail");
    expect(html).toContain('id="rail-left"');
    expect(html).toContain('id="rail-right"');
    expect(html).toContain("viewport-fit=cover");
    expect(html).toContain("100dvh");
    expect(html).toContain("no-cache, no-store, must-revalidate");
  });

  it("paints OS chrome and letterbox as sky, keeping leaf on the side rails", () => {
    const html = readFileSync(join(root, "index.html"), "utf8").replace(/\r\n/g, "\n");
    const manifest = readFileSync(join(root, "public/manifest.webmanifest"), "utf8");
    const config = readFileSync(join(root, "src/config.ts"), "utf8");
    expect(html).toContain('name="theme-color" content="#1b2238"');
    expect(html).toMatch(/\.kindling-rail \{[\s\S]*?background: #3d6a44/);
    const bodyRule = /html,\s*body \{[^}]+\}/.exec(html);
    if (!bodyRule) throw new Error("html, body rule missing");
    expect(bodyRule[0]).toContain("background: #1b2238");
    expect(bodyRule[0]).not.toContain("position: fixed");
    expect(config).toContain('backgroundColor: "#1b2238"');
    expect(manifest).toContain('"theme_color": "#1b2238"');
    expect(manifest).toContain('"background_color": "#1b2238"');
    expect(manifest).toContain('"display_override"');
    expect(manifest).toContain("fullscreen");
  });
});
