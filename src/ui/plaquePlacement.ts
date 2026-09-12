import {
  chipPlaqueAabb,
  type ChipAabb,
  type ChipPlaqueExtents,
} from "./hud/chipCollision";

/** Default slack when comparing pixel positions in CI (sub-pixel layout noise). */
export const PLACEMENT_TOLERANCE = 1;

export interface VerticalBand {
  top: number;
  bottom: number;
}

export interface PlacementViolation {
  rule: string;
  detail: string;
}

export type PlacementAssertResult = { ok: true } | { ok: false; violation: PlacementViolation };

/** World-space plaque AABB from a plaque-center anchor and host-local extents. */
export function plaqueAabbFromCenter(
  centerX: number,
  centerY: number,
  plaque: ChipPlaqueExtents,
): ChipAabb {
  const midX = (plaque.leftLocal + plaque.rightLocal) / 2;
  const midY = (plaque.topLocal + plaque.bottomLocal) / 2;
  return chipPlaqueAabb(centerX - midX, centerY - midY, plaque);
}

/** Target band: plaque bottom must sit at or above `headTopY - gap`. */
export function aboveHeadBand(headTopY: number, gap: number): VerticalBand {
  return { top: -Infinity, bottom: headTopY - gap };
}

/** Target band between TV bottom and head top (screen Y increases downward). */
export function inHeadTvBand(headTopY: number, tvBottomY: number, gap: number): VerticalBand {
  return { top: tvBottomY + gap, bottom: headTopY - gap };
}

/** Horizontal target for top-center instruction chips. */
export function topCenterX(viewW: number): number {
  return viewW / 2;
}

/** Vertical target center for a top-center chip given safe inset and margin. */
export function topCenterY(insetTop: number, margin: number, panelH: number): number {
  return insetTop + margin + panelH / 2;
}

function overlapAmount(a: ChipAabb, b: ChipAabb): number {
  const dx = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const dy = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  if (dx <= 0 || dy <= 0) return 0;
  return dx * dy;
}

/** Plaque bottom sits at or above the head line minus gap. */
export function aboveHead(
  plaque: ChipAabb,
  headTopY: number,
  gap: number,
  tolerance = PLACEMENT_TOLERANCE,
): PlacementAssertResult {
  const limit = headTopY - gap;
  if (plaque.bottom <= limit + tolerance) return { ok: true };
  return {
    ok: false,
    violation: {
      rule: "aboveHead",
      detail: `plaque bottom ${plaque.bottom.toFixed(1)} > headTop−gap ${limit.toFixed(1)}`,
    },
  };
}

/** Plaque AABB fully inside the head↔TV band (pad on both edges). */
export function inHeadTvBandPlaque(
  plaque: ChipAabb,
  headTopY: number,
  tvBottomY: number,
  gap: number,
  tolerance = PLACEMENT_TOLERANCE,
): PlacementAssertResult {
  const band = inHeadTvBand(headTopY, tvBottomY, gap);
  if (plaque.top >= band.top - tolerance && plaque.bottom <= band.bottom + tolerance) return { ok: true };
  return {
    ok: false,
    violation: {
      rule: "inHeadTvBand",
      detail: `plaque [${plaque.top.toFixed(1)}, ${plaque.bottom.toFixed(1)}] outside band [${band.top.toFixed(1)}, ${band.bottom.toFixed(1)}]`,
    },
  };
}

/** Plaque center near screen top-center with safe inset margin. */
export function topCenter(
  plaque: ChipAabb,
  viewW: number,
  insetTop: number,
  margin: number,
  tolerance = PLACEMENT_TOLERANCE,
): PlacementAssertResult {
  const centerX = (plaque.left + plaque.right) / 2;
  const targetX = topCenterX(viewW);
  if (Math.abs(centerX - targetX) > tolerance) {
    return {
      ok: false,
      violation: {
        rule: "topCenter",
        detail: `centerX ${centerX.toFixed(1)} ≠ viewW/2 ${targetX.toFixed(1)}`,
      },
    };
  }
  const minTop = insetTop + margin;
  if (plaque.top >= minTop - tolerance) return { ok: true };
  return {
    ok: false,
    violation: {
      rule: "topCenter",
      detail: `plaque top ${plaque.top.toFixed(1)} < inset+margin ${minTop.toFixed(1)}`,
    },
  };
}

/** Fail when plaque overlaps an obstacle by more than `maxOverlap` px². */
export function overlapsObstacle(
  plaque: ChipAabb,
  obstacle: ChipAabb,
  maxOverlap = 0,
): PlacementAssertResult {
  const amount = overlapAmount(plaque, obstacle);
  if (amount <= maxOverlap) return { ok: true };
  return {
    ok: false,
    violation: {
      rule: "overlapsObstacle",
      detail: `overlap ${amount.toFixed(1)}px² > max ${maxOverlap}`,
    },
  };
}

export function assertPlacement(result: PlacementAssertResult, context = ""): void {
  if (result.ok) return;
  const prefix = context ? `${context}: ` : "";
  throw new Error(`${prefix}${result.violation.rule} — ${result.violation.detail}`);
}

/** Preferred plaque center for character speech above a head (pure geometry). */
export function speechPlaqueCenterAboveHead(
  plaque: ChipPlaqueExtents,
  centerX: number,
  headTopY: number,
  gap: number,
): { x: number; y: number } {
  const midY = (plaque.topLocal + plaque.bottomLocal) / 2;
  const hostY = headTopY - gap - plaque.bottomLocal;
  return { x: centerX, y: hostY + midY };
}

/** Key-lead speech centered in the head↔TV band, or above-head fallback when tight. */
export function leadSpeechPlaqueCenterFromExtents(
  plaque: ChipPlaqueExtents,
  centerX: number,
  headTopY: number,
  tvBottomY: number,
  gap: number,
): { x: number; y: number } {
  const minCenterY = tvBottomY + gap + plaque.panelH / 2;
  const maxCenterY = headTopY - gap - plaque.panelH / 2;
  const y =
    minCenterY <= maxCenterY
      ? (minCenterY + maxCenterY) / 2
      : speechPlaqueCenterAboveHead(plaque, centerX, headTopY, gap).y;
  return { x: centerX, y };
}
