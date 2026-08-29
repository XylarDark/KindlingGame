import { BENCH, DRIVER, WINDOW, WINDOW_MID } from "../maps/shopT0";
import type { SkySample } from "../sim/dayNight";

/**
 * Shop lighting model (film / game three-point + one exterior):
 *
 * KEY  — ceiling pots. Warm tungsten (~2900K, gold/amber). Constant intensity
 *        day and night (practicals stay on). Shader keys are soft oval pools
 *        on the lobby/counter floor (wider sideways, not a horizontal slash).
 *        Painted wall wash stays on the cream wall separately.
 *
 * FILL — dim warm bounce from cream walls / oak. Not a full-frame orange grade.
 *        Exposure stops down at night so the same keys become visible pools.
 *
 * RIM  — faint D65 kick from the delivery window onto the driver/bench by day
 *        only. Local, not a global tint.
 *
 * SUN  — delivery WINDOW only. Soft area fill that comes *into* the room
 *        (offset off the glass, large oval). Not a disc in the pane, not shafts.
 *
 * MOON — same window, ~7000K cool, low intensity. Glow almost gone.
 *
 * DOOR — opaque Kindling hours sign. No sun, no glow spill, no outdoor light.
 *
 * Drive map still uses a stronger night grade; the shop does not.
 */
export const DAY_NIGHT_TUNE = {
  ambientDim: 0.85,
  shopAmbientDim: 1.6,
  ambientFloor: 0.34,
  driveAmbientFloor: 0.32,
  driveGradeBoost: 1.15,
  shopGradeScale: 0.16,
  potY: 918,
  potRadius: 380,
  potColor: 0xffd6a0,
  potIntensity: 0.42,
  potScaleX: 0.82,
  potScaleY: 1.12,
  daySpillGain: 0.44,
  nightSpillGain: 0.08,
  outdoorMin: 0.04,
  windowRadius: 820,
  windowXOffset: 240,
  windowYOffset: 70,
  windowScaleX: 0.7,
  windowScaleY: 0.96,
  dayGlowAlpha: 0.11,
  nightGlowAlpha: 0.03,
  rimColor: 0xc6d4ee,
  rimRadius: 160,
  rimIntensity: 0.14,
  rimMin: 0.18,
  lampColor: 0xffc070,
  lampRadius: 340,
  lampIntensityBase: 0.25,
  lampIntensityGain: 0.45,
  lampMin: 0.08,
};

export const MAX_LIGHTS = 8;

export type LightKind = "pot" | "window" | "rim" | "door" | "lamp";

export type ViewRect = { x: number; y: number; width: number; height: number };

export type PointLight = {
  kind: LightKind;
  x: number;
  y: number;
  color: number;
  radius: number;
  intensity: number;
  /** >1 tightens that axis; <1 elongates (shader multiplies the UV delta). */
  scaleX?: number;
  scaleY?: number;
};

export type GradeFrame = {
  tint: [number, number, number];
  gradeStrength: number;
  ambient: [number, number, number];
  ambientMul: number;
  lights: PointLight[];
};

