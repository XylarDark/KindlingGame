import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";

export interface ViewSize {
  width: number;
  height: number;
}

export interface DisplayScale {
  x: number;
  y: number;
}

export interface SafeInset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface CanvasClientRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** Material 48 (Apple HIG is 44). Phone landscape after contain still has to hit this. */
export const MIN_CSS_TOUCH_PX = 48;

/** Landscape CSS sizes for phones and tablets Kindling should fill. */
export const POPULAR_MOBILE_LANDSCAPE: readonly ViewSize[] = [
  { width: 667, height: 375 }, // iPhone SE
  { width: 736, height: 414 }, // iPhone 8 Plus
  { width: 812, height: 375 }, // iPhone 12/13 mini
  { width: 844, height: 390 }, // iPhone 14
  { width: 852, height: 393 }, // iPhone 14/15 Pro
  { width: 874, height: 402 }, // iPhone 16 Pro
  { width: 896, height: 414 }, // iPhone 11 / XR
  { width: 926, height: 428 }, // iPhone 14 Plus
  { width: 932, height: 430 }, // iPhone 14/15/16 Pro Max (classic)
  { width: 956, height: 440 }, // iPhone 16 Pro Max
  { width: 800, height: 360 }, // common Android 20:9
  { width: 853, height: 384 }, // 20:9 2400×1080 css-ish
  { width: 915, height: 412 }, // Pixel
  { width: 1024, height: 768 }, // iPad 4:3
  { width: 1133, height: 744 }, // iPad mini
  { width: 1180, height: 820 }, // iPad Air
  { width: 1194, height: 834 }, // iPad Pro 11
  { width: 1366, height: 1024 }, // iPad Pro 12.9 landscape-ish
];

/** Design aspect (1920×1080). */
export const GAME_ASPECT = GAME_WIDTH / GAME_HEIGHT;

/** Hide rail wordmarks when leftover CSS width is below this. */
export const RAIL_MIN_CSS_PX = 24;

export interface ContainedStage {
  /** Uniform 16:9 playfield inside the viewport. */
  stage: ViewSize & { left: number; top: number };
  railLeft: number;
  railRight: number;
  railTop: number;
  railBottom: number;
}

/** Fit a 16:9 stage inside the viewport (pillarbox on wide phones, letterbox if taller). */
export function containStage(view: ViewSize, aspect = GAME_ASPECT): ContainedStage {
  const vw = Math.max(view.width, 1);
  const vh = Math.max(view.height, 1);
  const viewAspect = vw / vh;
  let stageW: number;
  let stageH: number;
  let left: number;
  let top: number;
  if (viewAspect > aspect) {
    stageH = vh;
    stageW = stageH * aspect;
    left = (vw - stageW) / 2;
    top = 0;
  } else {
    stageW = vw;
    stageH = stageW / aspect;
    left = 0;
    top = (vh - stageH) / 2;
  }
  return {
    stage: { width: stageW, height: stageH, left, top },
    railLeft: left,
    railRight: vw - left - stageW,
    railTop: top,
    railBottom: vh - top - stageH,
  };
}


export function displayScale(view: ViewSize, gameW = GAME_WIDTH, gameH = GAME_HEIGHT): DisplayScale {
  return {
    x: view.width / gameW,
    y: view.height / gameH,
  };
}

/**
 * Phaser Scale.NONE + CSS fill uses the inverse of {@link displayScale}:
 * gameX = (clientX - canvasLeft) * (gameWidth / canvasCssWidth).
 */
export function phaserDisplayScale(view: ViewSize, gameW = GAME_WIDTH, gameH = GAME_HEIGHT): DisplayScale {
  return {
    x: gameW / Math.max(view.width, 1),
    y: gameH / Math.max(view.height, 1),
  };
}

/** Map a CSS client point on the canvas into 1920×1080 game space. */
export function clientToGame(
  clientX: number,
  clientY: number,
  canvas: CanvasClientRect,
  gameW = GAME_WIDTH,
  gameH = GAME_HEIGHT,
): { x: number; y: number } {
  const scale = phaserDisplayScale(canvas, gameW, gameH);
  return {
    x: (clientX - canvas.left) * scale.x,
    y: (clientY - canvas.top) * scale.y,
  };
}

/** CSS pixels (safe-area, notches) → 1920×1080 design pixels under NONE + CSS contain. */
export function cssPxToDesign(cssPx: number, axis: "x" | "y", view: ViewSize): number {
  const scale = displayScale(view);
  const factor = axis === "x" ? scale.x : scale.y;
  if (factor <= 0) return 0;
  return cssPx / factor;
}

export function cssPxFromDesign(designPx: number, axis: "x" | "y", view: ViewSize): number {
  const scale = displayScale(view);
  return designPx * (axis === "x" ? scale.x : scale.y);
}

