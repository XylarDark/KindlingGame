import Phaser from "phaser";
import type { ChipAabb } from "./hud/chipCollision";
import { leadSpeechPlaqueCenterFromExtents } from "./plaquePlacement";
import { signPlaqueExtents, signPlaqueMid, signYAbove, syncSignPlaque } from "./signText";

/** Phaser adapter — preferred plaque center above a model head. */
export function speechPlaqueAboveHead(
  chip: Phaser.GameObjects.Text,
  centerX: number,
  headTopY: number,
  gap = 14,
): { x: number; y: number } {
  syncSignPlaque(chip);
  const mid = signPlaqueMid(chip);
  const hostY = signYAbove(chip, headTopY, gap);
  return { x: centerX, y: hostY + mid.midY };
}

/** Phaser adapter — key-lead band between head top and TV row bottom. */
export function leadSpeechPlaqueCenter(
  chip: Phaser.GameObjects.Text,
  centerX: number,
  headTopY: number,
  tvBottomY: number,
  gap = 14,
): { x: number; y: number } {
  syncSignPlaque(chip);
  const ext = signPlaqueExtents(chip);
  return leadSpeechPlaqueCenterFromExtents(ext, centerX, headTopY, tvBottomY, gap);
}

/** Bottom-anchored person sprite head top without getBounds(). */
export function modelHeadTop(model: Phaser.GameObjects.Image): number {
  return model.y - model.displayHeight * model.originY;
}

/** Bottom-anchored sprite body AABB without getBounds(). */
export function spriteBodyAabb(sprite: Phaser.GameObjects.Image): ChipAabb {
  const w = sprite.displayWidth;
  const h = sprite.displayHeight;
  const left = sprite.x - w * sprite.originX;
  const top = sprite.y - h * sprite.originY;
  return { left, top, right: left + w, bottom: top + h };
}
