import Phaser from "phaser";

/** One logical pixel in canvas space. TILE 64 = 16 logical pixels. */
export const PX = 4;

type G = Phaser.GameObjects.Graphics;

export function px(n: number): number {
  return n * PX;
}

export function snap(n: number): number {
  return Math.round(n / PX) * PX;
}

export function fill(g: G, x: number, y: number, w: number, h: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(snap(x), snap(y), Math.max(PX, snap(w) || PX), Math.max(PX, snap(h) || PX));
}

/** Fill a 1× logical-pixel rect, scaled to canvas. */
export function cells(g: G, lx: number, ly: number, lw: number, lh: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(lx * PX, ly * PX, lw * PX, lh * PX);
}
