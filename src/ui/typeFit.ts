/** Box a type size must sit inside. Omitted / non-positive edges are unconstrained. */
export interface FitBox {
  width?: number;
  height?: number;
}

export interface SizeMeasure {
  width: number;
  height: number;
}

export interface TypeFitRangeInput {
  basePx: number;
  minPx: number;
  cssFloor?: number;
  cssCeiling?: number;
}

export interface ClampFitResult {
  size: number;
  /** Requested floor could not be honoured (size may still fit the box). */
  overflow: boolean;
  /** Even the fallback size sticks out of the box — caller should clip. */
  clip: boolean;
}

const SLACK = 0.5;

export function fitsBox(measured: SizeMeasure, box: FitBox, slack = SLACK): boolean {
  const tooWide = box.width !== undefined && box.width > 0 && measured.width > box.width + slack;
  const tooTall = box.height !== undefined && box.height > 0 && measured.height > box.height + slack;
  return !tooWide && !tooTall;
}

export function isUnconstrained(box: FitBox): boolean {
  const w = box.width;
  const h = box.height;
  return !(w !== undefined && w > 0) && !(h !== undefined && h > 0);
}

/**
 * Closed interval for clamp-fit. The floor is the readability contract; the ceiling
 * is the larger of the authored seed and the CSS grow cap, and never below the floor.
 */
export function typeFitRange(input: TypeFitRangeInput): { floor: number; ceiling: number } {
  const minPx = Number.isFinite(input.minPx) ? input.minPx : 1;
  const base = Number.isFinite(input.basePx) ? input.basePx : minPx;
  const cssFloor = Number.isFinite(input.cssFloor) ? (input.cssFloor ?? 0) : 0;
  const cssCeiling = Number.isFinite(input.cssCeiling) ? (input.cssCeiling ?? 0) : 0;
  const floor = Math.max(1, Math.round(Math.max(minPx, cssFloor)));
  const ceiling = Math.max(floor, Math.round(Math.max(base, cssCeiling)));
  return { floor, ceiling };
}

/**
 * Largest integer size in [floor, ceiling] that fits. Walks down from the ceiling
 * rather than binary-searching: word-wrap makes height non-monotonic in size, so a
 * bisect can pick a miss while a neighbour still fits.
 *
 * If the floor itself does not fit, searches below it so glyphs stay in the box
 * (overflow=true). clip=true only when even 1px sticks out.
 */
export function clampFitSize(
  measure: (px: number) => SizeMeasure,
  floor: number,
  ceiling: number,
  box: FitBox,
): ClampFitResult {
  const lo = Math.max(1, Math.round(floor));
  const hi = Math.max(lo, Math.round(ceiling));
  if (isUnconstrained(box)) return { size: hi, overflow: false, clip: false };

  if (fitsBox(measure(hi), box)) return { size: hi, overflow: false, clip: false };

  for (let px = hi - 1; px >= lo; px--) {
    if (fitsBox(measure(px), box)) return { size: px, overflow: false, clip: false };
  }

  for (let px = lo - 1; px >= 1; px--) {
    if (fitsBox(measure(px), box)) return { size: px, overflow: true, clip: false };
  }

  return { size: lo, overflow: true, clip: true };
}
