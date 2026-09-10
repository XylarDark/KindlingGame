import type { SkySample } from "../sim/dayNight";

/**
 * Shop lighting model (film / game three-point):
 *
 * KEY  — ceiling pots. Warm tungsten (~2900K, gold/amber). Practicals stay
 *        on; night indoor keys/fill are ×1.5 vs day so the shop reads brighter
 *        after dark. Shader keys are soft oval pools on the lobby/counter
 *        floor. Painted wall wash stays on the cream wall separately.
 *
 * FILL — dim warm bounce from cream walls / oak. Not a full-frame orange grade.
 *        Exposure stops down at night, then the indoor boost lifts it.
 *
 * SUN / MOON / WINDOW — not shader lights inside the shop. Sky color still
 *        lives in the painted window glass; no interior orb, ellipse, or
 *        hotspot over the pots.
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
  /** Indoor keys + fill at full night vs current day values. */
  shopNightIndoorBoost: 1.5,
  lampColor: 0xffc070,
  lampRadius: 340,
  lampIntensityBase: 0.25,
  lampIntensityGain: 0.45,
  lampMin: 0.08,
};

export const MAX_LIGHTS = 8;

export type LightKind = "pot" | "window" | "door" | "lamp";

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

/** 0 through late afternoon, 1 from the 20:30 night key onward. */
function nightAmount(sky: SkySample): number {
  return clamp((sky.mapOverlayAlpha - 0.12) / 0.26, 0, 1);
}

function indoorBoost(sky: SkySample): number {
  return 1 + (DAY_NIGHT_TUNE.shopNightIndoorBoost - 1) * nightAmount(sky);
}

export function shopGrade(sky: SkySample, potXs: number[]): GradeFrame {
  const lights: PointLight[] = [];
  const boost = indoorBoost(sky);
  for (const x of potXs.slice(0, 5)) {
    lights.push({
      kind: "pot",
      x,
      y: DAY_NIGHT_TUNE.potY,
      color: DAY_NIGHT_TUNE.potColor,
      radius: DAY_NIGHT_TUNE.potRadius,
      intensity: DAY_NIGHT_TUNE.potIntensity * boost,
      scaleX: DAY_NIGHT_TUNE.potScaleX,
      scaleY: DAY_NIGHT_TUNE.potScaleY,
    });
  }

  return {
    tint: rgb01(sky.mapOverlay),
    gradeStrength: sky.mapOverlayAlpha * DAY_NIGHT_TUNE.shopGradeScale,
    ambient: shopAmbientColor(),
    ambientMul: ambientMul(sky, DAY_NIGHT_TUNE.shopAmbientDim, DAY_NIGHT_TUNE.ambientFloor) * boost,
    lights,
  };
}

/**
 * O(n·k) partial nearest pick — avoids sorting the full street-lamp set every grade rebuild.
 */
export function nearestLamps<T extends { x: number; y: number }>(
  origin: { x: number; y: number },
  lamps: T[],
  max: number,
): T[] {
  if (max <= 0 || lamps.length === 0) return [];
  if (lamps.length <= max) return lamps.slice();
  const best: Array<{ item: T; d: number }> = [];
  for (const lamp of lamps) {
    const d = (lamp.x - origin.x) ** 2 + (lamp.y - origin.y) ** 2;
    if (best.length < max) {
      best.push({ item: lamp, d });
      if (best.length === max) best.sort((a, b) => b.d - a.d);
      continue;
    }
    if (d >= best[0]!.d) continue;
    best[0] = { item: lamp, d };
    best.sort((a, b) => b.d - a.d);
  }
  return best.map((b) => b.item);
}

export function driveGrade(
  sky: SkySample,
  focus?: { x: number; y: number },
  lamps: { x: number; y: number }[] = [],
): GradeFrame {
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
  if (sky.lampAlpha > DAY_NIGHT_TUNE.lampMin && lamps.length > 0) {
    const origin = focus ?? lamps[0]!;
    const slots = Math.max(0, MAX_LIGHTS - lights.length);
    for (const lamp of nearestLamps(origin, lamps, slots)) {
      lights.push({
        kind: "lamp",
        x: lamp.x,
        y: lamp.y,
        color: 0xffd080,
        radius: 300,
        intensity: 0.18 + 0.4 * sky.lampAlpha,
      });
    }
  }
  return {
    tint: rgb01(sky.mapOverlay),
    gradeStrength: Math.min(0.72, sky.mapOverlayAlpha * DAY_NIGHT_TUNE.driveGradeBoost),
    ambient: ambientColor(sky),
    ambientMul: ambientMul(sky, DAY_NIGHT_TUNE.ambientDim, DAY_NIGHT_TUNE.driveAmbientFloor),
    lights,
  };
}

export function doorGrade(sky: SkySample, porch: { x: number; y: number }): GradeFrame {
  const lights: PointLight[] = [];
  if (sky.lampAlpha > DAY_NIGHT_TUNE.lampMin) {
    lights.push({
      kind: "lamp",
      x: porch.x,
      y: porch.y,
      color: 0xffe0a0,
      radius: 420,
      intensity: 0.3 + 0.48 * sky.lampAlpha,
    });
  }
  if (sky.windowGlow > 0.2) {
    lights.push({
      kind: "window",
      x: porch.x - 220,
      y: porch.y - 160,
      color: 0xffc070,
      radius: 210,
      intensity: 0.16 + 0.28 * sky.windowGlow,
    });
    lights.push({
      kind: "window",
      x: porch.x + 220,
      y: porch.y - 160,
      color: 0xffc070,
      radius: 210,
      intensity: 0.16 + 0.28 * sky.windowGlow,
    });
  }
  return {
    tint: rgb01(sky.mapOverlay),
    gradeStrength: Math.min(0.55, sky.mapOverlayAlpha * 1.05),
    ambient: ambientColor(sky),
    ambientMul: ambientMul(sky, DAY_NIGHT_TUNE.ambientDim, 0.38),
    lights,
  };
}
