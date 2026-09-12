import Phaser from "phaser";
import {
  setSignCopy,
  setSignPosition,
  signPlaqueExtents,
  syncSignPlaque,
} from "../signText";
import { chipPriority, chipSafeRect } from "./slots";
import type { SafeInset } from "../viewFit";
import { ChipPlacer, unionAabb, type ChipAabb } from "./chipCollision";

export {
  ChipPlacer,
  chipPlaqueAabb,
  expandAabb,
  aabbOverlap,
  clampChipHost,
  unionAabb,
  type ChipAabb,
} from "./chipCollision";

const FRAME_KEY = "kindlingChipPlacer";

interface FrameState {
  frame: number;
  placer: ChipPlacer;
}

export function beginChipFrame(
  game: Phaser.Game,
  inset: SafeInset,
  viewW: number,
  viewH: number,
): ChipPlacer {
  const frame = game.loop.frame;
  const prev = game.registry.get(FRAME_KEY) as FrameState | undefined;
  if (prev?.frame === frame) return prev.placer;
  const placer = new ChipPlacer(chipSafeRect(inset, viewW, viewH), viewW, viewH);
  game.registry.set(FRAME_KEY, { frame, placer });
  return placer;
}

export function chipPlacerFor(game: Phaser.Game): ChipPlacer | undefined {
  const state = game.registry.get(FRAME_KEY) as FrameState | undefined;
  if (!state || state.frame !== game.loop.frame) return undefined;
  return state.placer;
}

/** Plain Text readout bounds (no plaque) for the scoreClock slot blocker. */
export function textInkAabb(text: Phaser.GameObjects.Text): ChipAabb {
  const w = text.width;
  const h = text.height;
  const left = text.x - w * text.originX;
  const top = text.y - h * text.originY;
  return { left, top, right: left + w, bottom: top + h };
}

/**
 * Place a sign chip at preferred position, dodging higher-priority plaques.
 * Returns false and clears copy when no non-overlapping position fits.
 */
export function placeChip(
  placer: ChipPlacer,
  id: string,
  host: Phaser.GameObjects.Text,
  preferredX: number,
  preferredY: number,
  priority = chipPriority(id),
  headHang = false,
): boolean {
  const copy = String(host.text ?? "").trim();
  if (!host.visible || copy.length === 0) return false;
  syncSignPlaque(host);
  const plaque = signPlaqueExtents(host);
  const slot = placer.findOpenSlot(preferredX, preferredY, plaque, priority, id, headHang);
  if (!slot) {
    setSignCopy(host, "");
    return false;
  }
  setSignPosition(host, slot.x, slot.y);
  return true;
}
