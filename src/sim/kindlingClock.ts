/**
 * Gaffer-style fixed timestep for Kindling sim + render interpolation alpha.
 *
 * Fixed step: **1/60 s** (~16.667 ms). Both modes feed from Phaser scene
 * `update` delta (time between game steps). Under `fps.limit: 30` that is
 * ~33 ms per frame — fixedRaw runs two 60 Hz steps, not one half-speed step
 * from RAF rawDelta (~16 ms). Default mode is `smooth` until meter evidence
 * on an installed PWA says otherwise; opt in with `?clock=fixedRaw`.
 */
import type { SimSnapshot } from "./gameSim";
import { SimInterpolator } from "./simInterpolator";

/** Sim advances at 60 Hz — matches desktop target; coarse render may still cap at 30 fps. */
export const FIXED_STEP_MS = 1000 / 60;

/** Spiral-of-death guard — drop excess backlog after this many steps per frame. */
export const MAX_STEPS_PER_FRAME = 5;

export type ClockMode = "fixedRaw" | "smooth";

const MODE_STORAGE_KEY = "kindlingClock.mode";

let mode: ClockMode = resolveClockMode();
let accumulator = 0;
let alpha = 0;
let lastSteps = 0;
let lastBacklogMs = 0;
let lastFrameMs = 0;

const interpolator = new SimInterpolator();

/** Rolling frame-ms samples for p95-ish overlay (last 120 frames). */
const frameHistory: number[] = [];
const FRAME_HISTORY_MAX = 120;

export function resolveClockMode(): ClockMode {
  if (typeof globalThis.location !== "undefined") {
    const q = new URLSearchParams(globalThis.location.search).get("clock");
    if (q === "smooth" || q === "fixedRaw") return q;
  }
  try {
    const stored = globalThis.localStorage?.getItem(MODE_STORAGE_KEY);
    if (stored === "smooth" || stored === "fixedRaw") return stored;
  } catch {
    /* private mode / SSR */
  }
  return "smooth";
}

export function getClockMode(): ClockMode {
  return mode;
}

export function setClockMode(next: ClockMode): void {
  mode = next;
  accumulator = 0;
  alpha = 0;
  try {
    globalThis.localStorage?.setItem(MODE_STORAGE_KEY, next);
  } catch {
    /* ignore */
  }
}

export function wantsSmoothStep(clockMode: ClockMode = mode): boolean {
  return clockMode === "smooth";
}

export function getClockAlpha(): number {
  return alpha;
}

export function getSimInterpolator(): SimInterpolator {
  return interpolator;
}

export interface ClockStats {
  mode: ClockMode;
  fixedStepMs: number;
  lastFrameMs: number;
  p95FrameMs: number;
  fixedSteps: number;
  backlogMs: number;
  alpha: number;
}

export function getClockStats(): ClockStats {
  const sorted = [...frameHistory].sort((a, b) => a - b);
  const p95Idx = sorted.length > 0 ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : 0;
  return {
    mode,
    fixedStepMs: FIXED_STEP_MS,
    lastFrameMs,
    p95FrameMs: sorted[p95Idx] ?? 0,
    fixedSteps: lastSteps,
    backlogMs: lastBacklogMs,
    alpha,
  };
}

export function resetKindlingClockForTests(): void {
  mode = resolveClockMode();
  accumulator = 0;
  alpha = 0;
  lastSteps = 0;
  lastBacklogMs = 0;
  lastFrameMs = 0;
  frameHistory.length = 0;
  interpolator.reset();
}

export interface AdvanceClockOpts {
  /** Scene update delta — time between game steps (not game.loop.rawDelta). */
  frameMs: number;
  tick: (dtMs: number) => void;
  snapshot: () => SimSnapshot;
}

/**
 * Advance sim clock for one render frame. Returns step count and interpolation alpha.
 */
export function advanceSimClock(opts: AdvanceClockOpts): { steps: number; alpha: number } {
  const dt = Math.max(0, opts.frameMs);
  lastFrameMs = dt;
  pushFrameSample(dt);

  if (mode === "smooth") {
    lastSteps = 1;
    lastBacklogMs = 0;
    alpha = 1;
    opts.tick(dt);
    interpolator.push(opts.snapshot());
    return { steps: 1, alpha: 1 };
  }

  accumulator += dt;
  let steps = 0;
  while (accumulator >= FIXED_STEP_MS && steps < MAX_STEPS_PER_FRAME) {
    if (steps === 0) interpolator.markStepStart(opts.snapshot());
    opts.tick(FIXED_STEP_MS);
    interpolator.push(opts.snapshot());
    accumulator -= FIXED_STEP_MS;
    steps += 1;
  }
  if (accumulator >= FIXED_STEP_MS) {
    // Spiral guard — shed backlog rather than freeze the frame.
    accumulator = accumulator % FIXED_STEP_MS;
  }
  alpha = steps > 0 ? accumulator / FIXED_STEP_MS : 0;
  lastSteps = steps;
  lastBacklogMs = accumulator;
  if (steps === 0) {
    // No sim step this frame — hold positions; alpha stays 0 (prev == curr).
    interpolator.hold(opts.snapshot());
  }
  return { steps, alpha };
}

function pushFrameSample(ms: number): void {
  frameHistory.push(ms);
  if (frameHistory.length > FRAME_HISTORY_MAX) frameHistory.shift();
}
