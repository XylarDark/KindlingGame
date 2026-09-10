import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  CUSTOMER_BUBBLE_MAX_X,
  CUSTOMER_BUBBLE_MIN_X,
  CUSTOMER_SPEECH_H,
  CUSTOMER_SPEECH_MIN_W,
  CUSTOMER_SLOT_PITCH,
  customerSlotX,
  customerSpeechShows,
  layoutCustomerSpeech,
} from "../maps/shopT0";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here, so a checkout delivers CRLF — normalise before matching. */
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const src = read("ShopScene.ts");

/**
 * Slice between two markers, throwing on a miss. A scan that quietly matches nothing is
 * the failure mode this repo has been bitten by, so every slice here has to land.
 */
function between(text: string, start: string, end: string, what: string): string {
  const from = text.indexOf(start);
  if (from === -1) throw new Error(`${what}: start marker not found: ${JSON.stringify(start)}`);
  const to = text.indexOf(end, from + start.length);
  if (to === -1) throw new Error(`${what}: end marker not found: ${JSON.stringify(end)}`);
  return text.slice(from, to);
}

describe("speech stays off the models it belongs to", () => {
  it("hangs a chip off its own rendered height, not a fixed centre offset", () => {
    const hang = between(src, "function hangAboveHead(", "\n}", "hangAboveHead");
    expect(hang, "reads the model's top edge").toMatch(/model\.getBounds\(\)\.y/);
    expect(hang, "subtracts the chip's own half-height").toMatch(/chip\.height \/ 2/);
    expect(hang, "leaves the standard daylight").toMatch(/CUSTOMER_SPEECH_GAP/);

    for (const speaker of ["keyLeadBubble", "driverBubble"]) {
      expect(src, `${speaker} is hung, not offset`).toMatch(
        new RegExp(`hangAboveHead\\(this\\.${speaker}`),
      );
    }
    expect(src, "no fixed head offsets left in sync").not.toMatch(/setPosition\([^)]*PERSON_DISPLAY_H - \d+\)/);
  });

  it("places customer chips beside settled speakers via layoutCustomerSpeech", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "uses side layout").toMatch(/layoutCustomerSpeech\(/);
    expect(sync, "gated while walking in").toMatch(/customerSpeechShows\(true\)/);
    expect(sync, "refits before positioning").toMatch(/fitTypeToBox\(bubble/);
    expect(sync, "anchors on layout centre").toMatch(/bubble\.setPosition\(layout\.x, layout\.y\)/);
    expect(sync, "no overhead band anchor").not.toMatch(/CUSTOMER_SPEECH_BASE/);
  });

  it("stacks customer-specific feedback under the ask, not as a centre banner", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "reads feedback field").toMatch(/customer\.feedback/);
    expect(sync, "feedback chip on visual").toMatch(/feedback\.setText\(note\)/);
  });
});

describe("side speech collision layout", () => {
  it("prefers the customer's right and flips left when the right side is blocked", () => {
    const alone = layoutCustomerSpeech([{ orderId: "a", x: customerSlotX(0) }]);
    expect(alone).toHaveLength(1);
    expect(alone[0]!.side).toBe("right");

    // Pack three settled customers — at least one stack must flip or clamp without overlap.
    const three = [0, 1, 2].map((slot) => ({ orderId: `c${slot}`, x: customerSlotX(slot) }));
    const boxes = layoutCustomerSpeech(three);
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!;
        const b = boxes[j]!;
        const overlap =
          a.x - a.w / 2 < b.x + b.w / 2 &&
          b.x - b.w / 2 < a.x + a.w / 2 &&
          a.y - a.h / 2 < b.y + b.h / 2 &&
          b.y - b.h / 2 < a.y + a.h / 2;
        expect(overlap, `chips ${a.orderId} and ${b.orderId}`).toBe(false);
      }
      expect(boxes[i]!.x - boxes[i]!.w / 2).toBeGreaterThanOrEqual(CUSTOMER_BUBBLE_MIN_X);
      expect(boxes[i]!.x + boxes[i]!.w / 2).toBeLessThanOrEqual(CUSTOMER_BUBBLE_MAX_X);
    }
    expect(boxes.some((b) => b.side === "left") || boxes.length < 3).toBe(true);
  });

  it("holds speech until the owner has settled", () => {
    expect(customerSpeechShows(false)).toBe(false);
    expect(customerSpeechShows(true)).toBe(true);
    expect(customerSpeechShows(false, CUSTOMER_SLOT_PITCH)).toBe(false);
  });

  it("keeps chip height within the side stack budget", () => {
    expect(CUSTOMER_SPEECH_H).toBeGreaterThanOrEqual(48);
    expect(CUSTOMER_SPEECH_MIN_W).toBeGreaterThanOrEqual(100);
  });
});
