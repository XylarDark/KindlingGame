import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
/** core.autocrlf is true here, so a checkout delivers CRLF — normalise before matching. */
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

const src = read("DoorScene.ts");

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

/** Read a numeric `const NAME = <number>` out of the source, or throw. */
function constant(name: string): number {
  const hit = new RegExp(`const ${name} = ([\\d.]+);`).exec(src);
  if (!hit) throw new Error(`constant not found: ${name}`);
  return Number(hit[1]);
}

/** Read a message px seed — lazy `name = () => scaleMsgPx(N)` or legacy const forms. */
function pxConstant(name: string): number {
  const lazy = new RegExp(`const ${name} = \\(\\): string => scaleMsgPx\\(([\\d.]+)\\);`).exec(src);
  if (lazy) return Number(lazy[1]) * 1.25;
  const scaled = new RegExp(`const ${name} = scaleMsgPx\\(([\\d.]+)\\);`).exec(src);
  if (scaled) return Number(scaled[1]) * 1.25;
  const hit = new RegExp(`const ${name} = "([\\d.]+)px";`).exec(src);
  if (!hit) throw new Error(`px constant not found: ${name}`);
  return Number(hit[1]);
}

describe("doorstep tap target flash", () => {
  it("throbs on a period a person can see, not a strobe", () => {
    // gameMs advances with kindlingClock fixed steps (HudScene ticks via advanceSimClock),
    // so sin(gameMs / RATE) has a real period of
    // 2*PI*RATE ms. Shrinking the rate is the one edit that would turn this into a
    // flicker while still looking like a working flash in the source.
    const periodMs = 2 * Math.PI * constant("DOOR_FLASH_RATE");
    expect(periodMs).toBeGreaterThan(800);
    expect(periodMs).toBeLessThan(2000);
  });

  it("drives the flash from game time so it freezes with a paused sim", () => {
    expect(src).toContain("doorFlashPhase(snap.gameMs)");
    expect(src).toContain("Math.sin(gameMs / DOOR_FLASH_RATE)");
  });

  it("animates the tint instead of holding one colour while the target is live", () => {
    // The bug this replaces: a constant Color.flash tint reads as a green bag, not as a
    // flashing one. The interpolation is the whole fix, so a reversion to a bare tint
    // must fail here.
    const lit = between(src, "if (nextHand || nextPhoto) {", "} else {", "bag flash branch");
    expect(lit).toContain("this.bag.setTint(doorFlashTint(flash));");
    expect(lit).not.toContain("setTint(Color.flash)");
  });

  it("keeps the bag opaque and carries the effect with a swell", () => {
    // A 0.7 alpha floor made the bag semi-transparent, which reads as unfinished art.
    const lit = between(src, "if (nextHand || nextPhoto) {", "} else {", "bag flash branch");
    expect(lit).toContain("this.bag.setAlpha(1);");
    expect(lit).not.toContain("setAlpha(pulse)");
    expect(lit).toContain("DOOR_FLASH_SWELL");

    const swell = constant("DOOR_FLASH_SWELL");
    expect(swell).toBeGreaterThan(0.05);
    expect(swell).toBeLessThan(0.25);
  });

  it("swings the flash in brightness, which is the only channel a green bag has", () => {
    // Color.flash is a near-white lime and a Phaser tint multiplies, so on a bag that is
    // already green a hue-only blend is very nearly a no-op — measured at roughly five
    // values per channel across the framebuffer. The dim factor is what makes the pulse
    // visible, so a value close to 1 would quietly restore the invisible version.
    expect(src).toContain("DOOR_FLASH_DIM + (1 - DOOR_FLASH_DIM) * phase");
    const dim = constant("DOOR_FLASH_DIM");
    expect(dim).toBeGreaterThan(0.2);
    expect(dim).toBeLessThan(0.7);
  });

  it("returns the bag to its authored scale when it is not the next target", () => {
    // Scale is set every frame while lit, so the un-lit branch has to put it back or the
    // bag keeps whatever size the last flashing frame left it at.
    const idle = between(src, "} else {\n      this.bag.setAlpha(1);", "if (nextAsk)", "bag idle branch");
    expect(idle).toContain("this.bag.setScale(DOOR_BAG_SCALE);");
    expect(idle).toContain("this.bag.clearTint();");
  });
});

describe("doorstep prompt", () => {
  it("seeds the prompt with the shared +25% message bump over 25px", () => {
    expect(pxConstant("doorPromptPx")).toBeCloseTo(31.25, 5);
  });

  it("seeds the house title 50% above the prior 33.75px base (then MSG_SCALE)", () => {
    expect(pxConstant("doorTitlePx")).toBeCloseTo(50.625 * 1.25, 5);
    const box = between(src, "this.houseLabel = addSignText(", ".setOrigin(0.5)", "house title box");
    expect(box).toContain("maxHeight: scaleMsgBox(108)");
    expect(box).toContain("maxWidth: scaleMsgBox(1200)");
  });

  it("lifts the prompt farther above the customer head", () => {
    expect(constant("DOOR_CHIP_GAP")).toBe(36);
  });

  it("grows the prompt's box with its font, because clamp-fit will drop a tight box", () => {
    // The trap: raise the seed and leave the box, and the text renders at the old size
    // while the constant claims otherwise — a change that looks done and does nothing.
    const box = between(src, "this.prompt = addSignText(", ".setOrigin(0.5, 1)", "prompt box");
    const height = /maxHeight: (?:scaleMsgBox\()?(\d+)/.exec(box);
    if (!height) throw new Error("prompt maxHeight not found");
    expect(Number(height[1]) * 1.25).toBeGreaterThanOrEqual(113 * 1.25);
    // Authored base must already clear the prior 113px floor before MSG_SCALE.
    expect(Number(height[1])).toBeGreaterThanOrEqual(113);
  });

  it("still floors the chip against the top safe inset", () => {
    // A taller chip pushes harder on this clamp; losing it puts the prompt under the
    // notch on a short viewport.
    const fn = between(src, "private placePrompt(", "\n  }", "placePrompt");
    expect(fn).toContain("this.insetTop + this.prompt.displayHeight + DOOR_CHIP_GAP");
    expect(fn).toContain("Math.max(floor,");
  });
});

describe("doorstep bag caption", () => {
  it("is gone, along with everything that only existed to serve it", () => {
    // Removing the object but leaving its update code behind is the failure mode here:
    // a permanently hidden chip that still costs a setText and a placement every frame.
    for (const dead of [
      "bagCaption",
      "placeBagCaption",
      "placeChips",
      "DOOR_CAPTION_PX",
      "Tap bag to hand over",
      "Tap bag for photo",
    ]) {
      expect(src).not.toContain(dead);
    }
  });
});
