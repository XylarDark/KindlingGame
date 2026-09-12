import Phaser from "phaser";
import type { ChipAabb } from "./hud/chipCollision";

const STORAGE_KEY = "kindlingLayoutDebug";

export function layoutDebugEnabled(): boolean {
  if (typeof globalThis.location !== "undefined") {
    const q = new URLSearchParams(globalThis.location.search).get("layoutDebug");
    if (q === "1" || q === "true") return true;
    if (q === "0" || q === "false") return false;
  }
  try {
    return globalThis.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export interface LayoutDebugLayer {
  label: string;
  aabb: ChipAabb;
  /** 0xRRGGBB */
  color: number;
  fillAlpha?: number;
  strokeAlpha?: number;
}

export function paintLayoutDebug(gfx: Phaser.GameObjects.Graphics, layers: readonly LayoutDebugLayer[]): void {
  gfx.clear();
  for (const layer of layers) {
    const { aabb, color, fillAlpha = 0.12, strokeAlpha = 0.85 } = layer;
    const w = aabb.right - aabb.left;
    const h = aabb.bottom - aabb.top;
    gfx.fillStyle(color, fillAlpha);
    gfx.fillRect(aabb.left, aabb.top, w, h);
    gfx.lineStyle(2, color, strokeAlpha);
    gfx.strokeRect(aabb.left, aabb.top, w, h);
  }
}
