import type Phaser from "phaser";

const RAW_HISTORY_MAX = 120;

const rawHistory: number[] = [];
let windowPlaquePump = 0;
let windowSetText = 0;
let windowStartMs = 0;

export type PerfProbeSample = {
  actualFps: number;
  p95RawDeltaMs: number;
  plaquePumpCount: number;
  setTextCount: number;
  windowMs: number;
  sceneKey: string | null;
};

export function resetPerfProbeWindow(nowMs = performance.now()): void {
  windowPlaquePump = 0;
  windowSetText = 0;
  windowStartMs = nowMs;
  rawHistory.length = 0;
}

export function notePerfRawDelta(rawDeltaMs: number): void {
  const ms = Math.max(0, rawDeltaMs);
  rawHistory.push(ms);
  if (rawHistory.length > RAW_HISTORY_MAX) rawHistory.shift();
}

export function notePerfSetText(): void {
  windowSetText += 1;
}

export function notePerfPlaquePump(): void {
  windowPlaquePump += 1;
}

export function samplePerfProbe(game: Phaser.Game, nowMs = performance.now()): PerfProbeSample {
  const sorted = [...rawHistory].sort((a, b) => a - b);
  const p95Idx = sorted.length > 0 ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : 0;
  const active = game.scene
    .getScenes(true)
    .find((scene) => scene.sys.isActive() && !scene.sys.isSleeping());
  const sceneKey = active?.sys.settings.key;
  return {
    actualFps: Math.round(game.loop.actualFps * 10) / 10,
    p95RawDeltaMs: Math.round((sorted[p95Idx] ?? 0) * 10) / 10,
    plaquePumpCount: windowPlaquePump,
    setTextCount: windowSetText,
    windowMs: Math.round(nowMs - windowStartMs),
    sceneKey: typeof sceneKey === "string" ? sceneKey : null,
  };
}

export function resetPerfProbeForTests(): void {
  rawHistory.length = 0;
  windowPlaquePump = 0;
  windowSetText = 0;
  windowStartMs = 0;
}
