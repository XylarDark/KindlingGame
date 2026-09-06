import Phaser from "phaser";
import { getMusicPrefs, setMusicEnabled, setMusicVolume, syncMusicToClock } from "../audio/music";
import { playCameraClick } from "../audio/sfx";
import { clampInput } from "../input/controls";
import { enableItemHit, syncItemHit } from "../input/hit";
import { CITY, MAP_PX_H, MAP_PX_W, TILE, houseById, tileToWorld } from "../maps/cityT0";
import { GAME_HEIGHT, GAME_WIDTH, NPC_INTERACT_COOLDOWN_MS } from "../sim/constants";
import { getSim } from "../session";
import { nightFactor, skyAt } from "../sim/dayNight";
import type { SimSnapshot } from "../sim/gameSim";
import { tutorialHints } from "../sim/tutorialHints";
import { addHudButton, addPanel } from "../ui/chrome";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { designSafeInset, HUD_TOUCH_MIN_DESIGN, readCssSafeArea, VIEWFIT_EVENT, viewFromScale } from "../ui/viewFit";

const SETTINGS_W = 420;
const SETTINGS_H = 352;
const VOL_TRACK = { x: 24, y: 168, w: 292, h: 16 };
/** Squarer black iPhone — room for Kindling header + map. */
const PHONE_W = 168;
const PHONE_H = 196;
const PHONE_COG_GAP = 16;
const PHONE_SCREEN = { x: -68, y: -74, w: 136, h: 148 };