export function rgb01(hex: number): [number, number, number] {
  return [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
}

function hexRgb(rgb: [number, number, number]): number {
  return (Math.round(rgb[0] * 255) << 16) | (Math.round(rgb[1] * 255) << 8) | Math.round(rgb[2] * 255);
}

export function worldToUv(x: number, y: number, view: ViewRect): { u: number; v: number } {
  return {
    u: (x - view.x) / Math.max(1, view.width),
    v: (y - view.y) / Math.max(1, view.height),
  };
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function lerp3(a: [number, number, number], b: [number, number, number], t: number): [number, number, number] {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}

/** Cream-wall bounce — warm, not sodium/orange. */
function shopAmbientColor(): [number, number, number] {
  return [1.0, 0.96, 0.9];
}

function ambientColor(sky: SkySample): [number, number, number] {
  const day: [number, number, number] = [1.02, 1.0, 0.96];
  const night: [number, number, number] = [0.62, 0.7, 0.92];
  return lerp3(day, night, clamp(sky.mapOverlayAlpha / 0.4, 0, 1));
}

function ambientMul(sky: SkySample, dim: number, floor: number): number {
  return clamp(1 - sky.mapOverlayAlpha * dim, floor, 1);
}

export function windowGlowLook(sky: SkySample): { color: number; alpha: number } {
  const spill = outdoorSpill(sky);
  const nightFade = 1 - clamp((sky.mapOverlayAlpha - 0.36) / 0.16, 0, 1) * 0.55;
  const alpha = clamp(
    sky.sunAlpha * DAY_NIGHT_TUNE.dayGlowAlpha + sky.moonAlpha * DAY_NIGHT_TUNE.nightGlowAlpha * nightFade,
    0,
    0.14,
  );
  return { color: spill.color, alpha };
}

function outdoorSpill(sky: SkySample): { color: number; intensity: number } {
  const day = sky.sunAlpha;
  const night = sky.moonAlpha;
  const intensity = day * DAY_NIGHT_TUNE.daySpillGain + night * DAY_NIGHT_TUNE.nightSpillGain;
  const sun = rgb01(sky.sunColor);
  const d65: [number, number, number] = [0.91, 0.94, 1.0];
  const moon: [number, number, number] = [0.75, 0.84, 1.0];
  const dusk = clamp(sky.mapOverlayAlpha / 0.18, 0, 1);
  const sunSky = lerp3(lerp3(sun, d65, 0.22), sun, dusk);
  const mix = day + night < 0.01 ? 0 : night / (day + night);
  return { color: hexRgb(lerp3(sunSky, moon, mix)), intensity };
}

function pushOutdoor(
  lights: PointLight[],
  kind: LightKind,
  x: number,
  y: number,
  radius: number,
  spill: { color: number; intensity: number },
  scale: number,
  scaleX: number,
  scaleY: number,
): void {
  if (spill.intensity * scale < DAY_NIGHT_TUNE.outdoorMin || lights.length >= MAX_LIGHTS) return;
  lights.push({
    kind,
    x,
    y,
    color: spill.color,
    radius,
    intensity: spill.intensity * scale,
    scaleX,
    scaleY,
  });
}

export function shopGrade(sky: SkySample, potXs: number[]): GradeFrame {
  const lights: PointLight[] = [];
  for (const x of potXs.slice(0, 5)) {
    lights.push({
      kind: "pot",
      x,
      y: DAY_NIGHT_TUNE.potY,
      color: DAY_NIGHT_TUNE.potColor,
      radius: DAY_NIGHT_TUNE.potRadius,
      intensity: DAY_NIGHT_TUNE.potIntensity,
      scaleX: DAY_NIGHT_TUNE.potScaleX,
      scaleY: DAY_NIGHT_TUNE.potScaleY,
    });
  }

  const spill = outdoorSpill(sky);
  pushOutdoor(
    lights,
    "window",
    WINDOW.x - DAY_NIGHT_TUNE.windowXOffset,
    WINDOW_MID + DAY_NIGHT_TUNE.windowYOffset,
    DAY_NIGHT_TUNE.windowRadius,
    spill,
    1,
    DAY_NIGHT_TUNE.windowScaleX,
    DAY_NIGHT_TUNE.windowScaleY,
  );

  if (sky.sunAlpha >= DAY_NIGHT_TUNE.rimMin && lights.length < MAX_LIGHTS) {
    lights.push({
      kind: "rim",
      x: DRIVER.x - 40,
      y: BENCH.y - 24,
      color: DAY_NIGHT_TUNE.rimColor,
      radius: DAY_NIGHT_TUNE.rimRadius,
      intensity: DAY_NIGHT_TUNE.rimIntensity * sky.sunAlpha,
      scaleX: 1.05,
      scaleY: 1.45,
    });
  }

  return {
    tint: rgb01(sky.mapOverlay),
    gradeStrength: sky.mapOverlayAlpha * DAY_NIGHT_TUNE.shopGradeScale,
    ambient: shopAmbientColor(),
    ambientMul: ambientMul(sky, DAY_NIGHT_TUNE.shopAmbientDim, DAY_NIGHT_TUNE.ambientFloor),
    lights,
  };
}

export function driveGrade(sky: SkySample, focus?: { x: number; y: number }): GradeFrame {
  const lights: PointLight[] = [];
  if (focus && sky.lampAlpha > DAY_NIGHT_TUNE.lampMin) {
    lights.push({
      kind: "lamp",
      x: focus.x,
      y: focus.y,
      color: DAY_NIGHT_TUNE.lampColor,
      radius: DAY_NIGHT_TUNE.lampRadius,
      intensity: DAY_NIGHT_TUNE.lampIntensityBase + DAY_NIGHT_TUNE.lampIntensityGain * sky.lampAlpha,
    });
  }
  return {
    tint: rgb01(sky.mapOverlay),
    gradeStrength: Math.min(0.72, sky.mapOverlayAlpha * DAY_NIGHT_TUNE.driveGradeBoost),
    ambient: ambientColor(sky),
    ambientMul: ambientMul(sky, DAY_NIGHT_TUNE.ambientDim, DAY_NIGHT_TUNE.driveAmbientFloor),
    lights,
  };
}
