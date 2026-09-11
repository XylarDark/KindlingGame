import Phaser from "phaser";
import { getClockMode, getClockStats, wantsSmoothStep } from "../sim/kindlingClock";
import { getRenderBudget, getRenderResizeCount } from "./renderBudget";

const STORAGE_KEY = "kindlingMeter";

export function feelMeterEnabled(): boolean {
  if (typeof globalThis.location !== "undefined") {
    const q = new URLSearchParams(globalThis.location.search).get("meter");
    if (q === "1" || q === "true") return true;
    if (q === "0" || q === "false") return false;
  }
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export type FeelMeterSample = {
  actualFps: number;
  rawDeltaMs: number;
  sceneDeltaMs: number;
  smoothStep: boolean;
  clockMode: string;
  fixedSteps: number;
  backlogMs: number;
  p95FrameMs: number;
  tier: string;
  renderScale: number;
  resizeCount: number;
};

let overlay: HTMLDivElement | null = null;

export function ensureFeelMeter(game: Phaser.Game): HTMLDivElement | null {
  if (!feelMeterEnabled()) return null;
  if (overlay?.isConnected) return overlay;
  overlay = document.createElement("div");
  overlay.id = "kindling-feel-meter";
  Object.assign(overlay.style, {
    position: "fixed",
    top: "4px",
    left: "4px",
    zIndex: "99999",
    font: "11px/1.35 ui-monospace, monospace",
    color: "#e8ffe8",
    background: "rgba(8,12,20,0.82)",
    padding: "6px 8px",
    borderRadius: "4px",
    pointerEvents: "none",
    whiteSpace: "pre",
    maxWidth: "min(92vw, 360px)",
  });
  document.body.appendChild(overlay);
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    overlay?.remove();
    overlay = null;
  });
  return overlay;
}

export function updateFeelMeter(
  game: Phaser.Game,
  deltas: { rawDeltaMs: number; sceneDeltaMs: number },
): FeelMeterSample | null {
  const el = ensureFeelMeter(game);
  if (!el) return null;
  const clock = getClockStats();
  const budget = getRenderBudget();
  const round = (n: number) => Math.round(n * 10) / 10;
  const sample: FeelMeterSample = {
    actualFps: round(game.loop.actualFps),
    rawDeltaMs: round(deltas.rawDeltaMs),
    sceneDeltaMs: round(deltas.sceneDeltaMs),
    smoothStep: wantsSmoothStep(),
    clockMode: getClockMode(),
    fixedSteps: clock.fixedSteps,
    backlogMs: round(clock.backlogMs),
    p95FrameMs: round(clock.p95FrameMs),
    tier: budget.tier,
    renderScale: budget.renderScale,
    resizeCount: getRenderResizeCount(),
  };
  el.textContent = [
    `fps ${sample.actualFps}  rawΔ ${sample.rawDeltaMs}ms  sceneΔ ${sample.sceneDeltaMs}ms  p95 ${sample.p95FrameMs}ms`,
    `clock ${sample.clockMode}  smoothStep ${sample.smoothStep ? "on" : "off"}  step ${clock.fixedStepMs.toFixed(2)}ms  steps ${sample.fixedSteps}  backlog ${sample.backlogMs}ms`,
    `tier ${sample.tier}  scale ${sample.renderScale}  resize× ${sample.resizeCount}`,
  ].join("\n");
  return sample;
}
