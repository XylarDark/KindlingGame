import { describe, expect, it } from "vitest";
import { textResolution } from "./textResolution";

describe("textResolution", () => {
  it("uses a dense backing resolution in node tests", () => {
    expect(textResolution()).toBeGreaterThanOrEqual(2);
  });
});
