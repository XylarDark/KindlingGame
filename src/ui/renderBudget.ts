import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";

export type RenderTier = "high" | "mid" | "low";

export type RenderBudget = {
  tier: RenderTier;
  /** WebGL backbuffer scale vs design 1920×1080 (camera zoom matches). */
  renderScale: number;
  postFx: boolean;
  maxLights: number;
  /** Min ms between DayNight uniform uploads. */
  uploadMinMs: number;
};

const HIGH: RenderBudget = { tier: "high", renderScale: 1, postFx: true, maxLights: 8, uploadMinMs: 0 };
/** Mid: fewer pixels; PostFX off — lights still read via Graphics glow. Lane evidence: PostFX dominates. */
const MID: RenderBudget = { tier: "mid", renderScale: 0.75, postFx: false, maxLights: 0, uploadMinMs: 100 };
const LOW: RenderBudget = { tier: "low", renderScale: 0.6, postFx: false, maxLights: 0, uploadMinMs: 200 };

/** Promote above this; demote below the lower band (hysteresis). */
const PROMOTE_FPS = 48;
const DEMOTE_TO_MID_FPS = 42;
const DEMOTE_TO_LOW_FPS = 30;

let current: RenderBudget = HIGH;
let lastEvalAt = 0;
let appliedScale = 1;
let demoteStrikes = 0;
let autoEnabled = true;
let listeners: Array<(b: RenderBudget) => void> = [];

export function resetRenderBudgetForTests(): void {
  current = HIGH;
  lastEvalAt = 0;
  appliedScale = 1;
  demoteStrikes = 0;
  autoEnabled = true;
  listeners = [];
}

/** When false, tickRenderBudget is a no-op (DEV / capture harness). */
export function setRenderBudgetAuto(enabled: boolean): void {
  autoEnabled = enabled;
}

/** Force a tier (and emit). Used by DEV harness and tests. */
export function forceRenderBudget(tier: RenderTier): RenderBudget {
  current = budgetFor(tier);
  demoteStrikes = 0;
  emit();
  return current;
}

export function getRenderBudget(): RenderBudget {
  return current;
}

export function onRenderBudgetChange(fn: (b: RenderBudget) => void): () => void {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((l) => l !== fn);
  };
}

function emit(): void {
  for (const fn of listeners) fn(current);
}

export function pickRenderTier(opts: {
  coarsePointer: boolean;
  actualFps: number;
  prev: RenderTier;
}): RenderTier {
  const { coarsePointer, actualFps, prev } = opts;
  // Coarse devices start at mid unless FPS already healthy on high.
  if (prev === "high") {
    if (actualFps > 0 && actualFps < DEMOTE_TO_MID_FPS) return coarsePointer ? "low" : "mid";
    if (coarsePointer && actualFps > 0 && actualFps < PROMOTE_FPS) return "mid";
    return "high";
  }
  if (prev === "mid") {
    if (actualFps > 0 && actualFps < DEMOTE_TO_LOW_FPS) return "low";
    if (actualFps >= PROMOTE_FPS && !coarsePointer) return "high";
    return "mid";
  }
  // low
  if (actualFps >= DEMOTE_TO_MID_FPS) return coarsePointer ? "mid" : "mid";
  return "low";
}

function budgetFor(tier: RenderTier): RenderBudget {
  if (tier === "high") return HIGH;
  if (tier === "mid") return MID;
  return LOW;
}

/** Seed tier from pointer (call once at boot). */
export function initRenderBudget(coarsePointer: boolean): RenderBudget {
  current = budgetFor(coarsePointer ? "mid" : "high");
  emit();
  return current;
}

/**
 * Re-evaluate ~1/s from Phaser's rolling FPS. Returns true when the tier changed.
 * Demotion needs two consecutive strikes so a single hitch does not drop quality.
 */
export function tickRenderBudget(actualFps: number, nowMs = performance.now()): boolean {
  if (!autoEnabled) return false;
  if (nowMs - lastEvalAt < 1000) return false;
  lastEvalAt = nowMs;
  const coarse =
    typeof globalThis.matchMedia === "function"
      ? (globalThis.matchMedia("(pointer: coarse)")?.matches ?? false)
      : false;
  const next = pickRenderTier({ coarsePointer: coarse, actualFps, prev: current.tier });
  if (next === current.tier) {
    demoteStrikes = 0;
    return false;
  }
  const rank = { high: 2, mid: 1, low: 0 } as const;
  if (rank[next] < rank[current.tier]) {
    demoteStrikes += 1;
    if (demoteStrikes < 2) return false;
  } else {
    demoteStrikes = 0;
  }
  current = budgetFor(next);
  demoteStrikes = 0;
  emit();
  return true;
}

/**
 * Keep the design canvas at 1920×1080 with camera zoom 1.
 *
 * An earlier approach resized the WebGL backbuffer and matched camera zoom, but
 * READY fires before shop/hud launch — new cameras stayed at zoom 1 on a smaller
 * game size and phones looked permanently zoomed-in. Fill-rate wins come from
 * PostFX policy (`postFx` / `maxLights`), not resolution scaling.
 */
export function applyRenderScale(game: Phaser.Game, _scale: number): void {
  const fullW = GAME_WIDTH;
  const fullH = GAME_HEIGHT;
  const gw = game.scale.gameSize?.width || game.scale.width || fullW;
  const gh = game.scale.gameSize?.height || game.scale.height || fullH;
  if (Math.abs(gw - fullW) >= 1 || Math.abs(gh - fullH) >= 1 || Math.abs(appliedScale - 1) >= 0.01) {
    appliedScale = 1;
    game.scale.resize(fullW, fullH);
  }
  for (const scene of game.scene.getScenes(true)) {
    const cam = scene.cameras?.main;
    if (!cam) continue;
    if (Math.abs(cam.zoom - 1) >= 0.01) cam.setZoom(1);
    if (scene.sys.settings.key !== "drive") {
      cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
    }
  }
}

export function applyRenderBudgetToGame(game: Phaser.Game): void {
  applyRenderScale(game, current.renderScale);
}
