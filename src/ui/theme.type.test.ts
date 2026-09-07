import { describe, expect, it } from "vitest";
import { Type, TYPE_MIN_FIT_PX } from "./theme";
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
