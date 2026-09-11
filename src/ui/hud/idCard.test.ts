import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  ID_CARD_W,
  ID_FIELD_ROW_STEP,
  ID_FIELD_VALUE_LEAD,
  ID_FIELD_X,
  ID_HEADER_CAP_MAX_W,
  ID_HEADER_SEAL_D,
  ID_HEADER_SEAL_GAP,
  ID_PAD,
} from "./constants";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("ID card header layout", () => {
  it("reserves a symmetric seal band so captions cannot overlap in the header", () => {
    const halfW = ID_CARD_W / 2;
    expect(ID_HEADER_CAP_MAX_W).toBe(halfW - ID_PAD - ID_HEADER_SEAL_D / 2 - ID_HEADER_SEAL_GAP);
    const leftMaxRight = -halfW + ID_PAD + ID_HEADER_CAP_MAX_W;
    const rightMinLeft = halfW - ID_PAD - ID_HEADER_CAP_MAX_W;
    expect(rightMinLeft - leftMaxRight).toBeGreaterThanOrEqual(ID_HEADER_SEAL_D + ID_HEADER_SEAL_GAP * 2);
  });

  it("anchors header captions to seal-aware maxWidth, not fractional card slices", () => {
    const src = read("idCard.ts");
    const create = src.slice(src.indexOf("create(): void {"), src.indexOf("paintIdCard("));
    expect(create).toContain("maxWidth: ID_HEADER_CAP_MAX_W");
    expect(create).not.toMatch(/maxWidth:\s*ID_CARD_W\s*\*\s*0\.[46]/);
    expect(create).toContain('setOrigin(0, 0.5)');
    expect(create).toMatch(/this\.idKind[\s\S]*setOrigin\(1,\s*0\.5\)/);
  });

  it("draws the provincial seal at the header centre in paintIdCard", () => {
    const src = read("idCard.ts");
    const paint = src.slice(src.indexOf("paintIdCard("), src.lastIndexOf("}"));
    expect(paint).toContain("ID_HEADER_SEAL_D");
    expect(paint).toContain("strokeCircle(0, sealY, sealR)");
  });
});

describe("ID card field alignment", () => {
  it("uses a shared left edge and top-origin rows for labels and values", () => {
    const src = read("idCard.ts");
    const create = src.slice(src.indexOf("create(): void {"), src.indexOf("paintIdCard("));
    expect(create).toContain("ID_FIELD_X");
    expect(create).toContain("ID_FIELD_ROW_STEP");
    expect(create).toContain("ID_FIELD_VALUE_LEAD");
    expect(create).toMatch(/label\.setPosition\(ID_FIELD_X,\s*y\)/);
    expect(create).toMatch(/value\.setPosition\(ID_FIELD_X,\s*y \+ ID_FIELD_VALUE_LEAD\)/);
    expect(create).not.toMatch(/value\.setPosition\(ID_FIELD_X,\s*y \+ 30\)/);
    for (const id of ["idName", "idDob", "idNumber", "idExpiry"]) {
      expect(create).toMatch(new RegExp(`this\\.${id}[\\s\\S]*?\\.setOrigin\\(0,\\s*0\\)`));
    }
    expect(create).toMatch(/labels[\s\S]*?\.setOrigin\(0,\s*0\)/);
    expect(create).not.toMatch(/idName[\s\S]*?setOrigin\(0,\s*0\.5\)/);
  });

  it("keeps the field column inside the card body with positive width", () => {
    expect(ID_FIELD_X).toBeLessThan(0);
    expect(ID_FIELD_ROW_STEP).toBeGreaterThan(ID_FIELD_VALUE_LEAD);
  });
});
