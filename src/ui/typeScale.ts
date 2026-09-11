/**
 * Role-based type tokens — one closed size per UI role. Call sites pass a token,
 * not ad-hoc scaleMsgPx(25) seeds. MSG_SCALE / MOBILE_TEXT_SCALE fold in here once.
 */
import { getStageContainScale } from "./viewFit";
import {
  HUD_COG_CAPTION_PX,
  HUD_READOUT_PX,
  HUD_SCORE_PX,
  scaleChromePx,
  scaleMsgPx,
} from "./theme";

export type TypeRole = "hudTitle" | "hudBody" | "hudSmall" | "speech" | "pin";

const ROLE_BASE: Record<TypeRole, number> = {
  /** SCORE label, clock readout. */
  hudTitle: HUD_SCORE_PX,
  /** Cover, toast, phone status, door prompt, drive pin copy. */
  hudBody: 20,
  /** Settings caption, queue badge. */
  hudSmall: HUD_COG_CAPTION_PX,
  /** Shop speech bubbles (walk-in, key lead, driver). */
  speech: 19.2,
  /** Destination pin — same step as hudBody. */
  pin: 20,
};

/** Resolve a role token to a CSS fontSize string at the current contain scale. */
export function typeRolePx(role: TypeRole, stageScale = getStageContainScale()): string {
  switch (role) {
    case "hudTitle":
      return scaleChromePx(HUD_SCORE_PX, stageScale);
    case "hudSmall":
      return scaleChromePx(ROLE_BASE.hudSmall, stageScale);
    case "hudBody":
    case "pin":
      return scaleMsgPx(ROLE_BASE.hudBody, stageScale);
    case "speech":
      return scaleMsgPx(ROLE_BASE.speech, stageScale);
    default: {
      const _exhaustive: never = role;
      return _exhaustive;
    }
  }
}

/** Clock uses the title tier but one step smaller than SCORE digits. */
export function typeClockPx(stageScale = getStageContainScale()): string {
  return scaleChromePx(HUD_READOUT_PX, stageScale);
}

/** Fixed-size roles skip clamp-fit binary search in typekit. */
export function isFixedTypeRole(role: TypeRole): boolean {
  return role === "hudTitle" || role === "hudBody" || role === "hudSmall" || role === "pin";
}
