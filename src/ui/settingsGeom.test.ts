import { describe, expect, it } from "vitest";
import { containStage, stageContainScale } from "./viewFit";
import { POPULAR_MOBILE_LANDSCAPE } from "./viewFit";
import { SETTINGS_MAX_H, settingsGeom } from "./settingsGeom";

describe("settingsGeom", () => {
  it("keeps the panel inside the 1080 design canvas on popular contained scales", () => {
    for (const view of POPULAR_MOBILE_LANDSCAPE) {
      const { stage } = containStage(view);
      const scale = stageContainScale(stage);
      const box = settingsGeom(scale);
      expect(box.h).toBeLessThanOrEqual(SETTINGS_MAX_H);
      expect(box.rowH).toBeGreaterThanOrEqual(56);
      expect(box.btnH).toBeGreaterThanOrEqual(80);
    }
  });

  it("soft-caps rather than overflowing at a pathological tiny scale", () => {
    const box = settingsGeom(0.2);
    expect(box.h).toBeLessThanOrEqual(SETTINGS_MAX_H);
  });
});
