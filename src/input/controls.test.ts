import { describe, expect, it } from "vitest";
import { clampInput } from "./controls";

describe("clampInput", () => {
  it("keeps axis values in range and normalizes diagonals", () => {
    expect(clampInput(2, 0)).toEqual({ dx: 1, dy: 0 });
    const diag = clampInput(1, 1);
    expect(Math.hypot(diag.dx, diag.dy)).toBeCloseTo(1);
  });
});
