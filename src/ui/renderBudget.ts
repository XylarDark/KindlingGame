import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";

export type RenderTier = "high" | "mid" | "low";

export type RenderBudget = {
  tier: RenderTier;
  /**
   * WebGL backbuffer scale vs design 1920×1080. Camera zoom matches so
   * layout/sim stay in GAME_* coordinates; CSS shell still presents a 16:9 stage.
   *
   * Tier table (2026-09-10 doctrine — prefer sustained phone FPS over fixed 1×):
   * | tier | renderScale | postFx | maxLights | uploadMinMs | notes |
   * | high | 1.0         | on     | 8         | 16          | desktop default |
   * | mid  | 0.55        | off    | 0         | 100         | phone default; Drive/Door prefer this |
   * | low  | 0.4         | off    | 0         | 200         | heavy stress / coarse demotion |
   */
  renderScale: number;
  postFx: boolean;
  maxLights: number;
  /** Min ms between DayNight uniform uploads. */
  uploadMinMs: number;
};

/** Desktop high — phones seed/stay mid so they skip fullscreen DayNight by default. */
const HIGH: RenderBudget = { tier: "high", renderScale: 1, postFx: true, maxLights: 8, uploadMinMs: 16 };
/** Mid: ~0.55× pixels; PostFX off — lights still read via Graphics glow. */
const MID: RenderBudget = { tier: "mid", renderScale: 0.55, postFx: false, maxLights: 0, uploadMinMs: 100 };
/** Low: ~0.4× backbuffer; PostFX off. Soft on small GPUs; UI may look softer. */
const LOW: RenderBudget = { tier: "low", renderScale: 0.4, postFx: false, maxLights: 0, uploadMinMs: 200 };

/** Promote above this; demote below the lower band (hysteresis). */
const PROMOTE_FPS = 48;
const DEMOTE_TO_MID_FPS = 42;
const DEMOTE_TO_LOW_FPS = 30;
/** One-strike demote when FPS collapses — avoids staying on PostFX during a death spiral. */
const SEVERE_DEMOTE_FPS = 24;
/** Drive/Door scroll + fullscreen PostFX — demote earlier than shop. */
const HEAVY_DEMOTE_TO_MID_FPS = 48;
const HEAVY_DEMOTE_TO_LOW_FPS = 34;
const HEAVY_SEVERE_DEMOTE_FPS = 28;

export type RenderStressContext = "shop" | "drive" | "door" | null;

let current: RenderBudget = HIGH;
let lastEvalAt = 0;
let appliedScale = 1;
let demoteStrikes = 0;
let autoEnabled = true;
let stressContext: RenderStressContext = null;
let listeners: Array<(b: RenderBudget) => void> = [];

export function resetRenderBudgetForTests(): void {
  current = HIGH;
  lastEvalAt = 0;
  appliedScale = 1;
  demoteStrikes = 0;
  autoEnabled = true;
  stressContext = null;
  listeners = [];
}

/** Active scene weight for demotion thresholds (Drive/Door demote before shop). */
export function setRenderStressContext(ctx: RenderStressContext): void {
  stressContext = ctx;
}

export function getRenderStressContext(): RenderStressContext {
  return stressContext;
}

function heavyScene(): boolean {
  return stressContext === "drive" || stressContext === "door";
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
  heavyScene?: boolean;
}): RenderTier {
  const { coarsePointer, actualFps, prev } = opts;
  const heavy = opts.heavyScene ?? false;
  // Coarse + Drive/Door: never linger on high (fullscreen DayNight) even if FPS looks fine.
  if (coarsePointer && heavy && prev === "high") return "mid";
  const demoteMid = heavy ? HEAVY_DEMOTE_TO_MID_FPS : DEMOTE_TO_MID_FPS;
  const demoteLow = heavy ? HEAVY_DEMOTE_TO_LOW_FPS : DEMOTE_TO_LOW_FPS;
  // Coarse devices start at mid unless FPS already healthy on high.
  if (prev === "high") {
    if (actualFps > 0 && actualFps < demoteMid) return coarsePointer ? "low" : "mid";
    if (coarsePointer && actualFps > 0 && actualFps < PROMOTE_FPS) return "mid";
    return "high";
  }
  if (prev === "mid") {
    if (actualFps > 0 && actualFps < demoteLow) return "low";
    if (actualFps >= PROMOTE_FPS && !coarsePointer && !heavy) return "high";
    return "mid";
  }
  // low
  if (actualFps >= demoteMid) return coarsePointer ? "mid" : "mid";
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
  const next = pickRenderTier({
    coarsePointer: coarse,
    actualFps,
    prev: current.tier,
    heavyScene: heavyScene(),
  });
  if (next === current.tier) {
    demoteStrikes = 0;
    return false;
  }
  const rank = { high: 2, mid: 1, low: 0 } as const;
  if (rank[next] < rank[current.tier]) {
    demoteStrikes += 1;
    const severeFps = heavyScene() ? HEAVY_SEVERE_DEMOTE_FPS : SEVERE_DEMOTE_FPS;
    const severe = actualFps > 0 && actualFps < severeFps;
    if (!severe && demoteStrikes < 2) return false;
  } else {
    demoteStrikes = 0;
  }
  current = budgetFor(next);
  demoteStrikes = 0;
  emit();
  return true;
}

/**
 * Match one scene's camera to the live render scale.
 * Call from every scene `create` — READY can fire before shop/hud exist.
 * Zoom = renderScale with a buffer of design×scale keeps worldView ≈ 1920×1080.
 */
export function syncSceneRenderCamera(
  scene: Phaser.Scene,
  scale: number = getRenderBudget().renderScale,
): void {
  const cam = scene.cameras?.main;
  if (!cam) return;
  cam.setZoom(scale);
  // Drive follows the van in map space — do not yank it to design centre.
  if (scene.sys.settings.key !== "drive") {
    cam.centerOn(GAME_WIDTH / 2, GAME_HEIGHT / 2);
  }
}

/**
 * Resize the WebGL backbuffer and zoom every registered scene so design 1920×1080
 * still fills the stage. CSS shell stretches the canvas; fewer GPU pixels on mid/low.
 */
export function applyRenderScale(game: Phaser.Game, scale: number): void {
  if (Math.abs(scale - appliedScale) >= 0.01) {
    appliedScale = scale;
    const w = Math.max(320, Math.round(GAME_WIDTH * scale));
    const h = Math.max(180, Math.round(GAME_HEIGHT * scale));
    game.scale.resize(w, h);
  }
  // Always re-zoom: scenes may have launched since the last resize.
  for (const scene of game.scene.getScenes(false)) {
    syncSceneRenderCamera(scene, scale);
  }
}

export function applyRenderBudgetToGame(game: Phaser.Game): void {
  applyRenderScale(game, current.renderScale);
}
