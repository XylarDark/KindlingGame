import Phaser from "phaser";
import { getMusicPrefs, setMusicEnabled, setMusicVolume, syncMusicToClock } from "../../audio/music";
import { getSim } from "../../session";
import { GAME_HEIGHT, GAME_WIDTH } from "../../sim/constants";
import { loadDisplayPrefs, saveDisplayPrefs } from "../displayPrefs";
import { openInstallCoachFromSettings } from "../installCoach";
import { addHudButton, addPanel } from "../chrome";
import { END_SHIFT_CAPTION, END_SHIFT_LABEL } from "../copy";
import { enableItemHit, syncItemHit } from "../../input/hit";
import { addSignText, setSignPosition } from "../signText";
import { addUiText } from "../text";
import { settingsGeom, type SettingsGeom } from "../settingsGeom";
import { Color, HUD_TYPE_FIT, MENU_TYPE_FIT, scaleChromePx } from "../theme";
import type { SafeInset } from "../viewFit";
import { HUD_TOUCH_MIN_DESIGN } from "../viewFit";
import {
  HUD_COG_CAPTION_BOX,
  HUD_COG_CAPTION_PAD,
  HUD_COG_CAPTION_PX,
  rowBand,
  rowMidY,
  SET_BTN_CAP_PX,
  SET_BTN_LABEL_PX,
  SET_BTN_W,
  SET_HINT_H,
  SET_HINT_PX,
  SET_PAD,
  SET_ROW_PX,
  SET_TITLE_PX,
  SET_VALUE_PX,
  SETTINGS_W,
  VOL_KNOB_R,
  VOL_TRACK_H,
  VOL_TRACK_W,
  VOL_TRACK_X,
} from "./constants";

export interface HudSettingsDeps {
  onEndShift(): void;
  onResetDay(): void;
  onRepaint(): void;
  hideResults(): void;
  ensureShopVisible(): void;
}

/**
 * Settings cog, caption, dim, and panel. Caption is laid out relative to the cog —
 * never at world (0,0) after the first layoutHud pass.
 */
export class HudSettings {
  cog!: Phaser.GameObjects.Image;
  cogCaption!: Phaser.GameObjects.Text;
  settingsDim!: Phaser.GameObjects.Rectangle;
  settingsPanel!: Phaser.GameObjects.Container;
  settingsBox!: SettingsGeom;
  musicValue!: Phaser.GameObjects.Text;
  fullscreenValue!: Phaser.GameObjects.Text;
  volumeTrack!: Phaser.GameObjects.Rectangle;
  volumeFill!: Phaser.GameObjects.Rectangle;
  volumeKnob!: Phaser.GameObjects.Arc;
  volumePct!: Phaser.GameObjects.Text;
  volumeHit!: Phaser.GameObjects.Rectangle;
  endShiftBtn!: Phaser.GameObjects.Container;

