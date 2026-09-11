/** Grow tap targets ~10% without changing painted sprite size. */
export const HIT_PAD_SCALE = 1.1;

/** Texture-space hit: Phaser then adds displayOrigin and applies scale. */
export function itemHitRect(width: number, height: number, padScale = HIT_PAD_SCALE): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const w = Math.max(1, width);
  const h = Math.max(1, height);
  const pw = w * padScale;
  const ph = h * padScale;
  return {
    x: (w - pw) / 2,
    y: (h - ph) / 2,
    width: pw,
    height: ph,
  };
}

export type HitSized = {
  width?: number;
  height?: number;
  displayWidth?: number;
  displayHeight?: number;
  frame?: { realWidth?: number; realHeight?: number; width?: number; height?: number };
};

export function itemHitSize(obj: HitSized): { width: number; height: number } {
  const dw = obj.displayWidth ?? obj.width;
  const dh = obj.displayHeight ?? obj.height;
  if (dw && dh) return { width: dw, height: dh };
  const frame = obj.frame;
  if (frame) {
    return {
      width: frame.realWidth ?? frame.width ?? 1,
      height: frame.realHeight ?? frame.height ?? 1,
    };
  }
  return { width: 1, height: 1 };
}
