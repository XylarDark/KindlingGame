import { GAME_HEIGHT } from "../sim/constants";
import { designPxForMinCss } from "./theme";
import { getStageContainScale, MIN_CSS_TOUCH_PX } from "./viewFit";

const SET_PAD = 24;
const SET_BTN_GAP = 16;
const VOL_KNOB_R = 12;
const SET_HINT_H = 24;
const SET_ROW_GAP = 8;
/** Leave room for the cog column under the panel. */
const SETTINGS_MAX_H = GAME_HEIGHT - 48;

export type SettingsGeom = {
  rowH: number;
  btnH: number;
  rowTop: number;
  volRowTop: number;
  volTrackY: number;
  fsRowTop: number;
  installRowTop: number;
  endShiftY: number;
  resetY: number;
  hintY: number;
  h: number;
};

function geomFromRowH(rowH: number): SettingsGeom {
  const btnH = Math.max(80, rowH);
  const rowTop = 48;
  const volRowTop = rowTop + rowH + SET_ROW_GAP;
  const volTrackY = volRowTop + 22;
  const fsRowTop = volTrackY + VOL_KNOB_R + SET_ROW_GAP;
  const installRowTop = fsRowTop + rowH + SET_ROW_GAP;
  const endShiftY = installRowTop + rowH + SET_ROW_GAP;
  const resetY = endShiftY + btnH + SET_BTN_GAP;
  const hintY = resetY + btnH + SET_BTN_GAP;
  return {
    rowH,
    btnH,
    rowTop,
    volRowTop,
    volTrackY,
    fsRowTop,
    installRowTop,
    endShiftY,
    resetY,
    hintY,
    h: hintY + SET_HINT_H + SET_PAD,
  };
}

/**
 * Settings panel geometry from the current contain scale.
 * Soft-caps so the panel always fits the 1080 design height (pathological tiny scales).
 */
export function settingsGeom(stageScale = getStageContainScale()): SettingsGeom {
  // Current contain scale, not HUD_BUTTON_MIN_H: that worst-case floor is ~139 design px
  // and stacking it for every row overflowed the 1080 canvas on a phone.
  let rowH = Math.max(56, designPxForMinCss(MIN_CSS_TOUCH_PX, Math.max(stageScale, 0.25)));
  let box = geomFromRowH(rowH);
  while (box.h > SETTINGS_MAX_H && rowH > 56) {
    rowH -= 4;
    box = geomFromRowH(rowH);
  }
  return box;
}

export { SETTINGS_MAX_H };