  private draggingVol = false;
  private open = false;
  volumeTrackBounds = { left: 0, width: VOL_TRACK_W };

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly deps: HudSettingsDeps,
  ) {}

  get isOpen(): boolean {
    return this.open;
  }

  create(): void {
    this.settingsDim = this.scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Color.ink, 0.45)
      .setDepth(40)
      .setVisible(false);
    this.settingsDim.setInteractive({
      useHandCursor: false,
      hitArea: new Phaser.Geom.Rectangle(0, 0, GAME_WIDTH, GAME_HEIGHT),
      hitAreaCallback: (area: Phaser.Geom.Rectangle, x: number, y: number): boolean =>
        Phaser.Geom.Rectangle.Contains(area, x, y) && !this.overSettingsPanel(x, y),
    });
    this.armSettingsDim(false);
    this.settingsDim.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.close();
    });

    const box = settingsGeom();
    this.settingsBox = box;
    const panelX = GAME_WIDTH - 24 - SETTINGS_W;
    const panelY = GAME_HEIGHT - 24 - 168 - box.h;
    const bg = addPanel(this.scene, 0, 0, SETTINGS_W, box.h, {
      radius: 4,
      fill: Color.card,
      stroke: Color.woodTrim,
      depth: 41,
    });
    const title = addUiText(this.scene, SET_PAD, 16, "SETTINGS", {
      size: SET_TITLE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: SET_BTN_W,
      maxHeight: 38,
    });
    const musicLabel = addUiText(this.scene, SET_PAD, box.rowTop, "Music", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 180,
      maxHeight: 30,
    });
    this.musicValue = addUiText(this.scene, SETTINGS_W - SET_PAD, rowMidY(musicLabel), "", {
      size: SET_VALUE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 140,
      maxHeight: 32,
    }).setOrigin(1, 0.5);
    const musicBand = rowBand(musicLabel, this.musicValue, box.rowH);
    const musicHit = this.scene.add
      .rectangle(SETTINGS_W / 2, musicBand.mid, SET_BTN_W, musicBand.height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    musicHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      setMusicEnabled(!getMusicPrefs().enabled, this.scene.game);
      this.refreshMusicControls();
    });

    const volumeLabel = addUiText(this.scene, SET_PAD, box.volRowTop, "Volume", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 180,
      maxHeight: 30,
    });
    this.volumePct = addUiText(this.scene, SETTINGS_W - SET_PAD, rowMidY(volumeLabel), "", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 100,
      maxHeight: 30,
    }).setOrigin(1, 0.5);
    this.volumeTrack = this.scene.add
      .rectangle(VOL_TRACK_X, box.volTrackY, VOL_TRACK_W, VOL_TRACK_H, 0xd8c8b0)
      .setOrigin(0, 0.5);
    this.volumeFill = this.scene.add
      .rectangle(VOL_TRACK_X, box.volTrackY, 8, VOL_TRACK_H, Color.leaf)
      .setOrigin(0, 0.5);
    this.volumeKnob = this.scene.add.circle(VOL_TRACK_X, box.volTrackY, VOL_KNOB_R, Color.woodTrim);
    this.volumeHit = this.scene.add
      .rectangle(
        VOL_TRACK_X + VOL_TRACK_W / 2,
        box.volTrackY,
        VOL_TRACK_W + VOL_KNOB_R * 2,
        Math.max(VOL_KNOB_R * 2, box.rowH),
        0x000000,
        0.001,
      )
      .setInteractive({ useHandCursor: true });
    this.volumeHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.draggingVol = true;
      this.setVolumeFromPointer(p);
    });
    this.scene.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.draggingVol) this.setVolumeFromPointer(p);
    });
    this.scene.input.on("pointerup", () => {
      this.draggingVol = false;
    });
    this.scene.input.on("pointerupoutside", () => {
      this.draggingVol = false;
    });

    const fullscreenLabel = addUiText(this.scene, SET_PAD, box.fsRowTop, "Start fullscreen", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 220,
      maxHeight: 30,
    });
    this.fullscreenValue = addUiText(this.scene, SETTINGS_W - SET_PAD, rowMidY(fullscreenLabel), "", {
      size: SET_VALUE_PX,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 140,
      maxHeight: 32,
    }).setOrigin(1, 0.5);
    const fullscreenBand = rowBand(fullscreenLabel, this.fullscreenValue, box.rowH);
    const fullscreenHit = this.scene.add
      .rectangle(SETTINGS_W / 2, fullscreenBand.mid, SET_BTN_W, fullscreenBand.height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    fullscreenHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      const prefs = loadDisplayPrefs();
      saveDisplayPrefs({ startInFullscreen: !prefs.startInFullscreen });
      this.refreshFullscreenControl();
    });

    const installLabel = addUiText(this.scene, SET_PAD, box.installRowTop, "Install for full screen", {
      size: SET_ROW_PX,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 260,
      maxHeight: 30,
    });
    const installValue = addUiText(this.scene, SETTINGS_W - SET_PAD, rowMidY(installLabel), "How", {
      size: SET_VALUE_PX,
      color: "#3d6a44",
      fontStyle: "700",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: 100,
      maxHeight: 32,
    }).setOrigin(1, 0.5);
    const installBand = rowBand(installLabel, installValue, box.rowH);
    const installHit = this.scene.add
      .rectangle(SETTINGS_W / 2, installBand.mid, SET_BTN_W, installBand.height, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    installHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      openInstallCoachFromSettings();
    });

    const endShift = addHudButton(this.scene, SET_PAD, box.endShiftY, END_SHIFT_LABEL, () => this.endShiftEarly(), {
      originX: 0,
      originY: 0,
      variant: "primary",
      minWidth: SET_BTN_W,
      minHeight: box.btnH,
      caption: END_SHIFT_CAPTION,
      labelSize: SET_BTN_LABEL_PX,
      captionSize: SET_BTN_CAP_PX,
      depth: 41,
    });
    this.endShiftBtn = endShift;

    const reset = addHudButton(this.scene, SET_PAD, box.resetY, "RESET TO 9 AM", () => this.resetDayToNine(), {
      originX: 0,
      originY: 0,
      variant: "amber",
      minWidth: SET_BTN_W,
      minHeight: box.btnH,
      caption: "Clears the floor · score to zero",
      labelSize: SET_BTN_LABEL_PX,
      captionSize: SET_BTN_CAP_PX,
      depth: 41,
    });
    const resetHint = addUiText(this.scene, SET_PAD, box.hintY, "Clean slate — bags, tickets and runs go.", {
      size: SET_HINT_PX,
      color: Color.muteHex,
      fontStyle: "600",
      strokeThickness: 0,
      ...MENU_TYPE_FIT,
      maxWidth: SET_BTN_W,
      maxHeight: SET_HINT_H,
    });

    this.settingsPanel = this.scene.add.container(panelX, panelY, [
      bg,
      title,
      musicLabel,
      this.musicValue,
      musicHit,
      volumeLabel,
      this.volumePct,
      this.volumeTrack,
      this.volumeFill,
      this.volumeKnob,
      this.volumeHit,
      fullscreenLabel,
      this.fullscreenValue,
      fullscreenHit,
      installLabel,
      installValue,
      installHit,
      endShift,
      reset,
      resetHint,
    ]);
    this.settingsPanel.setDepth(41).setVisible(false);
    this.settingsPanel.setSize(SETTINGS_W, box.h);
    if (this.settingsPanel.width <= 0 || this.settingsPanel.height <= 0) {
      throw new Error("settings panel needs a non-zero size for the dim punch-out to track it");
    }

    const cogX = GAME_WIDTH - 24;
    const cogY = GAME_HEIGHT - 20;
    const cogSize = HUD_TOUCH_MIN_DESIGN;
    this.cog = this.scene.add
      .image(cogX, cogY, "tex-cog")
      .setOrigin(1, 1)
      .setDisplaySize(cogSize, cogSize)
      .setDepth(42);
    enableItemHit(this.cog);
    const toggleSettings = (p: Phaser.Input.Pointer): void => {
      p.event.stopPropagation();
      if (this.open) this.close();
      else this.openSettings();
    };
    this.cog.on("pointerdown", toggleSettings);
    this.cogCaption = addSignText(this.scene, cogX - cogSize / 2, cogY - cogSize - 8, "Settings", {
      size: scaleChromePx(HUD_COG_CAPTION_PX),
      padding: HUD_COG_CAPTION_PAD,
      fontStyle: "600",
      align: "center",
      ...HUD_TYPE_FIT,
      maxWidth: HUD_COG_CAPTION_BOX.w,
      maxHeight: HUD_COG_CAPTION_BOX.h,
    })
      .setOrigin(0.5, 1)
      .setDepth(42);
    enableItemHit(this.cogCaption);
    this.cogCaption.on("pointerdown", toggleSettings);
    this.refreshMusicControls();
    this.refreshFullscreenControl();
  }

  layout(inset: SafeInset): void {
    const cogSize = HUD_TOUCH_MIN_DESIGN;
    const cogX = GAME_WIDTH - 24 - inset.right;
    const cogY = GAME_HEIGHT - 20 - inset.bottom;
    this.cog.setPosition(cogX, cogY);
    this.cog.setDisplaySize(cogSize, cogSize);
    syncItemHit(this.cog);
    const cogCaptionX = Phaser.Math.Clamp(
      cogX - cogSize / 2,
      inset.left + HUD_COG_CAPTION_BOX.w / 2 + 8,
      GAME_WIDTH - inset.right - HUD_COG_CAPTION_BOX.w / 2 - 8,
    );
    const cogCaptionY = Math.max(inset.top + HUD_COG_CAPTION_BOX.h + 8, cogY - cogSize - 8);
    setSignPosition(this.cogCaption, cogCaptionX, cogCaptionY);
    const panelTop = Math.max(inset.top, cogY - cogSize - 32 - this.settingsBox.h);
    this.settingsPanel.setPosition(cogX - SETTINGS_W, panelTop);
    const volBounds = this.volumeTrack.getBounds();
    this.volumeTrackBounds = { left: volBounds.left, width: volBounds.width };
  }

  armSettingsDim(on: boolean): void {
    const input = this.settingsDim.input;
    if (!input) throw new Error("settings dim must be made interactive before arming");
    input.enabled = on;
  }

  overSettingsPanel(x: number, y: number): boolean {
    const { x: px, y: py, width, height } = this.settingsPanel;
    return x >= px && x <= px + width && y >= py && y <= py + height;
  }

  openSettings(): void {
    this.open = true;
    this.settingsDim.setVisible(true);
    this.armSettingsDim(true);
    this.settingsPanel.setVisible(true);
    this.setCogCaptionShown(false);
    this.refreshMusicControls();
    this.refreshFullscreenControl();
    this.refreshEndShiftButton();
  }

  close(): void {
    this.open = false;
    this.settingsDim.setVisible(false);
    this.armSettingsDim(false);
    this.settingsPanel.setVisible(false);
    this.setCogCaptionShown(true);
  }

  setCogCaptionShown(shown: boolean): void {
    this.cogCaption.setVisible(shown);
  }

  refreshEndShiftButton(): void {
    const can = getSim().snapshot().canEndShiftEarly;
    this.endShiftBtn.setAlpha(can ? 1 : 0.45);
  }

  refreshMusicControls(): void {
    const prefs = getMusicPrefs();
    this.musicValue.setText(prefs.enabled ? "ON" : "OFF");
    this.musicValue.setColor(prefs.enabled ? "#3d6a44" : Color.muteHex);
    const t = prefs.volume;
    this.volumeFill.width = Math.max(8, VOL_TRACK_W * t);
    this.volumeKnob.setPosition(VOL_TRACK_X + VOL_TRACK_W * t, this.settingsBox.volTrackY);
    this.volumePct.setText(`${Math.round(t * 100)}%`);
  }

  refreshFullscreenControl(): void {
    const on = loadDisplayPrefs().startInFullscreen;
    this.fullscreenValue.setText(on ? "ON" : "OFF");
    this.fullscreenValue.setColor(on ? "#3d6a44" : Color.muteHex);
  }

  setVolumeFromPointer(p: Phaser.Input.Pointer): void {
    const t = Phaser.Math.Clamp(
      (p.x - this.volumeTrackBounds.left) / Math.max(1, this.volumeTrackBounds.width),
      0,
      1,
    );
    setMusicVolume(t, this.scene.game);
    this.refreshMusicControls();
  }

  resetDayToNine(): void {
    getSim().resetToMorning();
    syncMusicToClock(0);
    this.close();
    this.deps.hideResults();
    this.refreshMusicControls();
    this.deps.ensureShopVisible();
    this.deps.onResetDay();
  }

  endShiftEarly(): void {
    if (!getSim().endShiftEarly()) return;
    this.close();
    this.deps.onRepaint();
  }
}
