/** Kindling UI face — Inter is loaded in main.ts before the game boots. */
export const UI_FONT = 'Inter, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

const MIN_RES = 2;
const MAX_RES = 8;
/** Phone PWAs: cap backing store — keep ≤2 so DPR 3 does not upload a 6× canvas. */
export const COARSE_MAX_RES = 2;

export type TypeResolutionInput = {
  dpr?: number;
  /** Canvas CSS width / game width (NONE + CSS stretch). */
  fit?: number;
  /** Display scale on the Text object itself. */
  objectScale?: number;
};

export type ScaleFitInput = {
  gameSize?: { width: number };
  canvas?: { clientWidth: number };
  displaySize?: { width: number };
};

export function currentDpr(): number {
  if (typeof window === "undefined") return 2;
  return window.devicePixelRatio || 1;
}

export function isCoarsePointer(): boolean {
  if (typeof globalThis.matchMedia !== "function") return false;
  return globalThis.matchMedia("(pointer: coarse)").matches;
}

export function displayFit(scale?: ScaleFitInput): number {
  if (!scale) return 1;
  const gameW = scale.gameSize?.width || 1;
  const displayW = scale.canvas?.clientWidth || scale.displaySize?.width || gameW;
  return displayW / gameW;
}

/**
 * Backing-store multiplier so canvas text stays sharp under DPR, CSS stretch,
 * and object scale. Pixel-art NEAREST on the game does not apply here.
 */
export function typeResolution(input: TypeResolutionInput = {}): number {
  const dpr = input.dpr ?? 1;
  const fit = input.fit ?? 1;
  const objectScale = Math.max(1, input.objectScale ?? 1);
  const needed = dpr * Math.max(fit, 1) * objectScale;
  const coarse = isCoarsePointer();
  // Coarse: no ceil(needed * 2) — cap at COARSE_MAX_RES directly.
  let res = coarse
    ? Math.max(MIN_RES, Math.min(COARSE_MAX_RES, Math.ceil(needed)))
    : Math.max(MIN_RES, Math.min(MAX_RES, Math.ceil(needed * 2)));
  if (coarse) res = Math.min(res, COARSE_MAX_RES);
  return res;
}

/** Cached Phaser text metrics per font+size token — avoids re-measuring Inter at each label. */
const tokenMetricsCache = new Map<string, Phaser.Types.GameObjects.Text.TextMetrics>();

export function metricsCacheKey(fontFamily: string, fontSizePx: number): string {
  return `${fontFamily}:${fontSizePx}`;
}

export function readTokenMetrics(
  text: Phaser.GameObjects.Text,
  fontSizePx: number,
): Phaser.Types.GameObjects.Text.TextMetrics {
  const key = metricsCacheKey(text.style.fontFamily, fontSizePx);
  const hit = tokenMetricsCache.get(key);
  if (hit) return hit;
  text.setFontSize(fontSizePx);
  text.updateText();
  const metrics = text.getTextMetrics();
  tokenMetricsCache.set(key, metrics);
  return metrics;
}

export function warmTokenMetrics(
  text: Phaser.GameObjects.Text,
  fontSizePx: number,
): Phaser.Types.GameObjects.Text.TextMetrics {
  return readTokenMetrics(text, fontSizePx);
}

export function clearTokenMetricsCache(): void {
  tokenMetricsCache.clear();
}

export function parseFontPx(size: string | number | undefined): number {
  if (typeof size === "number" && Number.isFinite(size)) return size;
  if (typeof size === "string") {
    const n = Number.parseFloat(size);
    if (Number.isFinite(n)) return n;
  }
  return 18;
}

/** True when the visible letters are all caps (HUD marks, buttons, SCORE). */
export function isAllCaps(content: string): boolean {
  const letters = content.replace(/[^A-Za-z]/g, "");
  return letters.length >= 2 && letters === letters.toUpperCase();
}

/** Open tracking so all-caps Inter does not look cramped. ~0.08em. */
export function capsTracking(px: number): number {
  return Math.max(1, Math.round(px * 0.08));
}

/** Hairline ink outline for cream/neon type sitting on the scene. */
export function overlayStroke(px: number): { stroke: string; strokeThickness: number } {
  return { stroke: "#140e0a", strokeThickness: Math.max(1, Math.round(px * 0.07)) };
}
