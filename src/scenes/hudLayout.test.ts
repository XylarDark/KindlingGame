import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { COUNTER_SIGN } from "../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here, so a checkout delivers CRLF — normalise before matching. */
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const hud = read("HudScene.ts");
const readouts = read("../ui/hud/readouts.ts");
const settings = read("../ui/hud/settings.ts");
const sign = read("../ui/signText.ts");
const budget = read("../ui/renderBudget.ts");

function between(text: string, start: string, end: string, what: string): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`${what}: start marker not found: ${JSON.stringify(start)}`);
  const to = text.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${what}: end marker not found: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

describe("HUD sign attachment guards", () => {
  it("positions sign chips through setSignPosition in layoutHud, not inner Text setPosition", () => {
    const layout = between(hud, "private layoutHud(): void {", "private paintHud", "layoutHud");
    expect(layout).toContain("this.readouts.layoutReadoutColumn(inset)");
    expect(layout).not.toMatch(/this\.cogCaption\.setPosition\(/);
    const readoutLayout = between(readouts, "layoutReadoutColumn(inset: SafeInset): void {", "\n  }", "layoutReadoutColumn");
    expect(readoutLayout).toContain("setSignPosition(this.coverText");
    expect(readoutLayout).not.toMatch(/this\.coverText\.setPosition\(/);
  });

  it("parents score pop pool hosts, not inner Text, so plaques do not orphan at (0,0)", () => {
    const warm = between(readouts, "warmScorePopPool(): void {", "\n  }", "warmScorePopPool");
    expect(warm).toContain("this.scorePopLayer.add(signContainer(label))");
    expect(warm).not.toMatch(/this\.scorePopLayer\.add\(label\)/);
  });

  it("anchors shop readouts to the counter sign box when readoutsInShop", () => {
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    const project = between(readouts, "counterSignReadoutAnchors(): { signLeft: number; signRight: number; y: number } {", "\n  }", "counterSignReadoutAnchors");
    expect(place).toContain("if (this.readoutsInShop)");
    expect(place).toContain("counterSignReadoutAnchors()");
    expect(place).toContain("this.scoreText.setOrigin(1, 0.5).setPosition(signLeft, y)");
    expect(place).toContain("this.clockText.setOrigin(0, 0.5).setPosition(signRight, y)");
    expect(project).toContain("worldToScreen(cam");
    expect(project).toContain("COUNTER_SIGN");
    expect(place).not.toContain("COUNTER_SIGN.y)");
    expect(place).not.toMatch(/setPosition\([^)]*,\s*0\s*\)/);
  });

  it("keeps the settings caption off the right edge and above the cog column", () => {
    const layout = between(settings, "layout(inset: SafeInset): void {", "\n  }", "settings layout");
    expect(layout).toContain("cogCaptionX");
    expect(layout).toContain("cogCaptionY");
    expect(layout).toContain("HUD_COG_CAPTION_BOX.w");
    expect(layout).toContain("Phaser.Math.Clamp");
    expect(layout).toMatch(/setSignPosition\(this\.cogCaption, cogCaptionX, cogCaptionY\)/);
    expect(layout).not.toContain("setSignPosition(this.cogCaption, 0, 0)");
    const create = between(settings, "create(): void {", "\n  }", "settings create");
    expect(create).not.toMatch(/addSignText\([^,]+,\s*0,\s*0,\s*"Settings"/);
  });

  it("exposes signHostPosition so callers never read inner Text x/y for layout", () => {
    expect(sign).toContain("export function signHostPosition");
  });

  it("keeps the HUD scene camera at zoom 1 while world scenes use renderScale", () => {
    const sync = between(budget, "export function syncSceneRenderCamera(", "\n}", "syncSceneRenderCamera");
    expect(sync).toContain('scene.sys.settings.key === "hud" ? 1 : scale');
  });
});

describe("HUD placement geometry", () => {
  it("places counter readouts on the sign row, not screen corners or floor band", () => {
    expect(COUNTER_SIGN.y).toBeLessThan(840);
    expect(COUNTER_SIGN.y).toBeGreaterThan(700);
    expect(COUNTER_SIGN.y - 76).toBeGreaterThan(400);
    expect(COUNTER_SIGN.x).toBeGreaterThan(GAME_WIDTH * 0.3);
    expect(COUNTER_SIGN.x).toBeLessThan(GAME_WIDTH * 0.7);
    expect(COUNTER_SIGN.y).toBeLessThan(GAME_HEIGHT - 200);
  });

  it("FAILS if SCORE is placed at raw COUNTER_SIGN without projection anchors", () => {
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    expect(place).not.toMatch(
      /readoutsInShop[\s\S]*setPosition\(COUNTER_SIGN\.x,\s*COUNTER_SIGN\.y\)/,
    );
    expect(place).not.toContain("setPosition(0, 0)");
  });

  it("FAILS if settings caption is left at world origin without cog-relative layout", () => {
    const layout = between(settings, "layout(inset: SafeInset): void {", "\n  }", "settings layout");
    expect(layout).not.toMatch(/setSignPosition\(this\.cogCaption,\s*0,\s*0\)/);
    expect(layout).toContain("cogY - cogSize");
  });
});
