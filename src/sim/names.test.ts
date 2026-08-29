import { describe, expect, it } from "vitest";
import { generateNames } from "./names";

describe("generateNames", () => {
  it("returns unique names for a session catalog", () => {
    const names = generateNames(9, 42);
    expect(names).toHaveLength(9);
    expect(new Set(names).size).toBe(9);
  });

  it("is deterministic for a seed", () => {
    expect(generateNames(6, 7)).toEqual(generateNames(6, 7));
  });
});
