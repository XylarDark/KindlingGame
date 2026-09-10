import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("ShopScene session perf guards", () => {
  const src = read("ShopScene.ts");

  it("skips PostFX when the scene is inactive and throttles when active", () => {
    const block = src.slice(src.indexOf("private syncLighting"), src.indexOf("private sync(snap"));
    expect(block).toContain("if (!this.sys.isActive()) return");
    expect(block).not.toMatch(/playing && Math\.abs\(gameMs - this\.lastLightMs\)/);
    expect(block).toContain("if (Math.abs(gameMs - this.lastLightMs) < 80) return");
  });

  it("caps the customer visual pool instead of growing PRE_RENDER listeners", () => {
    expect(src).toContain("CUSTOMER_VISUAL_MAX");
    expect(src).toContain("if (this.customerPool.length < CUSTOMER_VISUAL_MAX)");
    expect(src).not.toContain("?? this.makeCustomerVisual()");
  });

  it("dirty-guards receipt rail redraw and target callout setText", () => {
    expect(src).toContain("lastReceiptKey");
    expect(src).toContain("if (railKey !== this.lastReceiptKey)");
    expect(src).toContain("if (this.targetCallout.text !== cue.text)");
  });

  it("removes PRE_RENDER lighting on SHUTDOWN", () => {
    expect(src).toContain("onPreRenderLighting");
    expect(src).toContain("Phaser.Scenes.Events.SHUTDOWN");
    expect(src).toContain("events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRenderLighting)");
  });

  it("dirty-guards bag rack texture and TV pulse redraws", () => {
    expect(src).toContain("lastTvKey");
    expect(src).toContain("if (this.bagRack.texture.key !== bagTex)");
  });
});
