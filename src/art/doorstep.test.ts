import { describe, expect, it } from "vitest";
import { doorFacade, doorStyleFor } from "./doorstep";

describe("door facades", () => {
  it("picks a stable style per destination, not a new random look", () => {
    expect(doorStyleFor(0)).toBe(doorStyleFor(0));
    expect(doorStyleFor(1)).toBe(doorStyleFor(7));
    expect(doorFacade(0).style).not.toBe(doorFacade(1).style);
    expect(doorFacade(2).wall).not.toBe(doorFacade(3).wall);
  });

  it("covers the six map house silhouettes", () => {
    const styles = [0, 1, 2, 3, 4, 5].map(doorStyleFor);
    expect(new Set(styles).size).toBe(6);
  });
});
