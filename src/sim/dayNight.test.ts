import { describe, expect, it } from "vitest";
import { MS_PER_GAME_HOUR } from "./constants";
import { skyAt } from "./dayNight";

describe("skyAt", () => {
  it("is bright in the morning and dark at night", () => {
    const morning = skyAt(0);
    const noon = skyAt(3 * MS_PER_GAME_HOUR);
    const night = skyAt(13 * MS_PER_GAME_HOUR);
    expect(morning.sunAlpha).toBeGreaterThan(0.5);
    expect(morning.moonAlpha).toBeLessThan(0.1);
    expect(noon.sunAlpha).toBeGreaterThan(0.8);
    expect(night.moonAlpha).toBeGreaterThan(0.7);
    expect(night.sunAlpha).toBeLessThan(0.2);
    expect(night.starAlpha).toBeGreaterThan(0.5);
    expect(night.mapOverlayAlpha).toBeGreaterThan(morning.mapOverlayAlpha);
  });
});
