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
const slots = read("../ui/hud/slots.ts");
const placeChips = read("../ui/hud/placeChips.ts");

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
    expect(readoutLayout).toContain("setSignPlaqueCenter(this.coverText");
    expect(readoutLayout).not.toMatch(/this\.coverText\.setPosition\(/);
  });

  it("parents score pop pool hosts, not inner Text, so plaques do not orphan at (0,0)", () => {
    const warm = between(readouts, "warmScorePopPool(): void {", "\n  }", "warmScorePopPool");
    expect(warm).toContain("this.scorePopLayer.add(signContainer(label))");
    expect(warm).not.toMatch(/this\.scorePopLayer\.add\(label\)/);
  });

  it("tweens the score pop host so plaque and glyphs rise together", () => {
    const pop = between(readouts, "spawnScorePop(delta: number, screen?: { x: number; y: number }): void {", "\n  }", "spawnScorePop");
    expect(pop).toContain("signContainer(label)");
    expect(pop).toMatch(/targets: popHost/);
    expect(pop).not.toMatch(/targets: label/);
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

  it("does not create or layout a Settings caption plaque", () => {
    expect(settings).not.toContain("cogCaption");
    const layout = between(settings, "layout(inset: SafeInset): void {", "\n  }", "settings layout");
    expect(layout).not.toContain("cogCaption");
    const create = between(settings, "create(): void {", "\n  }", "settings create");
    expect(create).not.toMatch(/addSignText\([^,]+,\s*0,\s*0,\s*"Settings"/);
  });

  it("exposes signHostPosition so callers never read inner Text x/y for layout", () => {
    expect(sign).toContain("export function signHostPosition");
  });

  it("keeps the HUD scene camera at zoom 1 with scroll pinned to the live backbuffer", () => {
    const sync = between(budget, "export function syncSceneRenderCamera(", "\n}", "syncSceneRenderCamera");
    expect(sync).toMatch(
      /if \(scene\.sys\.settings\.key === "hud"\)[\s\S]*cam\.setScroll\(0, 0\)/,
    );
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

  it("FAILS if settings layout still references a caption host", () => {
    const layout = between(settings, "layout(inset: SafeInset): void {", "\n  }", "settings layout");
    expect(layout).not.toContain("cogCaption");
    expect(layout).toContain("cogY - cogSize");
  });
});

describe("HUD chip resolver wiring", () => {
  it("documents slot table and CHIP_GAP in slots.ts", () => {
    expect(slots).toContain("export const CHIP_GAP = 10");
    expect(slots).toContain("scoreClock");
    expect(slots).toContain("CHIP_PRIORITY");
  });

  it("resolves plaques once per frame from paintHud via resolveHudChips", () => {
    const paint = between(hud, "private paintHud(snap: SimSnapshot): void {", "private syncShopVisibility", "paintHud");
    expect(paint).toContain("resolveHudChips(");
    const resolve = between(hud, "private resolveHudChips(", "\n  }", "resolveHudChips");
    expect(resolve).toContain("beginChipFrame");
    expect(resolve).toContain("registerChipObstacle");
    expect(resolve).toMatch(/placeChip\([\s\S]*"toast"/);
    expect(placeChips).toContain("export function placeChip");
  });

  it("registers settings as cog-only before lower-priority chips", () => {
    expect(settings).toContain("registerChipObstacle");
    expect(settings).not.toContain("unionAabb");
  });

  it("places drive/door SCORE and clock together in the top-left safe slot", () => {
    const column = between(readouts, "layoutReadoutColumn(inset: SafeInset): void {", "\n  }", "layoutReadoutColumn");
    expect(column).toContain("SLOT_GUTTER");
    const place = between(readouts, "placeReadouts(): void {", "\n  }", "placeReadouts");
    expect(place).toMatch(/readoutsInShop[\s\S]*counterSignReadoutAnchors/);
    expect(place).toMatch(/this\.clockText\.setOrigin\(0, 0\.5\)\.setPosition\(clockX, top\)/);
    expect(place).not.toMatch(/this\.clockText\.setOrigin\(1, 0\.5\)\.setPosition\(right, top\)/);
  });

  it("caps cover width so it cannot reach the shop lot mark", () => {
    const cover = between(readouts, "coverMaxWidth(): number {", "\n  }", "coverMaxWidth");
    expect(cover).toContain("Math.min");
    expect(cover).toContain("columnCap");
    expect(cover).toContain("scoreCap");
    const resolve = between(readouts, "resolvePlaqueSlots(", "\n  }", "resolvePlaqueSlots");
    expect(resolve).toContain('placeChip(placer, "cover"');
  });
});
