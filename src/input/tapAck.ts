import Phaser from "phaser";

/** Lightweight same-frame press feedback — scale bump, no tweens or sim work. */
export function ackTap(target: Phaser.GameObjects.Components.Transform & { scaleX?: number; scaleY?: number }): void {
  const sx = target.scaleX ?? 1;
  const sy = target.scaleY ?? 1;
  target.setScale(sx * 1.12, sy * 1.12);
}

/** Restore scale after ack — call on pointerup or next frame paint. */
export function releaseTapAck(
  target: Phaser.GameObjects.Components.Transform,
  baseX: number,
  baseY: number,
): void {
  target.setScale(baseX, baseY);
}
