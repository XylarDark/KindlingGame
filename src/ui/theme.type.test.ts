import { afterEach, describe, expect, it } from "vitest";
import { Type, TYPE_MIN_FIT_PX, MSG_SCALE, MOBILE_TEXT_SCALE, MOBILE_STAGE_SCALE_MAX, MSG_MIN_CSS_PX, HUD_CHROME_MIN_CSS_PX, MOBILE_MSG_PAD_EXTRA, designPxForMinCss, shouldApplyMobileTextRamp, effectiveMsgScale, effectiveChromeScale, scaleMsgBox, scaleMsgPad, scaleMsgPx, scaleChromePx, msgMinFitPx, chromeMinFitPx } from "./theme";
import { parseFontPx } from "./typeMetrics";
import { setStageContainScale } from "./viewFit";

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

describe("MSG_SCALE (desktop / full stage)", () => {
  afterEach(() => {
    setStageContainScale(1);
  });

  it("bumps message chips by about 25% when contain scale is 1", () => {
    setStageContainScale(1);
    expect(MSG_SCALE).toBeCloseTo(1.25, 6);
    expect(scaleMsgPx(20, 1, { coarsePointer: false })).toBe("25px");
    expect(scaleMsgPx(19.2, 1, { coarsePointer: false })).toBe("24px");
    expect(scaleMsgPad({ x: 12, y: 7 }, 1, { coarsePointer: false })).toEqual({ x: 15, y: 9 });
    expect(scaleMsgBox(66, 1, { coarsePointer: false })).toBe(83);
  });
});

describe("designPxForMinCss floors", () => {
  it("converts on-screen CSS floors into design px under contain scale", () => {
    // iPhone-ish contained stage ~693×390 → scale ≈ 0.361
    const scale = 693 / 1920;
    expect(designPxForMinCss(MSG_MIN_CSS_PX, scale)).toBe(Math.ceil(14 / scale));
    expect(designPxForMinCss(HUD_CHROME_MIN_CSS_PX, scale)).toBe(Math.ceil(12 / scale));
    expect(designPxForMinCss(14, 1)).toBe(14);
    expect(designPxForMinCss(14, 0)).toBe(14);
  });

  it("msgMinFitPx / chromeMinFitPx honor the contract", () => {
    const scale = 0.36;
    expect(msgMinFitPx(scale)).toBe(designPxForMinCss(MSG_MIN_CSS_PX, scale));
    expect(chromeMinFitPx(scale)).toBe(designPxForMinCss(HUD_CHROME_MIN_CSS_PX, scale));
    expect(msgMinFitPx(1)).toBeGreaterThanOrEqual(TYPE_MIN_FIT_PX);
  });
});

describe("mobile text ramp gating", () => {
  it("turns on below the stage-scale threshold", () => {
    expect(MOBILE_STAGE_SCALE_MAX).toBeCloseTo(0.6, 6);
    expect(shouldApplyMobileTextRamp(0.35)).toBe(true);
    expect(shouldApplyMobileTextRamp(0.59)).toBe(true);
    expect(shouldApplyMobileTextRamp(0.6)).toBe(false);
    expect(shouldApplyMobileTextRamp(1)).toBe(false);
  });

  it("also turns on for coarse pointer + narrow viewport", () => {
    expect(shouldApplyMobileTextRamp(0.7, { coarsePointer: true, viewportCssWidth: 844 })).toBe(true);
    expect(shouldApplyMobileTextRamp(0.7, { coarsePointer: true, viewportCssWidth: 1200 })).toBe(false);
    expect(shouldApplyMobileTextRamp(0.7, { coarsePointer: false, viewportCssWidth: 844 })).toBe(false);
  });

  it("stacks MOBILE_TEXT_SCALE on MSG_SCALE for messages and alone for chrome", () => {
    expect(MOBILE_TEXT_SCALE).toBeCloseTo(1.2, 6);
    expect(effectiveMsgScale(true)).toBeCloseTo(MSG_SCALE * MOBILE_TEXT_SCALE, 6);
    expect(effectiveMsgScale(false)).toBeCloseTo(MSG_SCALE, 6);
    expect(effectiveChromeScale(true)).toBeCloseTo(MOBILE_TEXT_SCALE, 6);
    expect(effectiveChromeScale(false)).toBe(1);
  });

  it("enforces CSS floors and extra chip padding under the ramp", () => {
    const scale = 0.36;
    const hints = { coarsePointer: true as const, viewportCssWidth: 800 };
    const msgPx = parseFontPx(scaleMsgPx(19.2, scale, hints));
    expect(msgPx).toBeGreaterThanOrEqual(designPxForMinCss(MSG_MIN_CSS_PX, scale));
    // On-screen size after contain
    expect(msgPx * scale).toBeGreaterThanOrEqual(MSG_MIN_CSS_PX - 0.05);

    const chromePx = parseFontPx(scaleChromePx(18, scale, hints));
    expect(chromePx * scale).toBeGreaterThanOrEqual(HUD_CHROME_MIN_CSS_PX - 0.05);

    const pad = scaleMsgPad({ x: 12, y: 7 }, scale, hints);
    const expectedFactor = MSG_SCALE * MOBILE_TEXT_SCALE * MOBILE_MSG_PAD_EXTRA;
    expect(pad).toEqual({
      x: Math.round(12 * expectedFactor),
      y: Math.round(7 * expectedFactor),
    });
  });

  it("does not oversize desktop stages", () => {
    const hints = { coarsePointer: false as const, viewportCssWidth: 1920 };
    expect(scaleMsgPx(20, 1, hints)).toBe("25px");
    expect(scaleChromePx(44, 1, hints)).toBe("44px");
  });
});
