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
} from "../maps/shopT0";
import { GAME_WIDTH } from "../sim/constants";
import { GameSim } from "../sim/gameSim";
import type { ChipPlaqueExtents } from "./hud/chipCollision";
import {
  aboveHead,
  assertPlacement,
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

  it("aboveHead passes for key-lead slot geometry centered on KEYLEAD", () => {
    const headTop = keyLeadSlotHeadTop();
    const plaque = mockSpeechPlaque(320, 48);
    const center = speechPlaqueCenterAboveHead(plaque, KEYLEAD.x, headTop, CUSTOMER_SPEECH_GAP);
    const aabb = plaqueAabbFromCenter(center.x, center.y, plaque);
    expect(center.x).toBe(KEYLEAD.x);
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

  it("shop-holding speech sits above KEYLEAD slot head center", () => {
    const sim = GameSim.create({ seed: 2, autoSpawn: false });
    vi.stubGlobal("location", { search: "?capture=shop-holding" });
    applyCaptureSeed(sim);

    const headTop = keyLeadSlotHeadTop();
    for (const panelH of [40, 48, 56, 64]) {
      const plaque = mockSpeechPlaque(360, panelH);
      const center = speechPlaqueCenterAboveHead(plaque, KEYLEAD.x, headTop, CUSTOMER_SPEECH_GAP);
      const aabb = plaqueAabbFromCenter(center.x, center.y, plaque);
      assertPlacement(aboveHead(aabb, headTop, CUSTOMER_SPEECH_GAP), `panelH=${panelH}`);
      expect(center.x).toBe(KEYLEAD.x);
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
  const DOOR_HEAD_GAP = 48;
  const CUSTOMER_X = 960 + 200;
  const headTop = 720;

  it("preferred door prompt center sits above the customer head", () => {
    const plaque = mockSpeechPlaque(440, 88);
    const center = speechPlaqueCenterAboveHead(plaque, CUSTOMER_X, headTop, DOOR_HEAD_GAP);
    const aabb = plaqueAabbFromCenter(center.x, center.y, plaque);
    assertPlacement(aboveHead(aabb, headTop, DOOR_HEAD_GAP), "door prompt");
  });

  it("door scene still resolves through placeChip after anchor geometry", () => {
    expect(doorSrc).toContain("resolveDoorPrompt(x, preferred.y)");
    expect(doorSrc).toContain('placeChip(placer, "doorPrompt"');
    expect(doorSrc).toContain("speechPlaqueAboveHead");
  });

  it("door orange status resolves top-center for the whole atDoor visit", () => {
    const margin = 12;
    const plaque = mockSpeechPlaque(520, 48);
    const centerY = margin + plaque.panelH / 2;
    const aabb = plaqueAabbFromCenter(GAME_WIDTH / 2, centerY, plaque);
    assertPlacement(topCenter(aabb, GAME_WIDTH, 0, margin), "door status");
    expect(readoutsSrc).toContain("atDoor && this.doorTitleText.visible");
    expect(readoutsSrc).toMatch(/let centerX = placer\.viewW \/ 2/);
    expect(readoutsSrc).toContain("paintDoorTitle");
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

  it("imports leadSpeechPlaqueCenter from plaquePlacementPhaser", () => {
    expect(shopSrc).toContain('from "../ui/plaquePlacementPhaser"');
    expect(shopSrc).toContain("speechPlaqueAboveHead(");
    expect(shopSrc).toContain("keyLeadSlotHeadTop()");
    expect(shopSrc).not.toMatch(/function leadSpeechPlaqueCenter\(/);
  });
});
