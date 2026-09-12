import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import { applyCaptureSeed } from "../promoShot";
import {
  CUSTOMER_BUBBLE_MAX_X,
  CUSTOMER_BUBBLE_MIN_X,
  CUSTOMER_SPEECH_GAP,
  CUSTOMER_SPEECH_H,
  CUSTOMER_SPOT,
  customerSlotX,
  customerSpeechCenterY,
  KEYLEAD,
  keyLeadSlotHeadTop,
  layoutCustomerSpeech,
  PERSON_DISPLAY_MAX_H,
  TV_GRID_TOP,
  TV_H,
} from "../maps/shopT0";
import { GAME_WIDTH } from "../sim/constants";
import { GameSim } from "../sim/gameSim";
import type { ChipPlaqueExtents } from "./hud/chipCollision";
import {
  aboveHead,
  assertPlacement,
  inHeadTvBandPlaque,
  leadSpeechPlaqueCenterFromExtents,
  overlapsObstacle,
  plaqueAabbFromCenter,
  speechPlaqueCenterAboveHead,
  topCenter,
  topCenterY,
} from "./plaquePlacement";

const here = dirname(fileURLToPath(import.meta.url));
const readScene = (rel: string): string =>
  readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

/** Symmetric speech plaque — matches centered sign chips in shop tests. */
function mockSpeechPlaque(w: number, h: number = CUSTOMER_SPEECH_H): ChipPlaqueExtents {
  return {
    panelW: w,
    panelH: h,
    leftLocal: -w / 2,
    rightLocal: w / 2,
    topLocal: -h / 2,
    bottomLocal: h / 2,
  };
}

describe("plaque placement contract helpers", () => {
  it("aboveHead passes when plaque bottom clears the head line", () => {
    const headTop = 600;
    const gap = CUSTOMER_SPEECH_GAP;
    const plaque = mockSpeechPlaque(220, 52);
    const center = speechPlaqueCenterAboveHead(plaque, 960, headTop, gap);
    const aabb = plaqueAabbFromCenter(center.x, center.y, plaque);
    expect(aboveHead(aabb, headTop, gap).ok).toBe(true);
  });

  it("aboveHead fails when plaque sits on the face", () => {
    const headTop = 600;
    const gap = CUSTOMER_SPEECH_GAP;
    const aabb = { left: 900, top: headTop - 10, right: 1020, bottom: headTop + 20 };
    expect(aboveHead(aabb, headTop, gap).ok).toBe(false);
  });

  it("inHeadTvBand passes for key-lead slot geometry", () => {
    const headTop = keyLeadSlotHeadTop();
    const tvBottom = TV_GRID_TOP + TV_H;
    const plaque = mockSpeechPlaque(280, 48);
    const center = leadSpeechPlaqueCenterFromExtents(plaque, KEYLEAD.x, headTop, tvBottom, CUSTOMER_SPEECH_GAP);
    const aabb = plaqueAabbFromCenter(center.x, center.y, plaque);
    expect(inHeadTvBandPlaque(aabb, headTop, tvBottom, CUSTOMER_SPEECH_GAP).ok).toBe(true);
    assertPlacement(aboveHead(aabb, headTop, CUSTOMER_SPEECH_GAP), "key-lead above slot head");
  });

  it("topCenter passes for HUD instruction geometry at inset 0", () => {
    const margin = 12;
    const plaque = mockSpeechPlaque(420, 56);
    const centerY = topCenterY(0, margin, plaque.panelH);
    const aabb = plaqueAabbFromCenter(GAME_WIDTH / 2, centerY, plaque);
    expect(topCenter(aabb, GAME_WIDTH, 0, margin).ok).toBe(true);
  });

  it("overlapsObstacle fails when plaque covers a face AABB", () => {
    const face = { left: 900, top: 700, right: 1020, bottom: 860 };
    const speech = { left: 910, top: 720, right: 1010, bottom: 780 };
    expect(overlapsObstacle(speech, face, 0).ok).toBe(false);
  });
});

