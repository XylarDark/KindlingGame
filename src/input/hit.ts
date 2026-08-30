import Phaser from "phaser";
import { itemHitRect, itemHitSize, type HitSized } from "./hitRect";

export { itemHitRect, itemHitSize };

export function enableItemHit(obj: Phaser.GameObjects.GameObject): void {
  const { width, height } = itemHitSize(obj as HitSized);
  const box = itemHitRect(width, height);
  obj.setInteractive({
    useHandCursor: true,
    hitArea: new Phaser.Geom.Rectangle(box.x, box.y, box.width, box.height),
    hitAreaCallback: Phaser.Geom.Rectangle.Contains,
  });
}

/** Call after setText / setDisplaySize / setScale when width/height can change. */
export function syncItemHit(obj: Phaser.GameObjects.GameObject): void {
  const input = obj.input;
  if (!input?.hitArea || typeof input.hitArea.setTo !== "function") return;
  const { width, height } = itemHitSize(obj as HitSized);
  const box = itemHitRect(width, height);
  input.hitArea.setTo(box.x, box.y, box.width, box.height);
}
