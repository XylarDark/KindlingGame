import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";

export type RenderTier = "high" | "mid" | "low";

export type RenderBudget = {
  tier: RenderTier;
  /**
   * WebGL backbuffer scale vs design 1920×1080. Camera zoom matches so
   * layout/sim stay in GAME_* coordinates; CSS shell still presents a 16:9 stage.
   *
   * | tier | renderScale | postFx | notes |
   * | high | 1.0         | on     | desktop; half-res DayNight |
   * | mid  | 0.85        | off    | phone default; Graphics mood only |
   * | low  | 0.65        | off    | desktop demotion only |
   */
  renderScale: number;
  postFx: boolean;
  postFxScale: number;
  maxLights: number;
  uploadMinMs: number;
};

const HIGH: RenderBudget = {
  tier: "high",
  renderScale: 1,
  postFx: true,
  postFxScale: 0.5,
  maxLights: 8,
  uploadMinMs: 16,
};
const MID: RenderBudget = {
  tier: "mid",
  renderScale: 0.85,
  postFx: false,
  postFxScale: 0.5,
  maxLights: 0,
  uploadMinMs: 100,
};
const LOW: RenderBudget = {
  tier: "low",
  renderScale: 0.65,
  postFx: false,
  postFxScale: 0.5,
  maxLights: 0,
  uploadMinMs: 200,
};

const PROMOTE_FPS = 48;
const DEMOTE_TO_MID_FPS = 42;
const DEMOTE_TO_LOW_FPS = 30;
const SEVERE_DEMOTE_FPS = 24;
const TIER_PROMOTE_COOLDOWN_MS = 12000;
const PROMOTE_FROM_LOW_FPS = 54;

let current: RenderBudget = HIGH;
let lastEvalAt = 0;
let appliedScale = 1;
let demoteStrikes = 0;
let lastDemotionAt = 0;
let autoEnabled = true;
/** Phones: tier seeded at boot (mid) — no mid-session resize (scale.resize refits all typekit). */
let sessionTierLocked = false;
/** Dev meter: count mid-session scale.resize calls (should stay 0 on coarse). */
let resizeCount = 0;
let listeners: Array<(b: RenderBudget) => void> = [];

export function resetRenderBudgetForTests(): void {
  current = HIGH;
  lastEvalAt = 0;
  appliedScale = 1;
  demoteStrikes = 0;
  lastDemotionAt = 0;
  autoEnabled = true;
  sessionTierLocked = false;
  resizeCount = 0;
  listeners = [];
}

export function getRenderResizeCount(): number {
  return resizeCount;
}

export function isSessionTierLocked(): boolean {
  return sessionTierLocked;
}

export function setRenderBudgetAuto(enabled: boolean): void {
  autoEnabled = enabled;
}

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
  if (actualFps >= PROMOTE_FROM_LOW_FPS) return "mid";
  return "low";
}

function budgetFor(tier: RenderTier): RenderBudget {
  if (tier === "high") return HIGH;
  if (tier === "mid") return MID;
  return LOW;
}

/** Seed tier from pointer once at boot. Coarse stays at mid for the session. */
export function initRenderBudget(coarsePointer: boolean): RenderBudget {
  sessionTierLocked = coarsePointer;
  current = budgetFor(coarsePointer ? "mid" : "high");
  emit();
  return current;
}

/**
 * Desktop-only adaptive tier (~1/s). Coarse phones skip — mid-session resize
 * triggers refreshTypekit on every Text and feels like input lag after clicks.
 */
export function tickRenderBudget(actualFps: number, nowMs = performance.now()): boolean {
  if (!autoEnabled || sessionTierLocked) return false;
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
    const severe = actualFps > 0 && actualFps < SEVERE_DEMOTE_FPS;
    if (!severe && demoteStrikes < 2) return false;
  } else {
    if (nowMs - lastDemotionAt < TIER_PROMOTE_COOLDOWN_MS) return false;
    demoteStrikes = 0;
  }
  const demoted = rank[next] < rank[current.tier];
  current = budgetFor(next);
  demoteStrikes = 0;
  if (demoted) lastDemotionAt = nowMs;
  emit();
  return true;
}

export function syncSceneRenderCamera(
  scene: Phaser.Scene,
  scale: number = getRenderBudget().renderScale,
): void {
  const cam = scene.cameras?.main;
  if (!cam) return;
  // HUD chrome is screen-space at design coords — zoom would drift score/clock off the counter sign.
  const zoom = scene.sys.settings.key === "hud" ? 1 : scale;
  cam.setZoom(zoom);
  if (scene.sys.settings.key !== "drive") {
    cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  }
}

export function applyRenderScale(game: Phaser.Game, scale: number): void {
  if (Math.abs(scale - appliedScale) >= 0.01) {
    appliedScale = scale;
    const w = Math.max(320, Math.round(GAME_WIDTH * scale));
    const h = Math.max(180, Math.round(GAME_HEIGHT * scale));
    game.scale.resize(w, h);
    resizeCount += 1;
  }
  for (const scene of game.scene.getScenes(false)) {
    syncSceneRenderCamera(scene, scale);
  }
}

export function applyRenderBudgetToGame(game: Phaser.Game): void {
  applyRenderScale(game, current.renderScale);
}
