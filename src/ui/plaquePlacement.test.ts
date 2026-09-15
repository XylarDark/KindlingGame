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
  SHOP_KEY_LEAD_BAND_HEAD_BIAS,
  SHOP_KEY_LEAD_SPEECH_GAP,
  layoutCustomerSpeech,
  PERSON_DISPLAY_MAX_H,
  TV_VISIBLE_BOTTOM,
} from "../maps/shopT0";
import { GAME_WIDTH } from "../sim/constants";
import { GameSim } from "../sim/gameSim";
import type { ChipPlaqueExtents } from "./hud/chipCollision";
import {
  aboveHead,
  assertPlacement,
  doorPromptPlaqueCenter,
  overlapsObstacle,
  leadSpeechPlaqueCenterFromExtents,
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

  it("key-lead slot geometry biases band midpoint toward the hat", () => {
    const headTop = keyLeadSlotHeadTop();
    const tvBottom = TV_VISIBLE_BOTTOM;
    const gap = SHOP_KEY_LEAD_SPEECH_GAP;
    const bias = SHOP_KEY_LEAD_BAND_HEAD_BIAS;
    const plaque = mockSpeechPlaque(320, 48);
    const minCenterY = tvBottom + gap + plaque.panelH / 2;
    const maxCenterY = headTop - gap - plaque.panelH / 2;
    const mid = (minCenterY + maxCenterY) / 2;
    const center = leadSpeechPlaqueCenterFromExtents(plaque, KEYLEAD.x, headTop, tvBottom, gap, bias);
    expect(center.x).toBe(KEYLEAD.x);
    expect(center.y).toBeCloseTo(mid + (maxCenterY - mid) * bias, 0);
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

  it("shop-holding key-lead speech biases mid-band toward the hat", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    vi.stubGlobal("location", { search: "?capture=shop-holding" });
    applyCaptureSeed(sim);

    const headTop = keyLeadSlotHeadTop();
    const tvBottom = TV_VISIBLE_BOTTOM;
    const gap = SHOP_KEY_LEAD_SPEECH_GAP;
    const bias = SHOP_KEY_LEAD_BAND_HEAD_BIAS;
    for (const panelH of [40, 48, 56, 64]) {
      const plaque = mockSpeechPlaque(360, panelH);
      const minCenterY = tvBottom + gap + panelH / 2;
      const maxCenterY = headTop - gap - panelH / 2;
      const mid = (minCenterY + maxCenterY) / 2;
      const center = leadSpeechPlaqueCenterFromExtents(plaque, KEYLEAD.x, headTop, tvBottom, gap, bias);
      expect(center.x).toBe(KEYLEAD.x);
      expect(center.y, `panelH=${panelH}`).toBeCloseTo(mid + (maxCenterY - mid) * bias, 0);
    }
    expect(sim.snapshot().keyLeadLine).toMatch(/Holding/);
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
  const readoutsSrc = readScene("../ui/hud/readouts.ts");
  const DOOR_HEAD_GAP = 60;
  const CUSTOMER_X = 960 + 200;
  /** Door floor feet + 8 — matches DoorScene floorY seed. */
  const DOOR_FLOOR_Y = 838;
  const headTop = DOOR_FLOOR_Y - 335;

  it("preferred door prompt center sits above the customer head", () => {
    const plaque = mockSpeechPlaque(440, 88);
    const center = doorPromptPlaqueCenter(plaque, CUSTOMER_X, headTop, DOOR_HEAD_GAP);
    const aabb = plaqueAabbFromCenter(center.x, center.y, plaque);
    assertPlacement(aboveHead(aabb, headTop, DOOR_HEAD_GAP), "door prompt");
    expect(aabb.bottom).toBeLessThanOrEqual(headTop - DOOR_HEAD_GAP + 1);
  });

  it("Tap Ren Park for ID lands centered on customer x with head clearance", () => {
    const plaque = mockSpeechPlaque(480, 92);
    const center = doorPromptPlaqueCenter(plaque, CUSTOMER_X, headTop, DOOR_HEAD_GAP);
    const aabb = plaqueAabbFromCenter(center.x, center.y, plaque);
    expect(Math.abs(center.x - CUSTOMER_X)).toBeLessThan(2);
    expect(aabb.bottom).toBeLessThanOrEqual(headTop - DOOR_HEAD_GAP + 1);
  });

  it("door scene centers prompt on customer x above head via setSignPlaqueCenter", () => {
    expect(doorSrc).toContain("setSignPlaqueCenter(this.prompt, this.customer.x");
    expect(doorSrc).toContain("headTop - DOOR_HEAD_GAP - ext.panelH / 2");
    expect(doorSrc).toContain("host.setScrollFactor(1, 1)");
    expect(doorSrc).not.toContain("speechPlaqueAboveHead");
    expect(doorSrc).not.toContain("clampDoorPromptX");
    expect(doorSrc).not.toContain("promptAnchor");
  });

  it("door prompt plaque stays disjoint from the bag hit target during hand and photo steps", () => {
    const DOOR_HEAD_GAP = 30;
    const BAG_HIT_PAD = 88;
    const DOOR_BAG_SCALE = 0.7 * 1.25;
    const BAG_TEX_H = 120;
    const CUSTOMER_X = 960 + 200;
    const floorY = 838;
    const headTop = floorY - 307;
    const bagY = floorY - 307 * 0.42;
    const bagDisplayH = BAG_TEX_H * DOOR_BAG_SCALE;
    const bagTop = bagY - bagDisplayH * (1 - 0.22) - BAG_HIT_PAD;
    const bagLeft = CUSTOMER_X - 44 - 48 * DOOR_BAG_SCALE - BAG_HIT_PAD;
    const bagRight = CUSTOMER_X - 44 + 48 * DOOR_BAG_SCALE + BAG_HIT_PAD;
    const bagBottom = bagY + bagDisplayH * 0.22 + BAG_HIT_PAD;
    const bagAabb = { left: bagLeft, top: bagTop, right: bagRight, bottom: bagBottom };

    for (const line of ["Tap bag → Ren.", "Photo — tap bag."] as const) {
      const plaque = mockSpeechPlaque(line.length > 16 ? 480 : 440, 88);
      const center = doorPromptPlaqueCenter(plaque, CUSTOMER_X, headTop, DOOR_HEAD_GAP);
      const promptAabb = plaqueAabbFromCenter(center.x, center.y, plaque);
      assertPlacement(overlapsObstacle(promptAabb, bagAabb), `prompt "${line}" vs bag`);
      expect(promptAabb.bottom).toBeLessThan(bagAabb.top);
    }
  });

  it("door orange status sits inline with the score row and top-center on x", () => {
    const rowY = 28;
    const plaque = mockSpeechPlaque(520, 48);
    const aabb = plaqueAabbFromCenter(GAME_WIDTH / 2, rowY, plaque);
    expect(aabb.top).toBeLessThan(rowY);
    expect(aabb.bottom).toBeGreaterThan(rowY);
    expect(topCenter(aabb, GAME_WIDTH, 0, 0).ok).toBe(true);
    expect(readoutsSrc).toContain("atDoor && this.doorTitleText.visible");
    expect(readoutsSrc).toMatch(/const centerY = this\.readoutCorner\.top/);
    expect(readoutsSrc).not.toMatch(/readoutCorner\.top \+ SLOT_GUTTER \+ plaque\.panelH/);
    expect(readoutsSrc).toMatch(/let centerX = placer\.viewW \/ 2/);
    expect(readoutsSrc).toContain("setSignAccent(this.doorTitleText, Color.danger)");
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

});

describe("shop scene uses exported placement helpers", () => {
  const shopSrc = readScene("../scenes/ShopScene.ts");
  const placementSrc = readScene("../ui/plaquePlacementPhaser.ts");

  it("imports speech placement helpers from plaquePlacementPhaser", () => {
    expect(shopSrc).toContain('from "../ui/plaquePlacementPhaser"');
    expect(shopSrc).toContain("keyLeadSpeechPlaqueAboveHead(");
    expect(shopSrc).toContain("modelHeadTop(this.keyLead)");
    expect(shopSrc).toContain("speechPlaqueAboveHead(");
    expect(placementSrc).toContain("keyLeadSpeechPlaqueAboveHead(");
    expect(placementSrc).toContain("leadSpeechPlaqueCenter(");
    expect(placementSrc).toContain("TV_VISIBLE_BOTTOM");
    expect(placementSrc).toContain("SHOP_KEY_LEAD_SPEECH_GAP");
  });
});
