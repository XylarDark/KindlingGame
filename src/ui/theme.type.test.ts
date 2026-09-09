import { describe, expect, it } from "vitest";
import { Type, TYPE_MIN_FIT_PX, MSG_SCALE, scaleMsgBox, scaleMsgPad, scaleMsgPx } from "./theme";
import { parseFontPx } from "./typeMetrics";

describe("Type scale", () => {
  it("keeps layout-first tokens at readable design sizes", () => {
    expect(parseFontPx(Type.display)).toBe(36);
    expect(parseFontPx(Type.title)).toBe(27);
    expect(parseFontPx(Type.heading)).toBe(20);
    expect(parseFontPx(Type.body)).toBe(16);
    expect(parseFontPx(Type.caption)).toBe(13);
    expect(parseFontPx(Type.micro)).toBe(11);
  });

  it("keeps shrink floor below caption so tight chrome can still fit", () => {
    expect(TYPE_MIN_FIT_PX).toBe(10);
    expect(TYPE_MIN_FIT_PX).toBeLessThan(parseFontPx(Type.caption));
  });
});

describe("MSG_SCALE", () => {
  it("bumps message chips by about 25%", () => {
    expect(MSG_SCALE).toBeCloseTo(1.25, 6);
    expect(scaleMsgPx(20)).toBe("25px");
    expect(scaleMsgPx(19.2)).toBe("24px");
    expect(scaleMsgPad({ x: 12, y: 7 })).toEqual({ x: 15, y: 9 });
    expect(scaleMsgBox(66)).toBe(83);
  });
});

