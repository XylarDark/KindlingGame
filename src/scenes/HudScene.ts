import Phaser from "phaser";
import { clampInput } from "../input/controls";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { getSim, isTutorialMode, setTutorialMode } from "../session";
import type { SimSnapshot } from "../sim/gameSim";
import { tutorialHints } from "../sim/tutorialHints";
import { addHudButton, addPanel, setButtonCopy } from "../ui/chrome";
import { addUiText } from "../ui/text";
import { roadButtonCopy } from "../ui/copy";
import { Color, Type } from "../ui/theme";
import { overlayStroke } from "../ui/typekit";
import { TutorialArrows } from "../ui/tutorialArrow";

export class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private roleBtn!: Phaser.GameObjects.Container;
  private padRing!: Phaser.GameObjects.Graphics;
  private padKnob!: Phaser.GameObjects.Arc;
  private padLabel!: Phaser.GameObjects.Text;
  private phone!: Phaser.GameObjects.Image;
  private phoneCaption!: Phaser.GameObjects.Text;
  private idPanel!: Phaser.GameObjects.Container;
  private idName!: Phaser.GameObjects.Text;
  private idDob!: Phaser.GameObjects.Text;
  private idHint!: Phaser.GameObjects.Text;
  private idBg!: Phaser.GameObjects.Rectangle;
  private flash!: Phaser.GameObjects.Rectangle;
  private toastText!: Phaser.GameObjects.Text;
  private sawPhoto = false;
  private padCenter = { x: 196, y: GAME_HEIGHT - 220 };
  private pointerId: number | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private arrows!: TutorialArrows;
  private cog!: Phaser.GameObjects.Image;
  private cogCaption!: Phaser.GameObjects.Text;
  private settingsDim!: Phaser.GameObjects.Rectangle;
  private settingsPanel!: Phaser.GameObjects.Container;
  private tutorialValue!: Phaser.GameObjects.Text;
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
    addUiText(this, 28, 92, "SCORE", {
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

    this.roleBtn = addHudButton(this, GAME_WIDTH - 28, 108, "HIT THE ROAD", () => this.onRole(), {
      originX: 1,
      originY: 0,
      variant: "primary",
      minWidth: 280,
      caption: "Leave with this delivery",
    });
    this.roleBtn.setVisible(false);

    this.phone = this.add
      .image(GAME_WIDTH - 380, GAME_HEIGHT - 230, "tex-phone")
      .setDisplaySize(168, 288)
      .setDepth(22)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.phone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.phoneCaption = addUiText(this, GAME_WIDTH - 380, GAME_HEIGHT - 70, "Call the customer", {
      size: Type.caption,
      color: Color.neonHex,
      fontStyle: "600",
      backgroundColor: "#1c1612ee",
      padding: { x: 10, y: 4 },
      ...overlayStroke(15),
    })
      .setOrigin(0.5, 0)
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

    this.idName = addUiText(this, 0, -28, "", {
      size: Type.heading,
      color: Color.inkHex,
      align: "center",
      fontStyle: "600",
      strokeThickness: 0,
    }).setOrigin(0.5);
    const idTitle = addUiText(this, 0, -118, "CUSTOMER ID", {
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
    this.idBg = this.add.rectangle(0, 0, 560, 320, 0xf4e8c1, 0.97).setStrokeStyle(6, 0x3d7a45).setInteractive({ useHandCursor: true });
    this.idBg.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.idPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [this.idBg, idTitle, this.idName, this.idDob, this.idHint]);
    this.idPanel.setDepth(25).setVisible(false);

    this.flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0).setDepth(24);

    this.padRing = this.add.graphics().setDepth(19);
    this.drawPad();
    this.padKnob = this.add.circle(this.padCenter.x, this.padCenter.y, 40, Color.cream, 0.92).setDepth(20);
    this.padLabel = addUiText(this, this.padCenter.x, this.padCenter.y - 128, "STEER", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 8, y: 4 },
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
    kb?.on("keydown-E", () => getSim().queueInteract());
    kb?.on("keydown-SPACE", () => getSim().queueInteract());

    this.input.addPointer(2);
    this.input.on("pointerdown", (p: Phaser.Input.Pointer) => this.onPointerDown(p));
    this.input.on("pointerup", (p: Phaser.Input.Pointer) => this.onPointerUp(p));
    this.input.on("pointerupoutside", (p: Phaser.Input.Pointer) => this.onPointerUp(p));

    this.makeSettings();
    this.arrows = new TutorialArrows(this, 28);

    this.paintHud(getSim().snapshot());
  }

  update(_time: number, delta: number): void {
    const sim = getSim();
    const { dx, dy } = this.readInput();
    sim.setPlayerInput(dx, dy);
    sim.tick(delta);
    this.paintHud(sim.snapshot());
  }

  private paintHud(snap: SimSnapshot): void {
    this.scoreText.setText(String(snap.score));
    this.clockText.setText(snap.clockLabel);
    const next = tutorialHints(snap)[0];
    if (snap.playerRole === "keyLead") {
      const road = roadButtonCopy(snap.bagsInBin.length);
      setButtonCopy(this.roleBtn, road.label, road.caption);
    }
    const showRole = snap.playerRole === "keyLead" && snap.canHitTheRoad;
    this.roleBtn.setVisible(showRole);
    if (this.roleBtn.input) this.roleBtn.input.enabled = showRole;
    const pulseRoad = snap.playerRole === "keyLead" && next?.kind === "hitTheRoad";
    this.roleBtn.setAlpha(pulseRoad ? 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(snap.gameMs / 160)) : 1);

    const drop = snap.dropoff;
    const showPhone = snap.playerRole === "driver" && (drop.phase === "atCurb" || drop.phase === "calling");
    const atDoor = drop.phase === "atDoor";

    this.phone.setVisible(showPhone);
    this.phoneCaption.setVisible(showPhone);
    this.phoneCaption.setText(drop.phase === "calling" ? "Phone is ringing…" : "Call the customer");
    this.phone.setAlpha(drop.phase === "calling" ? 0.85 : 1);

    const showId = !!drop.idCard && drop.idAsked;
    this.idPanel.setVisible(showId);
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
      this.flash.setAlpha(0.85);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 220 });
    }
    if (!drop.photoTaken) this.sawPhoto = false;

    this.toastText.setText(snap.toast);
    this.toastText.setVisible(!!snap.toast && !showId && snap.dropoff.phase !== "atDoor");

    const driving = snap.playerRole === "driver" && !atDoor;
    this.padRing.setVisible(driving);
    this.padKnob.setVisible(driving);
    this.padLabel.setVisible(driving);
    this.paintTutorialArrows(snap);
    this.syncDoorScene(snap);
  }

  private paintTutorialArrows(snap: SimSnapshot): void {
    if (!isTutorialMode() || this.settingsOpen) {
      this.arrows.clear();
      return;
    }
    const spots = [];
    for (const hint of tutorialHints(snap)) {
      if (hint.kind === "hitTheRoad" && this.roleBtn.visible) {
        spots.push({ id: hint.id, x: this.roleBtn.x - 125, y: this.roleBtn.y - 10 });
      } else if (hint.kind === "phone" && this.phone.visible) {
        spots.push({ id: hint.id, x: this.phone.x, y: this.phone.y - 70 });
      } else if (hint.kind === "idCard" && this.idPanel.visible) {
        spots.push({ id: hint.id, x: this.idPanel.x, y: this.idPanel.y - 140 });
      } else if (hint.kind === "movePad" && this.padRing.visible) {
        spots.push({ id: hint.id, x: this.padCenter.x, y: this.padCenter.y - 140 });
      }
    }
    this.arrows.sync(spots);
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

    const panelW = 420;
    const panelH = 196;
    const panelX = GAME_WIDTH - 24 - panelW;
    const panelY = GAME_HEIGHT - 24 - 168 - panelH;
    const bg = addPanel(this, 0, 0, panelW, panelH, {
      radius: 4,
      fill: 0xfffaf3,
      stroke: Color.woodTrim,
      depth: 41,
    });
    const title = addUiText(this, 24, 18, "SETTINGS", {
      size: Type.heading,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    });
    const label = addUiText(this, 24, 78, "Tutorial arrows", {
      size: Type.body,
      color: Color.inkHex,
      fontStyle: "600",
      strokeThickness: 0,
    });
    const hint = addUiText(this, 24, 112, "A bouncing arrow marks every tap\nthe shop needs from you next.", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "600",
      strokeThickness: 0,
      lineSpacing: 4,
    });
    this.tutorialValue = addUiText(this, panelW - 28, 86, "", {
      size: Type.heading,
      color: Color.inkHex,
      fontStyle: "700",
      strokeThickness: 0,
    }).setOrigin(1, 0.5);
    const hit = this.add
      .rectangle(panelW / 2, 96, panelW - 24, 88, 0x000000, 0.001)
      .setInteractive({ useHandCursor: true });
    hit.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      setTutorialMode(!isTutorialMode());
      this.refreshTutorialToggle();
    });
    this.settingsPanel = this.add.container(panelX, panelY, [bg, title, label, hint, this.tutorialValue, hit]);
    this.settingsPanel.setDepth(41).setVisible(false);

    const cogX = GAME_WIDTH - 24;
    const cogY = GAME_HEIGHT - 20;
    this.cog = this.add
      .image(cogX, cogY, "tex-cog")
      .setOrigin(1, 1)
      .setScale(1.55)
      .setDepth(42)
      .setInteractive({ useHandCursor: true });
    const toggleSettings = (p: Phaser.Input.Pointer): void => {
      p.event.stopPropagation();
      if (this.settingsOpen) this.closeSettings();
      else this.openSettings();
    };
    this.cog.on("pointerdown", toggleSettings);
    this.cogCaption = addUiText(this, cogX - 8, cogY - 64 * 1.55 - 4, "Settings", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 8, y: 3 },
      fontStyle: "600",
    })
      .setOrigin(1, 1)
      .setDepth(42)
      .setInteractive({ useHandCursor: true });
    this.cogCaption.on("pointerdown", toggleSettings);
    this.refreshTutorialToggle();
  }

  private openSettings(): void {
    this.settingsOpen = true;
    this.settingsDim.setVisible(true).setInteractive();
    this.settingsPanel.setVisible(true);
    this.refreshTutorialToggle();
    this.arrows.clear();
  }

  private closeSettings(): void {
    this.settingsOpen = false;
    this.settingsDim.setVisible(false).disableInteractive();
    this.settingsPanel.setVisible(false);
  }

  private refreshTutorialToggle(): void {
    const on = isTutorialMode();
    this.tutorialValue.setText(on ? "ON" : "OFF");
    this.tutorialValue.setColor(on ? "#3d6a44" : Color.muteHex);
  }

  private drawPad(): void {
    const { x, y } = this.padCenter;
    this.padRing.clear();
    this.padRing.fillStyle(Color.ink, 0.4);
    this.padRing.fillCircle(x, y, 108);
    this.padRing.lineStyle(5, Color.lime, 0.85);
    this.padRing.strokeCircle(x, y, 108);
    this.padRing.lineStyle(3, Color.cream, 0.35);
    this.padRing.strokeCircle(x, y, 76);
  }

  private syncDoorScene(snap: SimSnapshot): void {
    const wantDoor = snap.playerRole === "driver" && snap.dropoff.phase === "atDoor";
    const doorUp = this.scene.isActive("door") && !this.scene.isSleeping("door");
    if (wantDoor && !doorUp) {
      this.scene.sleep("drive");
      if (this.scene.isSleeping("door")) this.scene.wake("door");
      else this.scene.launch("door");
      this.scene.bringToTop("door");
      this.scene.bringToTop();
    } else if (!wantDoor && doorUp) {
      this.scene.sleep("door");
      if (snap.playerRole === "driver" && this.scene.isSleeping("drive")) this.scene.wake("drive");
      this.scene.bringToTop();
    }
  }

  private onRole(): void {
    const sim = getSim();
    if (sim.snapshot().playerRole !== "keyLead") return;
    if (!sim.hitTheRoad()) return;
    this.showDrive();
  }

  private showDrive(): void {
    this.scene.sleep("shop");
    this.scene.sleep("door");
    if (this.scene.isSleeping("drive")) this.scene.wake("drive");
    else if (!this.scene.isActive("drive")) this.scene.launch("drive");
    this.scene.bringToTop();
  }

  private showShop(): void {
    this.scene.sleep("drive");
    this.scene.sleep("door");
    this.scene.wake("shop");
    this.scene.bringToTop();
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
    if (d <= 120) this.pointerId = p.id;
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.pointerId === p.id) this.pointerId = null;
  }
}
