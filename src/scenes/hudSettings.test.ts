import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here, so a checkout delivers CRLF — normalise before matching. */
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const src = read("HudScene.ts");
const chrome = read("../ui/chrome.ts");

/**
 * Slice between two markers. Throws on a miss rather than returning the rest of the
 * file: a fail-open scan here once let a whole audit pass by matching nothing.
 */
function between(text: string, start: string, end: string, what: string): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`${what}: start marker not found: ${JSON.stringify(start)}`);
  const to = text.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${what}: end marker not found: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

describe("settings cog panel", () => {
  it("offers music, volume, start-fullscreen, end shift, and a 9am reset without tutorial toggles", () => {
    expect(src).not.toContain("Tutorial arrows");
    expect(src).not.toContain("setTutorialMode");
    expect(src).toContain("Music");
    expect(src).toContain("Volume");
    expect(src).toContain("Start fullscreen");
    expect(src).toContain("loadDisplayPrefs");
    expect(src).toContain("saveDisplayPrefs");
    expect(src).toContain("END_SHIFT_LABEL");
    expect(src).toContain("endShiftEarly");
    expect(src).toContain("RESET TO 9 AM");
    expect(src).toContain("resetToMorning");
    expect(src).toContain("startNewDay");
    expect(src).toContain("setMusicEnabled");
    expect(src).toContain("setMusicVolume");
  });

  it("reads the dim's punch-out off the live panel box, not the layout constants", () => {
    // Restating SETTINGS_W/H here is what would let the panel be resized while the hole
    // in the dim stayed put — the dim would then close the panel on the same click that
    // worked a control, which is the bug this punch-out exists to prevent.
    const fn = between(src, "private overSettingsPanel(", "\n  }", "overSettingsPanel");
    expect(fn).toContain("this.settingsPanel");
    expect(fn).toContain("width");
    expect(fn).toContain("height");
    expect(fn).not.toContain("SETTINGS_W");
    expect(fn).not.toContain("SETTINGS_H");
    // A Container is 0x0 until sized, which would shrink the punch-out to nothing.
    expect(src).toContain("this.settingsPanel.setSize(SETTINGS_W, SETTINGS_H);");
  });

  it("derives the panel box from the button box so one scale moves the whole panel", () => {
    expect(src).toContain("const SETTINGS_W = SET_BTN_W + SET_PAD * 2;");
    expect(src).toContain("const SETTINGS_H = SET_HINT_Y + SET_HINT_H + SET_PAD;");
    expect(src.match(/minWidth: SET_BTN_W/g)).toHaveLength(2);
    expect(src.match(/minHeight: SET_BTN_H/g)).toHaveLength(2);
  });

  it("seeds both button labels at the same step, which only short copy can hold", () => {
    // fitTypeToBox only ever shrinks, so a seed above what the box can fit renders at
    // the fitted size and the constant becomes a lie. "RESET DAY TO 9:00 AM" overran the
    // label box and pinned itself to 18px next to END SHIFT's 26px; the copy was cut to
    // "RESET TO 9 AM" to buy the size back. This pins the seeds — a longer label would
    // still shrink silently, so the rendered px is checked in-browser, not here.
    expect(src.match(/labelSize: SET_BTN_LABEL_PX/g)).toHaveLength(2);
    expect(src.match(/captionSize: SET_BTN_CAP_PX/g)).toHaveLength(2);
  });

  it("stands the cog caption down while the panel covers it, and brings it back", () => {
    // The panel is anchored to the same corner and closes over the caption's top 16px.
    // Hiding it is also what stops it taking clicks from under the panel, since Phaser
    // will not hit-test what it would not render — so the cog has to remain the way out,
    // and it does: nothing is drawn over the cog. Verified in-browser by clicking the
    // caption's own coordinates while the panel is open and finding them dead.
    const open = between(src, "private openSettings(", "\n  }", "openSettings");
    const close = between(src, "private closeSettings(", "\n  }", "closeSettings");
    expect(open).toContain("this.setCogCaptionShown(false)");
    expect(close).toContain("this.setCogCaptionShown(true)");
  });

  it("keeps a hud button's hit area on the box it paints", () => {
    // Phaser adds displayOrigin to the local point before testing the hit area, and a
    // Container's origin is its centre. A rect given in the same coordinates as the fill
    // therefore sits half a button up and left of it: most of the button dead, and a
    // matching slab of empty panel live.
    const paint = between(chrome, "container.setSize(w, h);", "container.input!.cursor", "addHudButton paint");
    expect(paint).toContain("left + container.displayOriginX");
    expect(paint).toContain("top + container.displayOriginY");
  });
});
