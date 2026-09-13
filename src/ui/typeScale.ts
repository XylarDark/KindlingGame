/**
 * Role-based type tokens — one closed size per UI role. Call sites pass a token,
 * not ad-hoc scaleMsgPx(25) seeds. MSG_SCALE / MOBILE_TEXT_SCALE fold in here once.
 */
import {
  designPxForMinCss,
  HUD_CHROME_MIN_CSS_PX,
  HUD_COG_CAPTION_PX,
  HUD_READOUT_PX,
  HUD_SCORE_PX,
  MOBILE_TEXT_SCALE,
  MSG_MIN_CSS_PX,
  MSG_SCALE,
  shouldApplyMobileTextRamp,
  type MobileTextHints,
} from "./theme";
import { getStageContainScale } from "./viewFit";

export type TypeRole = "hudTitle" | "hudBody" | "hudSmall" | "speech";

/** Design px at contain-scale 1 — {@link MSG_SCALE} applies once inside {@link typeRolePx}. */
const ROLE_BASE: Record<TypeRole, number> = {
  /** SCORE label, clock readout tier, ORDERS tablet seed. */
  hudTitle: HUD_SCORE_PX,
  /** Cover, toast, phone status, door prompt, drive pin / van copy. */
  hudBody: 20,
  /** Settings caption, queue badge, compact HUD chips. */
  hudSmall: HUD_COG_CAPTION_PX,
  /** Shop speech bubbles (walk-in, key lead, driver). */
  speech: 19.2,
};

const CLOCK_BASE_PX = HUD_READOUT_PX;

/** Default plaque padding — counter chips, toast, settings. */
export const PAD_DEFAULT = { x: 27, y: 23 } as const;
/** Compact plaque padding — drive / door callouts. */
export const PAD_COMPACT = { x: 23, y: 21 } as const;

export type PadVariant = "default" | "compact";

export function padForVariant(variant: PadVariant = "default"): { x: number; y: number } {
  return variant === "compact" ? PAD_COMPACT : PAD_DEFAULT;
}

/**
 * Title welcome / how-to — fixed intro sizes (2× readability), not multiplied onto HUD roles.
 * Pre-bump baselines × 2: welcome title 36.3, hint 21.8; how-to heading 20, body 16.
 */
export const TYPE_INTRO = {
  welcomeTitle: 72.6,
  welcomeHint: 43.6,
  howtoHeading: 40,
  howtoBody: 32,
  howtoCaption: 26,
  cardLift: 88,
} as const;

function roundPx(n: number): string {
  return `${Math.round(n * 10000) / 10000}px`;
}

function readMobileHints(): MobileTextHints {
  const coarse =
    typeof globalThis.matchMedia === "function"
      ? (globalThis.matchMedia("(pointer: coarse)").matches ?? false)
      : false;
  const view = globalThis.visualViewport;
  const width = Math.round(view?.width ?? globalThis.innerWidth ?? 1920);
  return { coarsePointer: coarse, viewportCssWidth: width };
}

function resolveMobile(stageScale: number, hints?: MobileTextHints): boolean {
  return shouldApplyMobileTextRamp(stageScale, hints ?? readMobileHints());
}

function chromeScale(mobile: boolean): number {
  return mobile ? MOBILE_TEXT_SCALE : 1;
}

function messageScale(mobile: boolean): number {
  return MSG_SCALE * (mobile ? MOBILE_TEXT_SCALE : 1);
}

function roleTier(role: TypeRole): "chrome" | "message" {
  return role === "hudTitle" || role === "hudSmall" ? "chrome" : "message";
}

function scaleDesignPx(base: number, role: TypeRole, stageScale: number, hints?: MobileTextHints): number {
  const mobile = resolveMobile(stageScale, hints);
  const factor = roleTier(role) === "chrome" ? chromeScale(mobile) : messageScale(mobile);
  const scaled = base * factor;
  const minCss = roleTier(role) === "chrome" ? HUD_CHROME_MIN_CSS_PX : MSG_MIN_CSS_PX;
  return Math.max(scaled, designPxForMinCss(minCss, stageScale));
}

/** Resolve a role token to a CSS fontSize string at the current contain scale. */
export function typeRolePx(role: TypeRole, stageScale = getStageContainScale(), hints?: MobileTextHints): string {
  return roundPx(scaleDesignPx(ROLE_BASE[role], role, stageScale, hints));
}

/** Clock uses the title tier but one step smaller than SCORE digits. */
export function typeClockPx(stageScale = getStageContainScale(), hints?: MobileTextHints): string {
  const mobile = resolveMobile(stageScale, hints);
  const scaled = CLOCK_BASE_PX * chromeScale(mobile);
  const floored = Math.max(scaled, designPxForMinCss(HUD_CHROME_MIN_CSS_PX, stageScale));
  return roundPx(floored);
}

/** Title intro screens — baked sizes, not stacked on HUD role tokens. */
export function typeIntroPx(px: number): string {
  return roundPx(px);
}

/** Title intro layout — 2× design-space dimensions (card size, gaps, insets). */
export function typeIntroN(n: number): number {
  return Math.round(n * 2);
}

/** Scale a design-space box edge for message-tier wrap boxes (toast, speech, door prompt). */
export function typeRoleBox(
  n: number,
  role: TypeRole = "hudBody",
  stageScale = getStageContainScale(),
  hints?: MobileTextHints,
): number {
  const mobile = resolveMobile(stageScale, hints);
  const factor = roleTier(role) === "chrome" ? chromeScale(mobile) : messageScale(mobile);
  return Math.round(n * factor);
}

/** Fixed-size roles skip clamp-fit binary search in typekit (wrap-only when maxWidth is set). */
export function isFixedTypeRole(role: TypeRole): boolean {
  return role === "hudTitle" || role === "hudBody" || role === "hudSmall";
}

/** Closed role count — guards against drift. */
export const TYPE_ROLE_COUNT = 4;
