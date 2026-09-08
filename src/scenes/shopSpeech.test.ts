import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

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
    // The trap this replaced: `y - PERSON_DISPLAY_H - 24` cleared a one-line callout and
    // put a two-line one across the key lead's hat, because a box grows downward from
    // its middle as copy wraps. Measuring the model and the chip is the only way it holds
    // for every length of line.
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

  it("bottom-anchors customer chips on the speech band", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    // Anchored by bottom edge: base line less half the height it actually rendered.
    expect(sync, "chip sits on the band's base line").toMatch(
      /CUSTOMER_SPEECH_BASE - bubble\.height \/ 2/,
    );
    expect(sync, "band caps the chip's height").toMatch(/CUSTOMER_SPEECH_H/);
  });

  it("refits the chip before it measures it", () => {
    // Width comes from the room the customer has, and the copy reflows into it. Measure
    // first and the position is computed off the previous customer's box.
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    const refit = sync.indexOf("fitTypeToBox(bubble");
    const measure = sync.indexOf("bubble.width");
    expect(refit, "chip is refitted").toBeGreaterThan(-1);
    expect(measure, "chip is measured").toBeGreaterThan(-1);
    expect(refit, "refit runs before the measurement").toBeLessThan(measure);
  });

  it("sizes and gates a chip on the nearest customer, not on the slot ladder", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "width from live room").toMatch(/customerSpeechWidth\(gap\)/);
    expect(sync, "gated while walking in").toMatch(/customerSpeechShows\(settled, gap\)/);
    const gap = between(src, "function nearestCustomerGap(", "\n}", "nearestCustomerGap");
    expect(gap, "measures against the other customers' x").toMatch(/Math\.abs\(other\.x - customer\.x\)/);
    expect(gap, "skips the customer themselves").toMatch(/other\.orderId === customer\.orderId/);
  });
});
