/** Scene-level grade rebuild gate (Shop/Drive/Door) — matches Shop's ~80ms. */
export const GRADE_APPLY_MIN_MS = 80;

/**
 * Rebuild when dirty, or when the throttle window has elapsed.
 * Pure helper for tests and shared Drive/Door cadence.
 */
export function shouldApplyGrade(opts: {
  nowMs: number;
  lastMs: number;
  dirty: boolean;
  minMs?: number;
}): boolean {
  if (opts.dirty) return true;
  const minMs = opts.minMs ?? GRADE_APPLY_MIN_MS;
  return opts.nowMs - opts.lastMs >= minMs;
}
