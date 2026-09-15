import type Phaser from "phaser";

const RAW_HISTORY_MAX = 120;

const rawHistory: number[] = [];
let windowPlaquePump = 0;
let windowSetText = 0;
let windowTextUpload = 0;
let windowStartMs = 0;

export type PerfProbeSample = {
  actualFps: number;
  p95RawDeltaMs: number;
  plaquePumpCount: number;
  setTextCount: number;
  /** Canvas Text raster uploads (polishText / updateText) — atlas ink skips these. */
  textUploadCount: number;
  /** Live canvas Text with typekit vs role atlas BitmapText in the active scene tree. */
  canvasTextCount: number;
  atlasTextCount: number;
  windowMs: number;
  sceneKey: string | null;
};

export function resetPerfProbeWindow(nowMs = performance.now()): void {
  windowPlaquePump = 0;
  windowSetText = 0;
  windowTextUpload = 0;
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

export function notePerfTextUpload(): void {
  windowTextUpload += 1;
}

export function notePerfPlaquePump(): void {
  windowPlaquePump += 1;
}

function countInkBackends(game: Phaser.Game): { canvasTextCount: number; atlasTextCount: number } {
  let canvasTextCount = 0;
  let atlasTextCount = 0;
  const TYPEKIT_DATA = "kindlingTypekit";
  const TYPE_ATLAS_INK = "kindlingAtlasInk";

  const visit = (obj: Phaser.GameObjects.GameObject): void => {
    const go = obj as Phaser.GameObjects.GameObject & {
      getData?: (key: string) => unknown;
      list?: Phaser.GameObjects.GameObject[];
      type?: string;
    };
    if (typeof go.getData !== "function") return;
    if (go.type === "BitmapText" && go.getData(TYPE_ATLAS_INK)) {
      atlasTextCount += 1;
      return;
    }
    if (go.type === "Text" && go.getData(TYPEKIT_DATA)) {
      canvasTextCount += 1;
    }
    if (go.list) {
      for (const child of go.list) visit(child);
    }
  };

  for (const scene of game.scene.getScenes(true)) {
    scene.children.each((obj) => visit(obj as Phaser.GameObjects.GameObject));
  }
  return { canvasTextCount, atlasTextCount };
}

export function samplePerfProbe(game: Phaser.Game, nowMs = performance.now()): PerfProbeSample {
  const sorted = [...rawHistory].sort((a, b) => a - b);
  const p95Idx = sorted.length > 0 ? Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95)) : 0;
  const active = game.scene
    .getScenes(true)
    .find((scene) => scene.sys.isActive() && !scene.sys.isSleeping());
  const sceneKey = active?.sys.settings.key;
  const { canvasTextCount, atlasTextCount } = countInkBackends(game);
  return {
    actualFps: Math.round(game.loop.actualFps * 10) / 10,
    p95RawDeltaMs: Math.round((sorted[p95Idx] ?? 0) * 10) / 10,
    plaquePumpCount: windowPlaquePump,
    setTextCount: windowSetText,
    textUploadCount: windowTextUpload,
    canvasTextCount,
    atlasTextCount,
    windowMs: Math.round(nowMs - windowStartMs),
    sceneKey: typeof sceneKey === "string" ? sceneKey : null,
  };
}

export function resetPerfProbeForTests(): void {
  rawHistory.length = 0;
  windowPlaquePump = 0;
  windowSetText = 0;
  windowTextUpload = 0;
  windowStartMs = 0;
}
