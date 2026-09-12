import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here, so a checkout delivers CRLF — normalise before matching. */
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const settings = read("../ui/hud/settings.ts");
const constants = read("../ui/hud/constants.ts");
const chrome = read("../ui/chrome.ts");

function between(text: string, start: string, end: string, what: string): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`${what}: start marker not found: ${JSON.stringify(start)}`);
  const to = text.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${what}: end marker not found: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

describe("settings cog panel", () => {
  it("offers music, volume, start-fullscreen, install coach, end shift, and a 9am reset without tutorial toggles", () => {
    expect(settings).not.toContain("Tutorial arrows");
    expect(settings).not.toContain("setTutorialMode");
    expect(settings).toContain("Music");
    expect(settings).toContain("Volume");
    expect(settings).toContain("Start fullscreen");
    expect(settings).toContain("Install for full screen");
    expect(settings).toContain("openInstallCoachFromSettings");
    expect(settings).toContain("loadDisplayPrefs");
    expect(settings).toContain("saveDisplayPrefs");
    expect(settings).toContain("END_SHIFT_LABEL");
    expect(settings).toContain("endShiftEarly");
    expect(settings).toContain("RESET TO 9 AM");
    expect(settings).toContain("resetToMorning");
    expect(settings).toContain("setMusicEnabled");
    expect(settings).toContain("setMusicVolume");
  });

  it("reads the dim's punch-out off the live panel box, not the layout constants", () => {
    const fn = between(settings, "overSettingsPanel(x: number, y: number): boolean {", "\n  }", "overSettingsPanel");
    expect(fn).toContain("this.settingsPanel");
    expect(fn).toContain("width");
    expect(fn).toContain("height");
    expect(fn).not.toContain("SETTINGS_W");
    expect(fn).not.toContain("SETTINGS_H");
    expect(settings).toContain("this.settingsPanel.setSize(SETTINGS_W, box.h);");
  });

  it("derives the panel box from the button box so one scale moves the whole panel", () => {
    expect(constants).toContain("export const SETTINGS_W = SET_BTN_W + SET_PAD * 2;");
    expect(settings).toContain('from "../settingsGeom"');
    expect(settings).toContain("settingsGeom()");
    const geom = read("../ui/settingsGeom.ts");
    expect(geom).toContain("const btnH = Math.max(80, rowH)");
    expect(geom).not.toContain("Math.max(HUD_BUTTON_MIN_H, rowH)");
  });

  it("seeds both button labels at the same step, which only short copy can hold", () => {
    expect(settings.match(/labelSize: SET_BTN_LABEL_PX/g)).toHaveLength(2);
    expect(settings.match(/captionSize: SET_BTN_CAP_PX/g)).toHaveLength(2);
  });

  it("stands the cog caption down while the panel covers it, and brings it back", () => {
    const open = between(settings, "openSettings(): void {", "\n  }", "openSettings");
    const close = between(settings, "close(): void {", "\n  }", "closeSettings");
    expect(open).toContain("this.setCogCaptionShown(false)");
    expect(close).toContain("this.setCogCaptionShown(true)");
  });

  it("uses a rectangle tap target for the cog — Image custom hitArea misses Phaser input on shrunk HUD cameras", () => {
    const create = between(settings, "create(): void {", "\n  }", "settings create");
    expect(create).toMatch(/this\.cog = this\.scene\.add[\s\S]*"tex-cog"/);
    expect(create).toContain("this.cogHit = this.scene.add");
    expect(create).toContain('this.cogHit.on("pointerdown", toggleSettings)');
    expect(create).not.toContain("this.cog.on(\"pointerdown\"");
    expect(create).toContain("signContainer(this.cogCaption)");
    expect(create).toContain("captionHost.setScrollFactor(1)");
    expect(create).not.toContain("this.cogCaption.setScrollFactor");
    expect(create).not.toContain("captionPlaque?.setScrollFactor");
    expect(create).toMatch(/\.setDisplaySize\(cogSize, cogSize\)/);
  });

  it("anchors settings chrome to the live HUD viewport and syncs caption hit on the plaque host", () => {
    const layout = between(settings, "layout(inset: SafeInset): void {", "\n  }", "settings layout");
    expect(layout).toContain("hudSceneViewport(this.scene)");
    expect(layout).toContain("syncSignPlaque(this.cogCaption)");
    expect(layout).toContain("syncSignHit(this.cogCaption)");
    expect(layout).toContain("this.cogHit.setPosition");
    expect(layout).toMatch(/let cogX = viewW - 24 - inset\.right/);
    expect(layout).not.toMatch(/const cogX = GAME_WIDTH - 24 - inset\.right/);
    expect(layout).toContain("signPlaqueExtents(this.cogCaption)");
    expect(layout).toContain("cogCenterX");
    expect(layout, "caption centers on cog AABB").toMatch(
      /cogCenterX = this\.cog\.x - this\.cog\.displayWidth \/ 2/,
    );
    expect(layout, "host x offsets measured plaque mid").toMatch(/plaqueMidX/);
    expect(layout, "caption host tracks clamped plaque center").toMatch(
      /cogCaptionX = clampedCenterX - plaqueMidX/,
    );
  });

  it("keeps a hud button's hit area on the box it paints", () => {
    const paint = between(chrome, "container.setSize(w, h);", "container.input!.cursor", "addHudButton paint");
    expect(paint).toContain("left + container.displayOriginX");
    expect(paint).toContain("top + container.displayOriginY");
  });
});
