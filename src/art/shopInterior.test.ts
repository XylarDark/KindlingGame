import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { WINDOW } from "../maps/shopT0";

// Normalised to LF: git checks these files out with CRLF on Windows, which silently
// broke the newline-anchored scans below.
const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "shopInterior.ts"), "utf8").replace(
  /\r\n/g,
  "\n",
);

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

function constHex(name: string): number {
  const m = src.match(new RegExp(`const ${name} = (0x[0-9a-f]{6});`));
  if (!m) throw new Error(`missing const ${name}`);
  return Number(m[1]);
}

function rgb(n: number): [number, number, number] {
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** Top-level function bodies close with `}` in column 0. */
function fnBody(name: string): string {
  const start = src.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`missing function ${name}`);
  const rest = src.slice(start);
  const end = rest.indexOf("\n}\n");
  // Returning `rest` on a miss would scan every later function too, passing or
  // failing for reasons that have nothing to do with `name`.
  if (end < 0) throw new Error(`could not find the end of function ${name}`);
  return rest.slice(0, end);
}

describe("delivery window paint", () => {
  const pairs: [string, string][] = [
    ["WIN_PAINT", "PAINT"],
    ["WIN_PAINT_HI", "PAINT_HI"],
    ["WIN_PAINT_SHADE", "PAINT_SHADE"],
    ["WIN_PAINT_EDGE", "PAINT_EDGE"],
    ["WIN_JAMB", "JAMB"],
    ["WIN_JAMB_DARK", "JAMB_DARK"],
    ["WIN_JAMB_HI", "JAMB_HI"],
  ];

  it("sits a few shades cooler than the shared shop paint, not in a new palette", () => {
    for (const [win, base] of pairs) {
      const w = rgb(constHex(win));
      const b = rgb(constHex(base));
      const drift = Math.max(...w.map((c, i) => Math.abs(c - b[i]!)));
      expect(drift, `${win} vs ${base} is a distinct shade`).toBeGreaterThan(0);
      expect(drift, `${win} vs ${base} stays in the shop palette`).toBeLessThanOrEqual(16);
      expect(w[2]! - w[0]!, `${win} reads cooler than ${base}`).toBeGreaterThan(b[2]! - b[0]!);
    }
  });

  it("uses the WIN_ set for the window frame and the shared set everywhere else", () => {
    const frameFills = src
      .split("\n")
      .filter((l) => l.includes("fill(g, winLeft") || l.includes("fill(g, WINDOW.x"));
    expect(frameFills.length).toBeGreaterThan(10);
    for (const line of frameFills) {
      expect(line.trim()).not.toMatch(/\b(PAINT|PAINT_HI|PAINT_SHADE|PAINT_EDGE|JAMB|JAMB_DARK|JAMB_HI)\b/);
    }
    // Wall partition, chair rail and both doors keep the neutral greys.
    expect(src).toContain("fill(g, 0, CHAIR_RAIL_Y, GAME_WIDTH, CHAIR_RAIL_GREY_H, PAINT_EDGE)");
    expect(src).toContain("fill(g, COUNTER_LEFT, COUNTER_TOP, w, faceH, PAINT)");
    for (const fn of ["drawDoor", "drawPassWindow"]) {
      const body = fnBody(fn);
      expect(body, `${fn} keeps the shared paint`).toMatch(/\b(PAINT|PAINT_HI|JAMB)\b/);
      expect(body, `${fn} is not restyled`).not.toContain("WIN_");
    }
  });

  it("keeps the painted street wider than the glass it backs", () => {
    const streetW = Number(src.match(/const STREET_W = (\d+);/)?.[1]);
    // paintOutside centres a fixed-width street slice in the pane, so a pane that
    // outgrew the backdrop would show bare sky down both edges of the glass.
    expect(streetW).toBeGreaterThan(WINDOW.w);
  });

  it("slows shop-window passing cars so they read as ambient, not racing", () => {
    expect(src).toContain("SHOP_WINDOW_CAR_SLOWDOWN");
    expect(src).toMatch(/travel = car\.travel \* SHOP_WINDOW_CAR_SLOWDOWN/);
    const slowdown = Number(src.match(/const SHOP_WINDOW_CAR_SLOWDOWN = (\d+);/)?.[1]);
    expect(slowdown).toBeGreaterThanOrEqual(2);
  });
});
