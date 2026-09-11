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
  it("hangs a chip off displayHeight/origin, not getBounds per frame", () => {
    const headTop = between(src, "function modelHeadTop(", "\n}", "modelHeadTop");
    expect(headTop, "derives top from origin and displayHeight").toMatch(/displayHeight \* model\.originY/);
    expect(headTop, "does not walk the display tree").not.toMatch(/getBounds/);

    const hang = between(src, "function hangAboveHead(", "\n}", "hangAboveHead");
    expect(hang, "uses modelHeadTop").toMatch(/modelHeadTop\(model\)/);
    expect(hang, "subtracts the chip's own half-height").toMatch(/chip\.height \/ 2/);
    expect(hang, "leaves the standard daylight").toMatch(/CUSTOMER_SPEECH_GAP/);
    expect(hang, "does not walk the display tree").not.toMatch(/getBounds/);

    for (const speaker of ["keyLeadBubble", "driverBubble"]) {
      expect(src, `${speaker} is hung, not offset`).toMatch(
        new RegExp(`hangAboveHead\\(this\\.${speaker}`),
      );
    }
    expect(src, "no fixed head offsets left in sync").not.toMatch(/setPosition\([^)]*PERSON_DISPLAY_H - \d+\)/);
    expect(src, "Shop sync never calls getBounds").not.toMatch(/getBounds\(\)/);
  });

  it("dirty-guards key-lead and driver bubble setText so fetch walk is not a refit every frame", () => {
    const sync = between(src, "private sync(snap: SimSnapshot)", "const packNext", "shop sync");
    expect(sync, "key-lead text guarded").toMatch(
      /const textDirty = this\.keyLeadBubble\.text !== callout[\s\S]*if \(textDirty\) this\.keyLeadBubble\.setText\(callout\)/,
    );
    expect(sync, "driver text guarded").toMatch(
      /const driverTextDirty = this\.driverBubble\.text !== driverLine[\s\S]*if \(driverTextDirty\) this\.driverBubble\.setText\(driverLine\)/,
    );
    expect(sync, "no unconditional key-lead setText").not.toMatch(/keyLeadBubble[\s\S]*?\.setText\(callout \?\? ""\)/);
    expect(sync, "hang key-lead only when shown").toMatch(/if \(showKeyLeadBubble\)/);
    expect(sync, "hang driver only when shown").toMatch(/if \(showDriverBubble\)/);
    expect(sync, "key-lead position quantized").toMatch(/Math\.round\(this\.keyLead\.x\) !== Math\.round\(kx\)/);
    expect(sync, "bubble X quantized").toMatch(/Math\.round\(this\.keyLeadBubble\.x\) !== Math\.round\(bx\)/);
    expect(sync, "bubble Y only when lead moved or copy changed").toMatch(/if \(textDirty \|\| leadMoved\)/);
    expect(sync, "driver bubble Y only when copy changes").toMatch(/if \(driverTextDirty\) hangAboveHead\(this\.driverBubble/);
  });

  it("draws lobby customers in front of the baked counter face", () => {
    const make = between(src, "private makeCustomerVisual(", "return { sprite, bubble, feedback", "makeCustomerVisual");
    expect(make, "customer sprite depth above counter RT (7)").toMatch(/\.setDepth\(8\)/);
    expect(make, "speech chips above the sprite").toMatch(/\.setDepth\(10\)/);
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "feet Y from measured displayHeight").toMatch(/customerFeetY\(sprite\.displayHeight\)/);
  });

  it("places customer chips beside settled speakers via layoutCustomerSpeech", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "uses side layout").toMatch(/layoutCustomerSpeech\(/);
    expect(sync, "gated while walking in").toMatch(/customerSpeechShows\(true\)/);
    expect(sync, "anchors on layout centre via host").toMatch(/setSignPosition\(bubble, layout\.x, layout\.y\)/);
    expect(sync, "no overhead band anchor").not.toMatch(/CUSTOMER_SPEECH_BASE/);
  });

  it("stacks customer-specific feedback under the ask, not as a centre banner", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "reads feedback field").toMatch(/customer\.feedback/);
    expect(sync, "feedback chip on visual").toMatch(/feedback\.setText\(note\)/);
  });

  it("dirty-guards customer bubble setText, applyPersonTexture, and speech layout", () => {
    const sync = between(src, "private syncCustomers(", "private makeHotspots(", "syncCustomers");
    expect(sync, "layout keyed on order id + quantized x").toContain("lastCustomerLayoutKey");
    expect(sync, "layout keyed on order id + quantized x").toContain("Math.round(c.x)");
    expect(sync, "bubble setText guarded").toMatch(/if \(bubble\.text !== customer\.bubble\) bubble\.setText/);
    const make = between(src, "private makeCustomerVisual(", "return { sprite, bubble, feedback", "makeCustomerVisual");
    expect(make, "fixed speech token at build").toMatch(/typeRole: "speech"/);
    expect(sync, "look guarded before applyPersonTexture").toMatch(
      /if \(visual\.look !== customer\.look\)[\s\S]*applyPersonTexture\(visual\.sprite, customer\.look\)/,
    );
    expect(sync, "pulse/tint only when focused").toMatch(/if \(focus\)[\s\S]*setTint\(Color\.flash\)/);
    expect(sync, "hide bubble with setVisible").toMatch(/bubble\.setVisible\(false\)/);
    expect(sync, "no unconditional applyPersonTexture in else branch").not.toMatch(
      /\} else \{\s*applyPersonTexture/,
    );
  });

  it("shop sync hot path never rebakes typekit or render scale", () => {
    const sync = between(src, "private sync(snap: SimSnapshot)", "const packNext", "shop sync");
    expect(sync).not.toContain("bakeStaticShop");
    expect(sync).not.toContain("applyRenderScale");
    expect(sync).not.toContain("refreshTypekit");
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

describe("shop hot-path dirty guards", () => {
  it("indexes catalog once for TV fills and dirty-guards tablet Graphics", () => {
    expect(src).toContain("skuById");
    expect(src).toContain("this.skuById.get(skuId)");
    expect(src).not.toMatch(/catalog\.find\(\(s\) => s\.id === this\.jarSkus/);
    expect(src).toContain("lastTabletKey");
    expect(src).toContain("if (tabletKey !== this.lastTabletKey)");
  });

  it("never snapshots on pointerdown — tablet ticket id comes from sync", () => {
    expect(src).toContain("tabletTicketId");
    expect(src).toContain("this.tabletTicketId = snap.tabletTicket?.id");
    const pointerBlocks = src.match(/\.on\("pointerdown"[^)]*\)[^{]*\{[^}]+\}/g) ?? [];
    expect(pointerBlocks.length).toBeGreaterThan(0);
    for (const block of pointerBlocks) {
      expect(block, block).not.toContain("snapshot(");
    }
  });

  it("shop hotspot handlers stay dumb — no layout, bake, typekit, or budget on the click stack", () => {
    const handlers = between(src, "private wireShopTap(", "private makeHotspots(", "wireShopTap callers");
    expect(handlers).toContain("ackTap");
    expect(handlers).not.toMatch(/fitTypeToBox|bakeStaticShop|refreshTypekit|applyRenderScale/);
    const hotspots = between(src, "private makeHotspots(", "\n}\n", "makeHotspots");
    expect(hotspots).not.toMatch(/fitTypeToBox|bakeStaticShop|refreshTypekit|applyRenderScale/);
    const customerHit = between(src, "private makeCustomerVisual(", "wireHover(sprite);", "customer pointer");
    expect(customerHit).not.toMatch(/fitTypeToBox|bakeStaticShop|refreshTypekit|applyRenderScale/);
  });
});
