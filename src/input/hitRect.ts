/** Texture-space hit: Phaser then adds displayOrigin and applies scale. */
export function itemHitRect(width: number, height: number): { x: number; y: number; width: number; height: number } {
  return { x: 0, y: 0, width: Math.max(1, width), height: Math.max(1, height) };
}

export type HitSized = {
  width?: number;
  height?: number;
  frame?: { realWidth?: number; realHeight?: number; width?: number; height?: number };
};

export function itemHitSize(obj: HitSized): { width: number; height: number } {
  if (obj.width && obj.height) return { width: obj.width, height: obj.height };
  const frame = obj.frame;
  if (frame) {
    return {
      width: frame.realWidth ?? frame.width ?? 1,
      height: frame.realHeight ?? frame.height ?? 1,
    };
  }
  return { width: 1, height: 1 };
}
