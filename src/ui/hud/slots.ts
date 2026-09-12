import { GAME_HEIGHT, GAME_WIDTH } from "../../sim/constants";
import type { SafeInset } from "../viewFit";

/** Minimum gap between any two plaque AABBs in design space. */
export const CHIP_GAP = 10;

/** Gutter inside the crop-aware safe inset for HUD slot anchors. */
export const SLOT_GUTTER = 12;

/**
 * Named HUD / shop / door / title slots (design 1920×1080, then {@link designHudInset} +
 * {@link SLOT_GUTTER}).
 *
 * | id            | Anchor                         | Who |
 * |---------------|--------------------------------|-----|
 * | scoreClock    | COUNTER_SIGN in shop; top safe bar on drive/door | SCORE caption + value + clock |
 * | cover         | Under scoreClock, maxWidth capped from shop mark | shopCover while driving keyLead |
 * | doorTitle     | Same slot as cover; mutually exclusive | Door stop line on HUD |
 * | toast         | Bottom-center above home-indicator inset | One line |
 * | settings      | Bottom-right; cog + caption as one AABB | Settings chrome |
 * | phone         | Above settings or left of it | Drive call UI |
 * | pad           | Bottom-left thumb zone | Drive stick label |
 * | titleCards    | Top 55% | How-to 1–3; Title owns; HUD hidden |
 * | titleCta      | Below cards, center | OPEN THE SHOP |
 * | speech-*      | Beside settled customer | Shop walk-in bubbles |
 * | leadBubble    | Above key-lead head | Shop fetch |
 * | driverBubble  | Above seated driver | Shop |
 * | tvCallout     | Above targeted TV | Shop strain hint |
 * | drivePin      | Screen-projected above pin | Hud drive |
 * | driveVan      | Screen-projected above van | Hud drive |
 * | driveShop     | Screen-projected on lot | Hud drive |
 * | doorPrompt    | Above customer head | Door doorstep |
 * | scorePop      | Next to scoring actor | Hud flash |
 */
export type ChipSlotId =
  | "scoreClock"
  | "cover"
  | "doorTitle"
  | "toast"
  | "settings"
  | "phone"
  | "pad"
  | "titleCards"
  | "titleCta"
  | "leadBubble"
  | "driverBubble"
  | "tvCallout"
  | "drivePin"
  | "driveVan"
  | "driveShop"
  | "doorPrompt"
  | "scorePop"
  | `speech-${string}`;

/** Higher number wins placement disputes (placed first, others dodge). */
export const CHIP_PRIORITY: Record<string, number> = {
  titleCta: 100,
  settings: 90,
  scoreClock: 80,
  doorPrompt: 75,
  cover: 70,
  doorTitle: 70,
  toast: 60,
  phone: 55,
  leadBubble: 45,
  driverBubble: 44,
  tvCallout: 43,
  drivePin: 35,
  driveVan: 34,
  driveShop: 33,
  scorePop: 20,
  pad: 15,
};

export function speechSlotId(orderId: string): `speech-${string}` {
  return `speech-${orderId}`;
}

export function chipPriority(id: ChipSlotId | string): number {
  if (id in CHIP_PRIORITY) return CHIP_PRIORITY[id]!;
  if (id.startsWith("speech-")) {
    const idx = Number.parseInt(id.slice("speech-".length), 10);
    return Number.isFinite(idx) ? 50 - idx : 40;
  }
  return 10;
}

export interface ChipSafeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** Crop-aware playable rect with {@link SLOT_GUTTER} padding. */
export function chipSafeRect(inset: SafeInset, viewW = GAME_WIDTH, viewH = GAME_HEIGHT): ChipSafeRect {
  const g = SLOT_GUTTER;
  return {
    left: inset.left + g,
    top: inset.top + g,
    right: viewW - inset.right - g,
    bottom: viewH - inset.bottom - g,
  };
}
