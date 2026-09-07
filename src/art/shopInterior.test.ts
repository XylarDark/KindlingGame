import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "shopInterior.ts"), "utf8");

describe("shop type proportionality", () => {
  it("fits door, mat, and plaque marks to their host boxes", () => {
    expect(src).toContain("pane.w - inset * 2");
    expect(src).toContain("maxWidth: maxW");
    expect(src).toContain("maxHeight: Math.floor(pane.h * 0.4)");
    expect(src).toContain("maxWidth: w - 48");
    expect(src).toContain('size: "25px"');
    expect(src).toContain("maxWidth: plaqueW - 40");
    expect(src).not.toMatch(/addMark[\s\S]{0,200}setScale/);
  });

  it("paints circular floor pools after the boards, not a mid-wall slash", () => {
    expect(src).toContain("function potFloorPool");
    expect(src).toContain("for (const x of pots) potFloorPool(g, x)");
    expect(src).toMatch(/drawBoardFloor\(g\);\s*for \(const x of pots\) potFloorPool/);
    expect(src).not.toContain("inwardX");
    expect(src).toContain("g.clear()");
  });
});