describe("shop capture seed geometry", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("shop-lead speech lands in KEYLEAD slot head↔TV band", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    vi.stubGlobal("location", { search: "?capture=shop-lead" });
    applyCaptureSeed(sim);

    const headTop = keyLeadSlotHeadTop();
    const tvBottom = TV_GRID_TOP + TV_H;
    for (const panelH of [40, 48, 56, 64]) {
      const plaque = mockSpeechPlaque(260, panelH);
      const center = leadSpeechPlaqueCenterFromExtents(plaque, KEYLEAD.x, headTop, tvBottom, CUSTOMER_SPEECH_GAP);
      const aabb = plaqueAabbFromCenter(center.x, center.y, plaque);
      assertPlacement(inHeadTvBandPlaque(aabb, headTop, tvBottom, CUSTOMER_SPEECH_GAP), `panelH=${panelH}`);
      expect(center.x).toBe(KEYLEAD.x);
    }
  });

  it("shop-counter customer order sits above head, not on torso", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    vi.stubGlobal("location", { search: "?capture=shop-counter" });
    applyCaptureSeed(sim);

    const headTop = CUSTOMER_SPOT.y - PERSON_DISPLAY_MAX_H;
    const boxes = layoutCustomerSpeech([{ orderId: "seed", x: customerSlotX(0), h: CUSTOMER_SPEECH_H }]);
    expect(boxes).toHaveLength(1);
    const box = boxes[0]!;
    const plaque = mockSpeechPlaque(box.w, box.h);
    const aabb = plaqueAabbFromCenter(box.x, box.y, plaque);
    assertPlacement(aboveHead(aabb, headTop, CUSTOMER_SPEECH_GAP), "customer order");
    expect(box.x).toBeGreaterThanOrEqual(CUSTOMER_BUBBLE_MIN_X + box.w / 2);
    expect(box.x).toBeLessThanOrEqual(CUSTOMER_BUBBLE_MAX_X - box.w / 2);
    expect(box.y).toBe(customerSpeechCenterY(headTop, box.h));
  });
});

describe("door prompt placement contract", () => {
  const doorSrc = readScene("../scenes/DoorScene.ts");
  const DOOR_CHIP_GAP = 36;
  const insetTop = 0;

  it("preferred door prompt center matches top-center band math", () => {
    const plaque = mockSpeechPlaque(440, 72);
    const preferredY = insetTop + DOOR_CHIP_GAP + plaque.panelH / 2;
    const aabb = plaqueAabbFromCenter(GAME_WIDTH / 2, preferredY, plaque);
    assertPlacement(topCenter(aabb, GAME_WIDTH, insetTop, DOOR_CHIP_GAP), "door prompt");
  });

  it("door scene still resolves through placeChip after anchor geometry", () => {
    expect(doorSrc).toContain("resolveDoorPrompt(x, y)");
    expect(doorSrc).toContain('placeChip(placer, "doorPrompt"');
  });
});

describe("HUD toast / instruction top-center", () => {
  const hudSrc = readScene("../scenes/HudScene.ts");
  const SCREEN_CHIP_MARGIN = 12;
  const insetTop = 0;

  it("toast preferred Y matches topCenter band at zoom 1", () => {
    const plaque = mockSpeechPlaque(500, 48);
    const toastY = insetTop + SCREEN_CHIP_MARGIN + plaque.panelH / 2;
    const aabb = plaqueAabbFromCenter(GAME_WIDTH / 2, toastY, plaque);
    assertPlacement(topCenter(aabb, GAME_WIDTH, insetTop, SCREEN_CHIP_MARGIN), "toast");
  });

  it("HudScene wires toast through placeChip at top-center", () => {
    expect(hudSrc).toContain('placeChip(placer, "toast"');
    expect(hudSrc).toContain("inset.top + SCREEN_CHIP_MARGIN + toastPlaque.panelH / 2");
  });

  // TODO: when door orange-status always-on chip lands, assert its band here (topCenter + no face overlap).
});

describe("shop scene uses exported placement helpers", () => {
  const shopSrc = readScene("../scenes/ShopScene.ts");

  it("imports leadSpeechPlaqueCenter from plaquePlacementPhaser", () => {
    expect(shopSrc).toContain('from "../ui/plaquePlacementPhaser"');
    expect(shopSrc).toContain("leadSpeechPlaqueCenter(");
    expect(shopSrc).toContain("keyLeadSlotHeadTop()");
    expect(shopSrc).not.toMatch(/function leadSpeechPlaqueCenter\(/);
  });
});
