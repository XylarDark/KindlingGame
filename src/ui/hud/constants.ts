import {
  PHONE_APP_CELLS,
  PHONE_CHASSIS_CELLS,
  PHONE_PX,
  PHONE_SCALE,
  PHONE_TEX,
  phoneDesignRect,
} from "../../art/phoneArt";
import { PORTRAIT_H, PORTRAIT_W } from "../../art/peopleSize";
import { fitCityPanel } from "../../maps/cityMinimap";
import { Color } from "../theme";

/** Corner fallback keeps clear of the ceiling band on the road and at doors. */
export const HUD_CORNER_TOP = 76;
/** Score row on drive/shop — below ID dim (24) and panel (25). */
export const HUD_READOUT_DEPTH = 20;
/** Door porch chrome — above ID overlay so score + status stay visible. */
export const HUD_DOOR_READOUT_DEPTH = 28;
export const HUD_SIGN_GAP = 28;
export const HUD_SCORE_GAP = 16;
/** Reused score flash labels — avoids per-flash addSignText PRE_RENDER listener churn. */
export const SCORE_POP_POOL = 3;
/** Score plate punch — half the prior pace so the tally reads without rushing. */
export const SCORE_POP_SCALE_MS = 560;
export const SCORE_POP_RISE_MS = 1800;

/**
 * No chip behind the readouts, so the ink outline is what separates them from
 * both the bright shop wall and the night street — heavier than a hairline.
 */
export function readoutOutline(px: number): { stroke: string; strokeThickness: number } {
  return { stroke: Color.inkHex, strokeThickness: Math.max(2, Math.round(px * 0.12)) };
}

/** Vertical centre of a top-anchored settings row label, for the value opposite it. */
export function rowMidY(label: Phaser.GameObjects.Text): number {
  return label.y + label.height / 2;
}

/**
 * Union band of a settings row's label and its right-aligned value. Measuring the row
 * rather than typing a height in is what keeps the row's hit box on its visible ink
 * when the type step moves.
 */
export function rowBand(
  label: Phaser.GameObjects.Text,
  value: Phaser.GameObjects.Text,
  minHeight = 56,
): { mid: number; height: number } {
  const top = Math.min(label.y, value.y - value.height / 2);
  const bottom = Math.max(label.y + label.height, value.y + value.height / 2);
  const height = Math.max(bottom - top, minHeight);
  return { mid: (top + bottom) / 2, height };
}

/**
 * Settings panel. Width still uses the 0.75 scale; row/button height follows the
 * current contain scale so a phone hits 48 CSS px without a 900px desktop panel.
 */
export const SET_PAD = 24;
const SET_BTN_SCALE = 0.75;
export const SET_BTN_W = Math.round((440 - SET_PAD * 2) * SET_BTN_SCALE);
export const SETTINGS_W = SET_BTN_W + SET_PAD * 2;
export const VOL_KNOB_R = 12;
export const VOL_TRACK_X = SET_PAD;
export const VOL_TRACK_W = Math.round(312 * SET_BTN_SCALE);
export const VOL_TRACK_H = 16;
export const SET_HINT_H = 24;

export const SET_TITLE_PX = "28px";
export const SET_ROW_PX = "22px";
export const SET_VALUE_PX = "24px";
export const SET_BTN_LABEL_PX = "26px";
export const SET_BTN_CAP_PX = "16px";
export const SET_HINT_PX = "14.3px";

const HUD_CAPTION_PX = 18;
export const HUD_COG_CAPTION_PX = HUD_CAPTION_PX * 1.25;
export const HUD_COG_CAPTION_PAD = { x: 12, y: 6 };
export const HUD_COG_CAPTION_BOX = {
  w: 240,
  h: Math.ceil(HUD_COG_CAPTION_PX * 1.4 + HUD_COG_CAPTION_PAD.y * 2),
};

/** Delivery phone — every dimension derived from PHONE_SCALE and phoneArt cells. */
export const PHONE_W = PHONE_TEX.w * PHONE_SCALE;
export const PHONE_H = PHONE_TEX.h * PHONE_SCALE;
export const PHONE_CHASSIS = phoneDesignRect(PHONE_CHASSIS_CELLS);
export const PHONE_APP = phoneDesignRect(PHONE_APP_CELLS);
export const PHONE_COG_GAP = 16;

const PHONE_CELL = PHONE_PX * PHONE_SCALE;
export const PHONE_HEADER_H = PHONE_CELL * 2.5;
export const PHONE_STATUS_H = PHONE_CELL * 4;
const PHONE_MAP_GAP = PHONE_CELL * 0.25;
export const PHONE_TITLE_PX = "20px";
export const PHONE_STATUS_PX = "20px";

export const PHONE_MAP = ((): { x: number; y: number; w: number; h: number } => {
  const fitted = fitCityPanel({
    x: PHONE_APP.x + 6,
    y: PHONE_APP.y + PHONE_HEADER_H + PHONE_MAP_GAP,
    w: PHONE_APP.w - 12,
    h: PHONE_APP.h - PHONE_HEADER_H - PHONE_STATUS_H - PHONE_MAP_GAP * 2,
  });
  return {
    x: Math.round(fitted.x),
    y: Math.round(fitted.y),
    w: Math.round(fitted.w),
    h: Math.round(fitted.h),
  };
})();

export const MAP_INK = {
  outside: 0x141a1e,
  block: 0x2c3a30,
  street: 0x515a60,
  drive: 0x3e454a,
  house: 0xb89258,
} as const;

/** ID card layout constants. */
export const ID_CARD_W = 760;
export const ID_CARD_H = 440;
export const ID_RING_PAD = 16;
export const ID_PAD = 24;
export const ID_HEADER_H = 56;
/** Provincial seal diameter — header captions must stay outside this band. */
export const ID_HEADER_SEAL_D = 38;
/** Ink gap between caption max edge and the seal ring. */
export const ID_HEADER_SEAL_GAP = 12;
const ID_HALF_W = ID_CARD_W / 2;
/** Max caption width from each card edge to the seal reserve (symmetric). */
export const ID_HEADER_CAP_MAX_W = ID_HALF_W - ID_PAD - ID_HEADER_SEAL_D / 2 - ID_HEADER_SEAL_GAP;
export const ID_PHOTO_W = 180;
export const ID_PHOTO_H = Math.round((ID_PHOTO_W * PORTRAIT_H) / PORTRAIT_W);
export const ID_PHOTO_FRAME = 4;
export const ID_TITLE_PX = "18px";
export const ID_KIND_PX = "14.4px";
export const ID_NAME_PX = "28.8px";
export const ID_LABEL_PX = "14.4px";
export const ID_DOB_PX = "21.6px";
export const ID_HINT_PX = "24px";
export const ID_SIG_PX = "13.2px";
export const ID_OK_INK = 0x3d7a45;
export const ID_DENY_INK = 0xc45a3a;
export const ID_CARD_FILL = 0xf4e8c1;
export const ID_FIELD_X = -ID_HALF_W + ID_PAD + ID_PHOTO_W + 28;
export const ID_FIELD_W = ID_HALF_W - ID_PAD - ID_FIELD_X;
/** Label/value rows — shared left edge, fixed vertical rhythm. */
export const ID_FIELD_LABEL_H = 18;
export const ID_FIELD_VALUE_GAP = 5;
export const ID_FIELD_ROW_STEP = 72;
export const ID_FIELD_VALUE_LEAD = ID_FIELD_LABEL_H + ID_FIELD_VALUE_GAP;