export class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private scoreCaption!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private padRing!: Phaser.GameObjects.Graphics;
  private padKnob!: Phaser.GameObjects.Arc;
  private padLabel!: Phaser.GameObjects.Text;
  private phone!: Phaser.GameObjects.Container;
  private phoneBody!: Phaser.GameObjects.Image;
  private phoneHit!: Phaser.GameObjects.Rectangle;
  private phoneFlash!: Phaser.GameObjects.Rectangle;
  private phoneMap!: Phaser.GameObjects.Graphics;
  private phoneTitle!: Phaser.GameObjects.Text;
  private phoneStatus!: Phaser.GameObjects.Text;
  private idDim!: Phaser.GameObjects.Rectangle;
  private idPanel!: Phaser.GameObjects.Container;
  private idName!: Phaser.GameObjects.Text;
  private idDob!: Phaser.GameObjects.Text;
  private idHint!: Phaser.GameObjects.Text;
  private idTitle!: Phaser.GameObjects.Text;
  private idBg!: Phaser.GameObjects.Rectangle;
  private idFlashRing!: Phaser.GameObjects.Rectangle;
  private flash!: Phaser.GameObjects.Rectangle;
  private toastText!: Phaser.GameObjects.Text;
  private sawPhoto = false;
  private idWasShowing = false;
  private idCardArmedAt = 0;
  private padCenter = { x: 196, y: GAME_HEIGHT - 220 };
  private pointerId: number | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private cog!: Phaser.GameObjects.Image;
  private cogCaption!: Phaser.GameObjects.Text;
  private settingsDim!: Phaser.GameObjects.Rectangle;
  private settingsPanel!: Phaser.GameObjects.Container;
  private musicValue!: Phaser.GameObjects.Text;
  private volumeFill!: Phaser.GameObjects.Rectangle;
  private volumeKnob!: Phaser.GameObjects.Arc;
  private volumePct!: Phaser.GameObjects.Text;
  private volumeHit!: Phaser.GameObjects.Rectangle;
  private draggingVol = false;
  private settingsOpen = false;

  constructor() {
    super("hud");
  }

  create(): void {
    this.input.setTopOnly(false);

    this.scoreText = addUiText(this, 28, 36, "", {
      size: Type.display,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    }).setDepth(20);
    this.scoreCaption = addUiText(this, 28, 92, "SCORE", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "700",
      strokeThickness: 0,
    }).setDepth(20);

    this.clockText = addUiText(this, GAME_WIDTH - 28, 36, "", {
      size: Type.display,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    })
      .setOrigin(1, 0)
      .setDepth(20);

    this.phoneBody = this.add
      .image(0, 0, "tex-phone")
      .setDisplaySize(PHONE_W, PHONE_H);
    this.phoneFlash = this.add
      .rectangle(0, 0, PHONE_W + 10, PHONE_H + 10, Color.lime, 0)
      .setStrokeStyle(4, Color.lime, 1);
    this.phoneMap = this.add.graphics();
    this.phoneTitle = addUiText(this, 0, PHONE_SCREEN.y + 20, "KINDLING DELIVERY", {
      size: 12,
      color: Color.limeHex,
      fontStyle: "700",
      align: "center",
      strokeThickness: 0,
    }).setOrigin(0.5);
    this.phoneStatus = addUiText(this, 0, PHONE_SCREEN.y + PHONE_SCREEN.h - 16, "Tap to call", {
      size: 11,
      color: Color.creamHex,
      fontStyle: "600",
      align: "center",
      wordWrap: { width: PHONE_SCREEN.w - 16 },
      strokeThickness: 0,
    }).setOrigin(0.5);
    this.phoneHit = this.add
      .rectangle(0, 0, PHONE_W - 8, PHONE_H - 8, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    this.phoneHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.phone = this.add
      .container(GAME_WIDTH - 160, GAME_HEIGHT - 220, [
        this.phoneFlash,
        this.phoneBody,
        this.phoneMap,
        this.phoneTitle,
        this.phoneStatus,
        this.phoneHit,
      ])
      .setDepth(22)
      .setVisible(false);

    this.toastText = addUiText(this, GAME_WIDTH / 2, GAME_HEIGHT - 24, "", {
      size: Type.body,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 16, y: 10 },
      align: "center",
      fontStyle: "600",
      wordWrap: { width: 760 },
    })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.idDim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0a0806, 0.55)
      .setDepth(24)
      .setVisible(false);
    this.idDim.setInteractive({ useHandCursor: false });
    this.idDim.on("pointerdown", (p: Phaser.Input.Pointer) => p.event.stopPropagation());

    this.idName = addUiText(this, 0, -28, "", {
      size: Type.heading,
      color: Color.inkHex,
      align: "center",
      fontStyle: "600",
      strokeThickness: 0,
    }).setOrigin(0.5);
    this.idTitle = addUiText(this, 0, -118, "CUSTOMER ID", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    }).setOrigin(0.5);
    this.idDob = addUiText(this, 0, 22, "", {
      size: Type.body,
      color: "#3a2418",
      strokeThickness: 0,
    }).setOrigin(0.5);
    this.idHint = addUiText(this, 0, 88, "Tap the card to confirm 19+", {
      size: Type.caption,
      color: "#3d7a45",
      fontStyle: "600",
      strokeThickness: 0,
    }).setOrigin(0.5);
    this.idFlashRing = this.add.rectangle(0, 0, 572, 332, 0x000000, 0).setStrokeStyle(8, Color.lime, 1);
    this.idBg = this.add.rectangle(0, 0, 560, 320, 0xf4e8c1, 0.97).setStrokeStyle(6, 0x3d7a45);
    enableItemHit(this.idBg);
    this.idBg.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.idPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [
      this.idFlashRing,
      this.idBg,
      this.idTitle,
      this.idName,
      this.idDob,
      this.idHint,
    ]);
    this.idPanel.setDepth(25).setVisible(false);

    this.flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0).setDepth(24);

    this.padRing = this.add.graphics().setDepth(19);
    this.drawPad();
    this.padKnob = this.add.circle(this.padCenter.x, this.padCenter.y, 40, Color.cream, 0.92).setDepth(20);
    this.padLabel = addUiText(this, this.padCenter.x, this.padCenter.y - 128, "Heading to stop…", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 10, y: 6 },
      fontStyle: "600",
    })
      .setOrigin(0.5, 1)
      .setDepth(20);
    this.padRing.setVisible(false);
    this.padKnob.setVisible(false);
    this.padLabel.setVisible(false);

    const kb = this.input.keyboard;
    this.keys = kb
      ? (kb.addKeys("W,A,S,D,E,UP,DOWN,LEFT,RIGHT,SPACE") as Record<string, Phaser.Input.Keyboard.Key>)
      : {};
    // Just-down only — Phaser key repeat would otherwise queueInteract every frame
    // and skip HAND BAG / PHOTO once the doorstep lock expires.
    kb?.on("keydown-E", (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      getSim().queueInteract();
    });
    kb?.on("keydown-SPACE", (ev: KeyboardEvent) => {
      if (ev.repeat) return;
      getSim().queueInteract();
    });

    this.input.addPointer(2);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onPointerUp(p));

    this.makeSettings();
    this.layoutHud();
    const relayout = (): void => this.layoutHud();
    this.scale.on(Phaser.Scale.Events.RESIZE, relayout);
    this.game.events.on(VIEWFIT_EVENT, relayout);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.game.events.off(VIEWFIT_EVENT, relayout));

    this.paintHud(getSim().snapshot());
  }

  update(_time: number, delta: number): void {
    const sim = getSim();
    const snap = sim.snapshot();
    if (!snap.autoDriving) {
      const { dx, dy } = this.readInput();
      sim.setPlayerInput(dx, dy);
    } else {
      sim.setPlayerInput(0, 0);
    }
    sim.tick(delta);
    this.paintHud(sim.snapshot());
  }

  private layoutHud(): void {
    const inset = designSafeInset(viewFromScale(this.scale), readCssSafeArea(document.getElementById("game-root")));
    const left = 28 + inset.left;
    const right = GAME_WIDTH - 28 - inset.right;
    const top = 36 + inset.top;
    const bottom = GAME_HEIGHT - 24 - inset.bottom;
    this.scoreText.setPosition(left, top);
    this.scoreCaption.setPosition(left, top + 56);
    this.clockText.setPosition(right, top);
    const cogSize = HUD_TOUCH_MIN_DESIGN;
    const cogX = GAME_WIDTH - 24 - inset.right;
    const cogY = GAME_HEIGHT - 20 - inset.bottom;
    this.cog.setPosition(cogX, cogY);
    this.cog.setDisplaySize(cogSize, cogSize);
    syncItemHit(this.cog);
    this.cogCaption.setPosition(cogX - 8, cogY - cogSize - 4);
    this.settingsPanel.setPosition(cogX - SETTINGS_W, cogY - cogSize - 32 - SETTINGS_H);

    // Keep the phone clear of the settings cog (bottom-right).
    const cogLeft = cogX - cogSize;
    const cogTop = cogY - cogSize;
    const phoneRight = Math.min(GAME_WIDTH - 16 - inset.right, cogLeft - PHONE_COG_GAP);
    const phoneBottom = Math.min(GAME_HEIGHT - 16 - inset.bottom, cogTop - PHONE_COG_GAP);
    this.phone.setPosition(phoneRight - PHONE_W * 0.5, phoneBottom - PHONE_H * 0.5);
    this.phoneBody.setDisplaySize(PHONE_W, PHONE_H);
    this.toastText.setPosition(GAME_WIDTH / 2, bottom);
    this.padCenter = { x: 196 + inset.left, y: GAME_HEIGHT - 220 - inset.bottom };
    this.drawPad();
    this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    this.padLabel.setPosition(this.padCenter.x, this.padCenter.y - 128);
  }

  private paintHud(snap: SimSnapshot): void {
    this.scoreText.setText(String(snap.score));
    this.clockText.setText(snap.clockLabel);
    const next = tutorialHints(snap)[0];
    const pulse = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(snap.gameMs / 160));
    const flashNext = this.settingsOpen ? null : next;

    const drop = snap.dropoff;
    const showPhone = snap.playerRole === "driver" && (drop.phase === "atCurb" || drop.phase === "calling");
    const atDoor = drop.phase === "atDoor";
    const flashPhone = flashNext?.kind === "phone";

    this.phone.setVisible(showPhone);
    if (showPhone) {
      if (!this.phoneHit.input) this.phoneHit.setInteractive({ useHandCursor: true });
      else this.phoneHit.input.enabled = true;
    } else {
      this.phoneHit.disableInteractive();
    }
    const callName = drop.customerName ?? "customer";
    this.phoneStatus.setText(drop.phase === "calling" ? `Calling ${callName}…` : `Tap to call ${callName}`);
    if (showPhone) {
      this.phone.setAlpha(1);
      this.phoneBody.setAlpha(drop.phase === "calling" ? 0.92 : 1);
      this.phoneFlash.setVisible(flashPhone && drop.phase !== "calling");
      if (flashPhone && drop.phase !== "calling") {
        this.phoneFlash.setStrokeStyle(4 + Math.round(3 * pulse), Color.lime, 0.55 + 0.45 * pulse);
        this.phoneStatus.setColor(Color.inkHex);
        this.phoneStatus.setBackgroundColor(Color.limeHex);
        this.phoneStatus.setPadding(6, 3, 6, 3);
      } else {
        this.phoneFlash.setVisible(false);
        this.phoneStatus.setColor(drop.phase === "calling" ? Color.neonHex : Color.creamHex);
        this.phoneStatus.setBackgroundColor("#101418");
        this.phoneStatus.setPadding(4, 2, 4, 2);
      }
      this.paintPhoneMap(snap);
    } else {
      this.phoneFlash.setVisible(false);
      this.phoneMap.clear();
    }

    const showId = !!drop.idCard && drop.idAsked && !drop.idChecked;
    if (showId && !this.idWasShowing) {
      this.idCardArmedAt = snap.gameMs + NPC_INTERACT_COOLDOWN_MS;
    }
    this.idWasShowing = showId;
    const idLive = showId && snap.gameMs >= this.idCardArmedAt;
    const flashId = flashNext?.kind === "idCard";
    this.idDim.setVisible(showId);
    if (showId) {
      if (!this.idDim.input) this.idDim.setInteractive({ useHandCursor: false });
      else this.idDim.input.enabled = true;
    } else {
      this.idDim.disableInteractive();
    }
    this.idPanel.setVisible(showId);
    this.idPanel.setAlpha(1);
    if (idLive) {
      if (!this.idBg.input) enableItemHit(this.idBg);
      else this.idBg.input.enabled = true;
    } else {
      this.idBg.disableInteractive();
    }
    // Pulse border only — keep ID text fully readable.
    this.idFlashRing.setVisible(idLive && flashId);
    if (idLive && flashId) {
      this.idFlashRing.setStrokeStyle(6 + Math.round(4 * pulse), Color.lime, 0.55 + 0.45 * pulse);
      this.idFlashRing.setAlpha(1);
    }
    this.idBg.setAlpha(1);
    this.idTitle.setAlpha(1);
    this.idName.setAlpha(1);
    this.idDob.setAlpha(1);
    this.idHint.setAlpha(1);
    if (drop.idCard) {
      this.idName.setText(drop.idCard.name);
      const band = drop.idCard.ageOk ? "19+" : "UNDER 19";
      this.idDob.setText(`DOB  ${drop.idCard.dob}   ·   ${band}`);
      this.idHint.setText(drop.idCard.ageOk ? "Tap the card to confirm 19+" : "Under 19 — tap to deny and leave");
      this.idHint.setColor(drop.idCard.ageOk ? "#3d7a45" : Color.dangerHex);
      this.idBg.setStrokeStyle(6, drop.idCard.ageOk ? 0x3d7a45 : 0xc45a3a);
    }

    if (drop.photoTaken && !this.sawPhoto) {
      this.sawPhoto = true;
      playCameraClick(this.game);
      const sky = skyAt(snap.gameMs);
      const night = nightFactor(snap.gameMs) > 0.12 || sky.lampAlpha > 0.35;
      if (night) {
        this.flash.setAlpha(0.9);
        this.tweens.add({ targets: this.flash, alpha: 0, duration: 280 });
      }
    }
    if (!drop.photoTaken) this.sawPhoto = false;

    this.toastText.setText(snap.toast);
    const driving = snap.playerRole === "driver" && !atDoor;
    // Drive prompts float over the van; ID/phone keep their own UI.
    const driveBanner = driving && !!snap.toast;
    this.toastText.setVisible(!!snap.toast && !showId && snap.dropoff.phase !== "atDoor" && !showPhone && !driveBanner);
    this.padRing.setVisible(false);
    this.padKnob.setVisible(false);
    this.padLabel.setVisible(false);
    this.syncDoorScene(snap);
    syncMusicToClock(snap.gameMs);
  }

  private makeSettings(): void {
    this.settingsDim = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, Color.ink, 0.45)
      .setDepth(40)
      .setInteractive()
      .setVisible(false);
    this.settingsDim.disableInteractive();
    this.settingsDim.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.closeSettings();
    });

    const panelX = GAME_WIDTH - 24 - SETTINGS_W;
    const panelY = GAME_HEIGHT - 24 - 168 - SETTINGS_H;
    const bg = addPanel(this, 0, 0, SETTINGS_W, SETTINGS_H, {
      radius: 4,
      fill: 0xfffaf3,
      stroke: Color.woodTrim,
      depth: 41,
    });
    const title = addUiText(this, 24, 16, "SETTINGS", {
      size: Type.heading,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    });
    const musicLabel = addUiText(this, 24, 64, "Music", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
    });
    this.musicValue = addUiText(this, SETTINGS_W - 28, 72, "", {
      size: Type.heading,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    }).setOrigin(1, 0.5);
    const musicHit = this.add
      .rectangle(SETTINGS_W / 2, 76, SETTINGS_W - 24, 48, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    musicHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      setMusicEnabled(!getMusicPrefs().enabled, this.game);
      this.refreshMusicControls();
    });

    const volumeLabel = addUiText(this, 24, 124, "Volume", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
    });
    this.volumePct = addUiText(this, SETTINGS_W - 28, 132, "", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    }).setOrigin(1, 0.5);
    const track = this.add.rectangle(VOL_TRACK.x, VOL_TRACK.y, VOL_TRACK.w, VOL_TRACK.h, 0xd8c8b0).setOrigin(0, 0.5);
    this.volumeFill = this.add.rectangle(VOL_TRACK.x, VOL_TRACK.y, 8, VOL_TRACK.h, Color.leaf).setOrigin(0, 0.5);
    this.volumeKnob = this.add.circle(VOL_TRACK.x, VOL_TRACK.y, 12, Color.woodTrim);
    this.volumeHit = this.add
      .rectangle(VOL_TRACK.x + VOL_TRACK.w / 2, VOL_TRACK.y, VOL_TRACK.w, 44, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    this.volumeHit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      this.draggingVol = true;
      this.setVolumeFromPointer(p);
    });
    this.input.on("pointermove", (p: Phaser.Input.Pointer) => {
      if (this.draggingVol) this.setVolumeFromPointer(p);
    });
    this.input.on("pointerup", () => {
      this.draggingVol = false;
    });
    this.input.on("pointerupoutside", () => {
      this.draggingVol = false;
    });

    const reset = addHudButton(this, 24, 232, "RESET DAY TO 9:00 AM", () => this.resetDayToNine(), {
      originX: 0,
      originY: 0,
      variant: "amber",
      minWidth: SETTINGS_W - 48,
      caption: "Clock back to 9 AM · clears the door stop",
      depth: 41,
    });
    const resetHint = addUiText(this, 24, 304, "Packed bags stay. Late timers start over.", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "600",
      strokeThickness: 0,
    });

    this.settingsPanel = this.add.container(panelX, panelY, [
      bg,
      title,
      musicLabel,
      this.musicValue,
      musicHit,
      volumeLabel,
      this.volumePct,
      track,
      this.volumeFill,
      this.volumeKnob,
      this.volumeHit,
      reset,
      resetHint,
    ]);
    this.settingsPanel.setDepth(41).setVisible(false);

    const cogX = GAME_WIDTH - 24;
    const cogY = GAME_HEIGHT - 20;
    const cogSize = HUD_TOUCH_MIN_DESIGN;
    this.cog = this.add.image(cogX, cogY, "tex-cog").setOrigin(1, 1).setDisplaySize(cogSize, cogSize).setDepth(42);
    enableItemHit(this.cog);
    const toggleSettings = (p: Phaser.Input.Pointer): void => {
      p.event.stopPropagation();
      if (this.settingsOpen) this.closeSettings();
      else this.openSettings();
    };
    this.cog.on("pointerdown", toggleSettings);
    this.cogCaption = addUiText(this, cogX - 8, cogY - cogSize - 4, "Settings", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 8, y: 3 },
      fontStyle: "600",
    })
      .setOrigin(1, 1)
      .setDepth(42);
    enableItemHit(this.cogCaption);
    this.cogCaption.on("pointerdown", toggleSettings);
    this.refreshMusicControls();
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.settingsDim.setVisible(true).setInteractive();
    this.settingsPanel.setVisible(true);
    this.refreshMusicControls();
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.settingsDim.setVisible(false).disableInteractive();
    this.settingsPanel.setVisible(false);
  }

  private refreshMusicControls(): void {
    const prefs = getMusicPrefs();
    this.musicValue.setText(prefs.enabled ? "ON" : "OFF");
    this.musicValue.setColor(prefs.enabled ? "#3d6a44" : Color.muteHex);
    const t = prefs.volume;
    this.volumeFill.width = Math.max(8, VOL_TRACK.w * t);
    this.volumeKnob.setPosition(VOL_TRACK.x + VOL_TRACK.w * t, VOL_TRACK.y);
    this.volumePct.setText(`${Math.round(t * 100)}%`);
  }

  private setVolumeFromPointer(p: Phaser.Input.Pointer): void {
    const bounds = this.volumeHit.getBounds();
    const t = Phaser.Math.Clamp((p.x - bounds.left) / Math.max(1, bounds.width), 0, 1);
    setMusicVolume(t, this.game);
    this.refreshMusicControls();
  }

  private resetDayToNine(): void {
    getSim().resetToMorning();
    syncMusicToClock(0);
    this.refreshMusicControls();
  }

  private drawPad(flash = false): void {
    const { x, y } = this.padCenter;
    this.padRing.clear();
    this.padRing.fillStyle(Color.ink, 0.4);
    this.padRing.fillCircle(x, y, 108);
    this.padRing.lineStyle(flash ? 6 : 5, Color.lime, flash ? 1 : 0.85);
    this.padRing.strokeCircle(x, y, 108);
    this.padRing.lineStyle(3, flash ? Color.cream : Color.cream, flash ? 0.7 : 0.35);
    this.padRing.strokeCircle(x, y, 76);
  }

  /** Mini city map on the delivery phone screen. */
  private paintPhoneMap(snap: SimSnapshot): void {
    const g = this.phoneMap;
    g.clear();
    const mapX = PHONE_SCREEN.x + 6;
    const mapY = PHONE_SCREEN.y + 36;
    const mapW = PHONE_SCREEN.w - 12;
    const mapH = PHONE_SCREEN.h - 62;
    g.fillStyle(0x1a2228, 1);
    g.fillRoundedRect(mapX, mapY, mapW, mapH, 6);
    g.lineStyle(1, 0x2e3a44, 1);
    g.strokeRoundedRect(mapX, mapY, mapW, mapH, 6);

    // App chrome behind title / status
    g.fillStyle(0x0c1014, 1);
    g.fillRect(PHONE_SCREEN.x + 4, PHONE_SCREEN.y + 8, PHONE_SCREEN.w - 8, 22);
    g.fillRect(PHONE_SCREEN.x + 4, PHONE_SCREEN.y + PHONE_SCREEN.h - 28, PHONE_SCREEN.w - 8, 22);

    const scale = Math.min(mapW / MAP_PX_W, mapH / MAP_PX_H);
    const ox = mapX + (mapW - MAP_PX_W * scale) * 0.5;
    const oy = mapY + (mapH - MAP_PX_H * scale) * 0.5;
    const toMap = (wx: number, wy: number): { x: number; y: number } => ({
      x: ox + wx * scale,
      y: oy + wy * scale,
    });

    // Roads
    g.fillStyle(0x3a4248, 1);
    const kinds = CITY.kinds;
    const step = Math.max(1, Math.floor(TILE * scale) < 1.2 ? 2 : 1);
    for (let r = 0; r < kinds.length; r += step) {
      for (let c = 0; c < kinds[r]!.length; c += step) {
        const k = kinds[r]![c];
        if (k !== "road" && k !== "parking") continue;
        const p = toMap(c * TILE, r * TILE);
        const s = Math.max(1.2, TILE * scale * step);
        g.fillRect(p.x, p.y, s, s);
      }
    }

    // Kindling shop
    const shop = CITY.shopLot;
    const shopPt = toMap(shop.origin.c * TILE, shop.origin.r * TILE);
    g.fillStyle(Color.lime, 0.9);
    g.fillRect(shopPt.x, shopPt.y, Math.max(3, shop.w * TILE * scale), Math.max(3, shop.h * TILE * scale));

    // Destination pin
    const stopId = snap.run?.nextStopId ?? snap.dropoff.houseId;
    if (stopId) {
      const house = houseById(stopId);
      if (house) {
        const stop = tileToWorld(house.stop);
        const pin = toMap(stop.x, stop.y);
        g.fillStyle(Color.amber, 1);
        g.fillCircle(pin.x, pin.y, 4);
        g.lineStyle(1.5, Color.cream, 1);
        g.strokeCircle(pin.x, pin.y, 4);
      }
    }

    // Van
    const van = toMap(snap.vehicle.x, snap.vehicle.y);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(van.x, van.y, 3.5);
    g.fillStyle(Color.neon, 1);
    g.fillCircle(van.x, van.y, 2.2);
  }

  private syncDoorScene(snap: SimSnapshot): void {
    const wantDoor = snap.playerRole === "driver" && snap.dropoff.phase === "atDoor";
    const showId = !!snap.dropoff.idCard && snap.dropoff.idAsked && !snap.dropoff.idChecked;
    const doorUp = this.scene.isActive("door") && !this.scene.isSleeping("door");
    if (wantDoor && !doorUp) {
      this.scene.sleep("drive");
      if (this.scene.isSleeping("door")) this.scene.wake("door");
      else this.scene.launch("door");
    } else if (!wantDoor && doorUp) {
      this.scene.sleep("door");
      if (snap.playerRole === "driver" && this.scene.isSleeping("drive")) this.scene.wake("drive");
    }
    if (wantDoor) {
      // ID modal lives on the HUD; bag/customer taps live on the door — flip who is on top.
      if (showId) {
        this.scene.bringToTop("door");
        this.scene.bringToTop();
      } else {
        this.scene.bringToTop();
        this.scene.bringToTop("door");
      }
    } else {
      this.scene.bringToTop();
    }
  }

  private readInput(): { dx: number; dy: number } {
    let dx = 0;
    let dy = 0;
    if (this.keys.A?.isDown || this.keys.LEFT?.isDown) dx -= 1;
    if (this.keys.D?.isDown || this.keys.RIGHT?.isDown) dx += 1;
    if (this.keys.W?.isDown || this.keys.UP?.isDown) dy -= 1;
    if (this.keys.S?.isDown || this.keys.DOWN?.isDown) dy += 1;

    if (this.pointerId !== null) {
      const pointers = [this.input.pointer1, this.input.pointer2, this.input.activePointer].filter(
        (pt): pt is Phaser.Input.Pointer => !!pt,
      );
      const p = pointers.find((pt) => pt.id === this.pointerId) ?? this.input.activePointer;
      dx = Phaser.Math.Clamp((p.x - this.padCenter.x) / 88, -1, 1);
      dy = Phaser.Math.Clamp((p.y - this.padCenter.y) / 88, -1, 1);
      this.padKnob.setPosition(this.padCenter.x + dx * 48, this.padCenter.y + dy * 48);
    } else {
      this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    }
    return clampInput(dx, dy);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.padRing.visible) return;
    const d = Phaser.Math.Distance.Between(p.x, p.y, this.padCenter.x, this.padCenter.y);
    if (d <= HUD_TOUCH_MIN_DESIGN) this.pointerId = p.id;
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.pointerId === p.id) this.pointerId = null;
  }
}
