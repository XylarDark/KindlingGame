import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MSG_SCALE } from "./theme";
import {
  PAD_COMPACT,
  PAD_DEFAULT,
  TYPE_INTRO,
  TYPE_ROLE_COUNT,
  typeRoleBox,
  typeRolePx,
  typeClockPx,
  typeIntroPx,
} from "./typeScale";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const SCENE_PATHS = [
  "../scenes/HudScene.ts",
  "../scenes/DoorScene.ts",
  "../scenes/ShopScene.ts",
  "../scenes/TitleScene.ts",
  "../ui/hud/readouts.ts",
  "../ui/hud/settings.ts",
];

describe("typeScale tokens", () => {
  it("exposes exactly four HUD roles", () => {
    expect(TYPE_ROLE_COUNT).toBe(4);
    const src = read("./typeScale.ts");
    expect(src).toMatch(/hudTitle.*hudBody.*hudSmall.*speech/s);
    expect(src).not.toMatch(/"pin"/);
  });

  it("applies MSG_SCALE to message-tier roles once", () => {
    expect(typeRolePx("hudBody", 1, { coarsePointer: false })).toBe(`${20 * MSG_SCALE}px`);
    expect(typeRolePx("speech", 1, { coarsePointer: false })).toBe(`${Math.round(19.2 * MSG_SCALE * 10000) / 10000}px`);
    expect(typeRolePx("hudTitle", 1, { coarsePointer: false })).toBe("44px");
    expect(typeClockPx(1, { coarsePointer: false })).toBe("40px");
  });

  it("scales wrap boxes through typeRoleBox", () => {
    expect(typeRoleBox(900, "hudBody", 1, { coarsePointer: false })).toBe(Math.round(900 * MSG_SCALE));
  });

  it("exports pad variants for sign chips", () => {
    expect(PAD_DEFAULT).toEqual({ x: 27, y: 23 });
    expect(PAD_COMPACT).toEqual({ x: 23, y: 21 });
  });

  it("exports baked title intro sizes — not a multiplier on HUD roles", () => {
    expect(TYPE_INTRO.welcomeTitle).toBe(72.6);
    expect(typeIntroPx(TYPE_INTRO.howtoHeading)).toBe("40px");
  });
});

describe("scenes use typeScale, not stacked scaleMsgPx", () => {
  it("does not call scaleMsgPx or scaleChromePx in gameplay scenes", () => {
    for (const path of SCENE_PATHS) {
      const src = read(path);
      expect(src, path).not.toMatch(/\bscaleMsgPx\s*\(/);
      expect(src, path).not.toMatch(/\bscaleChromePx\s*\(/);
    }
  });
});