/** Smallest CSS/game factor among popular landscape sizes on one axis. */
export function minDisplayFactor(axis: "x" | "y", views: readonly ViewSize[] = POPULAR_MOBILE_LANDSCAPE): number {
  let min = 1;
  for (const view of views) {
    const scale = displayScale(view);
    const factor = axis === "x" ? scale.x : scale.y;
    if (factor > 0) min = Math.min(min, factor);
  }
  return min;
}

export function minDesignPx(
  cssPx: number,
  axis: "x" | "y",
  views: readonly ViewSize[] = POPULAR_MOBILE_LANDSCAPE,
): number {
  return Math.ceil(cssPx / minDisplayFactor(axis, views));
}

/** Design pixels so a HUD control stays ≥ {@link MIN_CSS_TOUCH_PX} after the worst Y scale. */
export const HUD_TOUCH_MIN_DESIGN = minDesignPx(MIN_CSS_TOUCH_PX, "y");

export function designSafeInset(view: ViewSize, css: SafeInset): SafeInset {
  return {
    left: cssPxToDesign(css.left, "x", view),
    right: cssPxToDesign(css.right, "x", view),
    top: cssPxToDesign(css.top, "y", view),
    bottom: cssPxToDesign(css.bottom, "y", view),
  };
}

function insetFromStyle(style: CSSStyleDeclaration): SafeInset {
  const read = (name: string): number => {
    const raw = style.getPropertyValue(name).trim();
    const n = Number.parseFloat(raw);
    return Number.isFinite(n) ? n : 0;
  };
  return {
    left: read("--kindling-safe-left"),
    right: read("--kindling-safe-right"),
    top: read("--kindling-safe-top"),
    bottom: read("--kindling-safe-bottom"),
  };
}

function insetHasValue(inset: SafeInset): boolean {
  return inset.left !== 0 || inset.right !== 0 || inset.top !== 0 || inset.bottom !== 0;
}

export function readCssSafeArea(root: HTMLElement | null): SafeInset {
  if (typeof getComputedStyle !== "function") {
    return { left: 0, right: 0, top: 0, bottom: 0 };
  }
  if (root) {
    const fromRoot = insetFromStyle(getComputedStyle(root));
    if (insetHasValue(fromRoot)) return fromRoot;
  }
  const docEl = typeof document !== "undefined" ? document.documentElement : null;
  if (docEl && docEl !== root) return insetFromStyle(getComputedStyle(docEl));
  return { left: 0, right: 0, top: 0, bottom: 0 };
}

export function viewFromScale(scale: { width?: number; height?: number; canvas?: { clientWidth?: number; clientHeight?: number } }): ViewSize {
  return {
    width: scale.canvas?.clientWidth || scale.width || GAME_WIDTH,
    height: scale.canvas?.clientHeight || scale.height || GAME_HEIGHT,
  };
}

export function fillsParent(view: ViewSize, parent: ViewSize, epsilon = 1): boolean {
  return Math.abs(view.width - parent.width) <= epsilon && Math.abs(view.height - parent.height) <= epsilon;
}

/** Uniform CSS-contain scale: stageCssWidth / designWidth (≈ stageCssHeight / designHeight). */
export function stageContainScale(stage: ViewSize, designW = GAME_WIDTH): number {
  return stage.width / Math.max(designW, 1);
}

/**
 * Latest shell contain scale. Defaults to 1 (desktop artboard) until
 * {@link setStageContainScale} runs from `installMobileShell`.
 */
let currentStageContainScale = 1;

export function getStageContainScale(): number {
  return currentStageContainScale;
}

export function setStageContainScale(scale: number): void {
  currentStageContainScale = Number.isFinite(scale) && scale > 0 ? scale : 1;
}

/** Phaser Scale.NONE never fires RESIZE; shell emits this when CSS fill or safe-area changes. */
export const VIEWFIT_EVENT = "kindling-viewfit";

const VIEWFIT_REG = "kindlingViewfit";

function viewfitSignature(view: ViewSize, inset: SafeInset): string {
  return `${Math.round(view.width)}x${Math.round(view.height)}:${inset.left},${inset.right},${inset.top},${inset.bottom}`;
}

export function notifyViewfit(
  bus: {
    registry: { get: (key: string) => unknown; set: (key: string, value: string) => unknown };
    events: { emit: (event: string) => unknown };
  },
  view: ViewSize,
  inset: SafeInset,
): boolean {
  const key = viewfitSignature(view, inset);
  if (bus.registry.get(VIEWFIT_REG) === key) return false;
  bus.registry.set(VIEWFIT_REG, key);
  bus.events.emit(VIEWFIT_EVENT);
  return true;
}
