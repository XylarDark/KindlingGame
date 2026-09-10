import { describe, expect, it } from "vitest";
import { MS_PER_GAME_HOUR } from "./constants";
import { skyAt, skyVisualDirtyKey } from "./dayNight";

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

describe("skyVisualDirtyKey", () => {
  it("changes when zenith or night glow inputs change", () => {
    const a = skyVisualDirtyKey(skyAt(0));
    const b = skyVisualDirtyKey(skyAt(13 * MS_PER_GAME_HOUR));
    expect(a).not.toBe(b);
    expect(skyVisualDirtyKey(skyAt(0))).toBe(a);
  });
});
