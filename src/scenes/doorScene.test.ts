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
  it("seeds the prompt from the hudTitle role token with compact pads", () => {
    const box = between(src, "this.prompt = addSignText(", ".setOrigin(0.5, 0.5)", "prompt box");
    expect(box).toContain('typeRole: "hudTitle"');
    expect(box).toContain('typeRolePx("hudTitle")');
    expect(box).toContain('padVariant: "compact"');
    expect(box).toContain("DOOR_PROMPT_MAX_W");
    expect(box).toContain("DOOR_PROMPT_MAX_H");
    expect(box).toContain('typeRoleBox(DOOR_PROMPT_MAX_W, "hudTitle")');
    expect(box).toContain('typeRoleBox(DOOR_PROMPT_MAX_H, "hudTitle")');
  });

  it("uses setSignCopy so empty prompt copy never paints a plaque", () => {
    expect(src).toContain("setSignCopy(this.prompt");
  });

  it("resolves the prompt through placeChip after anchor geometry", () => {
    const fn = between(src, "private placePrompt(", "\n  }", "placePrompt");
    expect(fn).toContain("resolveDoorPrompt(x, y)");
    const resolve = between(src, "private resolveDoorPrompt(", "\n  }", "resolveDoorPrompt");
    expect(resolve).toContain("placeChip(placer, \"doorPrompt\"");
  });

  it("does not register the bag as a chip obstacle — it was displacing head prompts", () => {
    const resolve = between(src, "private resolveDoorPrompt(", "\n  }", "resolveDoorPrompt");
    expect(resolve).not.toContain('register("doorBag"');
    expect(resolve).toContain("placeChip(placer, \"doorPrompt\"");
  });

  it("clears the door prompt while the ID card carries confirm copy", () => {
    const sync = between(src, "const idInspect = drop.idAsked", "if (promptLine !== this.lastPrompt)", "idInspect prompt");
    expect(sync).toContain("idInspect");
    expect(sync).toMatch(/promptLine = idInspect\s*\?\s*""/);
  });

  it("pins the prompt above the customer head with headHang", () => {
    const fn = between(src, "private placePrompt(", "\n  }", "placePrompt");
    expect(fn).toContain("speechPlaqueAboveHead(this.prompt, this.customer.x, headTop, DOOR_CHIP_GAP)");
    expect(fn).toContain("modelHeadTop(this.customer)");
    expect(fn).toContain("this.customer.x");
    expect(fn).not.toContain("GAME_WIDTH / 2");
    expect(fn).not.toContain("this.insetTop + DOOR_CHIP_GAP");
    const resolve = between(src, "private resolveDoorPrompt(", "\n  }", "resolveDoorPrompt");
    expect(resolve).toMatch(/placeChip\([\s\S]*"doorPrompt"[\s\S]*true\)/);
  });

  it("does not follow bag or customer x each frame for prompt anchor", () => {
    const sync = between(src, "const who = drop.customerName", "if (promptLine !== this.lastPrompt)", "sync prompt anchor");
    expect(sync).not.toContain("promptAnchorX");
    expect(sync).not.toContain("promptAnchorY");
    expect(sync).not.toContain("bag.displayHeight");
  });

  it("keeps prompt chips compact with short copy", () => {
    expect(src).toContain("Photo — tap bag.");
    expect(src).not.toContain("Tap the bag in their hands");
    expect(constant("DOOR_PROMPT_MAX_W")).toBeGreaterThanOrEqual(280);
    expect(constant("DOOR_PROMPT_MAX_W")).toBeLessThanOrEqual(520);
  });

  it("uses a wide prompt box for hudTitle instruction copy", () => {
    expect(constant("DOOR_PROMPT_MAX_W")).toBeGreaterThanOrEqual(440);
    expect(constant("DOOR_CHIP_GAP")).toBe(36);
  });

  it("derives headTop through plaquePlacementPhaser", () => {
    expect(src).toContain('from "../ui/plaquePlacementPhaser"');
    expect(src).toContain("modelHeadTop(this.customer)");
  });
});

describe("doorstep bag caption", () => {
  it("is gone, along with everything that only existed to serve it", () => {
    // Removing the object but leaving its update code behind is the failure mode here:
    // a permanently hidden chip that still costs a setText and a placement every frame.
    for (const dead of [
      "bagCaption",
      "placeBagCaption",
      "DOOR_CAPTION_PX",
      "Tap bag to hand over",
      "Tap bag for photo",
    ]) {
      expect(src).not.toContain(dead);
    }
  });
});
