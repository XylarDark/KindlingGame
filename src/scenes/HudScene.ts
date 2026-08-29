import Phaser from "phaser";
import { clampInput } from "../input/controls";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { getSim } from "../session";
import { addHudButton, addPanel, setButtonLabel } from "../ui/chrome";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";

export class HudScene extends Phaser.Scene {
  private scoreText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private serveText!: Phaser.GameObjects.Text;
  private stepText!: Phaser.GameObjects.Text;
  private roleBtn!: Phaser.GameObjects.Container;
  private interactBtn!: Phaser.GameObjects.Container;
  private rotateHint!: Phaser.GameObjects.Text;
  private padRing!: Phaser.GameObjects.Graphics;
  private padKnob!: Phaser.GameObjects.Arc;
  private padLabel!: Phaser.GameObjects.Text;
  private phone!: Phaser.GameObjects.Image;
  private phoneCaption!: Phaser.GameObjects.Text;
  private idPanel!: Phaser.GameObjects.Container;
  private idName!: Phaser.GameObjects.Text;
  private flash!: Phaser.GameObjects.Rectangle;
  private sawPhoto = false;
  private padCenter = { x: 150, y: GAME_HEIGHT - 150 };
  private pointerId: number | null = null;
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;

  constructor() {
    super("hud");
  }

  create(): void {
    this.input.setTopOnly(false);
    addPanel(this, 16, 12, 250, 88, { depth: 19, radius: 4 });
    addPanel(this, 282, 12, 980, 88, { depth: 19, radius: 4 });
    addPanel(this, 1278, 12, 180, 88, { depth: 19, radius: 4 });

    this.scoreText = addUiText(this, 36, 28, "", {
      size: Type.heading,
      color: Color.limeHex,
      fontStyle: "700",
    }).setDepth(20);
    addUiText(this, 36, 62, "SCORE", {
      size: Type.caption,
      color: Color.muteHex,
      fontStyle: "600",
    }).setDepth(20);

    this.serveText = addUiText(this, 302, 26, "", {
      size: Type.body,
      color: Color.limeHex,
      fontStyle: "700",
      wordWrap: { width: 940 },
    }).setDepth(20);
    this.stepText = addUiText(this, 302, 58, "", {
      size: Type.caption,
      color: Color.creamHex,
      wordWrap: { width: 940 },
    }).setDepth(20);

    this.clockText = addUiText(this, 1368, 36, "", {
      size: Type.title,
      color: Color.creamHex,
      fontStyle: "700",
    })
      .setOrigin(0.5, 0)
      .setDepth(20);

    this.roleBtn = addHudButton(this, GAME_WIDTH - 16, 16, "HIT THE ROAD", () => this.onRole(), {
      originX: 1,
      originY: 0,
      variant: "primary",
      minWidth: 250,
    });
    this.interactBtn = addHudButton(this, GAME_WIDTH - 16, GAME_HEIGHT - 16, "HANDOFF", () => getSim().queueInteract(), {
      originX: 1,
      originY: 1,
      variant: "amber",
      minWidth: 220,
    });

    this.phone = this.add
      .image(GAME_WIDTH - 130, GAME_HEIGHT - 250, "tex-phone")
      .setScale(2)
      .setDepth(22)
      .setInteractive({ useHandCursor: true })
      .setVisible(false);
    this.phone.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.phoneCaption = addUiText(this, GAME_WIDTH - 130, GAME_HEIGHT - 175, "tap phone", {
      size: Type.caption,
      color: Color.neonHex,
      fontStyle: "600",
    })
      .setOrigin(0.5, 0)
      .setDepth(22)
      .setVisible(false);

    this.idName = addUiText(this, 0, -20, "", {
      size: Type.body,
      color: Color.inkHex,
      align: "center",
      fontStyle: "600",
    }).setOrigin(0.5);
    const idTitle = addUiText(this, 0, -88, "CUSTOMER ID", {
      size: Type.caption,
      color: Color.inkHex,
      fontStyle: "700",
    }).setOrigin(0.5);
    const idDob = addUiText(this, 0, 18, "DOB  14 Mar 1999   ·   21+", {
      size: Type.caption,
      color: "#3a2418",
    }).setOrigin(0.5);
    const idHint = addUiText(this, 0, 70, "tap card or CHECK ID", {
      size: Type.caption,
      color: "#3d7a45",
      fontStyle: "600",
    }).setOrigin(0.5);
    const idBg = this.add.rectangle(0, 0, 420, 240, 0xf4e8c1, 0.97).setStrokeStyle(4, 0x3d7a45).setInteractive({ useHandCursor: true });
    idBg.on("pointerdown", (p: Phaser.Input.Pointer) => {
      p.event.stopPropagation();
      getSim().queueInteract();
    });
    this.idPanel = this.add.container(GAME_WIDTH / 2, GAME_HEIGHT / 2, [idBg, idTitle, this.idName, idDob, idHint]);
    this.idPanel.setDepth(25).setVisible(false);

    this.flash = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0xffffff, 0).setDepth(24);

    this.padRing = this.add.graphics().setDepth(19);
    this.drawPad();
    this.padKnob = this.add.circle(this.padCenter.x, this.padCenter.y, 32, Color.cream, 0.92).setDepth(20);
    this.padLabel = addUiText(this, this.padCenter.x, this.padCenter.y - 108, "MOVE", {
      size: Type.caption,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 8, y: 4 },
      fontStyle: "600",
    })
      .setOrigin(0.5, 1)
      .setDepth(20);

    this.rotateHint = addUiText(this, GAME_WIDTH / 2, 200, "rotate your phone for the shop", {
      size: Type.heading,
      color: Color.creamHex,
      backgroundColor: "#1c1612ee",
      padding: { x: 20, y: 14 },
      fontStyle: "600",
    })
      .setOrigin(0.5)
      .setDepth(30)
      .setVisible(false);

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
  }

  update(_time: number, delta: number): void {
    const sim = getSim();
    const { dx, dy } = this.readInput();
    sim.setPlayerInput(dx, dy);
    sim.tick(delta);

    const snap = sim.snapshot();
    this.scoreText.setText(String(snap.score));
    this.clockText.setText(snap.clockLabel);
    this.serveText.setText(snap.serveLine);
    this.stepText.setText(snap.toast);
    setButtonLabel(this.roleBtn, snap.playerRole === "keyLead" ? "HIT THE ROAD" : "BACK TO SHOP");
    this.roleBtn.setAlpha(snap.playerRole === "driver" || snap.canHitTheRoad ? 1 : 0.45);

    const drop = snap.dropoff;
    const interactLabel =
      snap.playerRole === "keyLead"
        ? "HANDOFF"
        : drop.actionLabel || "PARK";
    setButtonLabel(this.interactBtn, interactLabel);
    this.interactBtn.setAlpha(snap.playerRole === "keyLead" || drop.canAct || drop.actionLabel === "WALK" ? 1 : 0.55);

    const showPhone = snap.playerRole === "driver" && (drop.phase === "atCurb" || drop.phase === "calling");
    this.phone.setVisible(showPhone);
    this.phoneCaption.setVisible(showPhone);
    this.phoneCaption.setText(drop.phase === "calling" ? "ringing…" : "tap to call");
    this.phone.setAlpha(drop.phase === "calling" ? 0.85 : 1);

    const showId = !!drop.idCard;
    this.idPanel.setVisible(showId);
    if (drop.idCard) this.idName.setText(drop.idCard.name);

    if (drop.photoTaken && !this.sawPhoto) {
      this.sawPhoto = true;
      this.flash.setAlpha(0.85);
      this.tweens.add({ targets: this.flash, alpha: 0, duration: 220 });
    }
    if (!drop.photoTaken) this.sawPhoto = false;

    const driving = snap.playerRole === "driver";
    this.padRing.setVisible(driving);
    this.padKnob.setVisible(driving);
    this.padLabel.setVisible(driving);
    this.rotateHint.setVisible(window.innerHeight > window.innerWidth + 40);
  }

  private drawPad(): void {
    const { x, y } = this.padCenter;
    this.padRing.clear();
    this.padRing.fillStyle(Color.ink, 0.4);
    this.padRing.fillCircle(x, y, 88);
    this.padRing.lineStyle(4, Color.lime, 0.85);
    this.padRing.strokeCircle(x, y, 88);
    this.padRing.lineStyle(2, Color.cream, 0.35);
    this.padRing.strokeCircle(x, y, 62);
  }

  private onRole(): void {
    const sim = getSim();
    const snap = sim.snapshot();
    if (snap.playerRole === "keyLead") {
      if (!sim.hitTheRoad()) return;
      this.showDrive();
    } else {
      sim.backToShop();
      this.showShop();
    }
  }

  private showDrive(): void {
    this.scene.sleep("shop");
    if (this.scene.isSleeping("drive")) this.scene.wake("drive");
    else if (!this.scene.isActive("drive")) this.scene.launch("drive");
    this.scene.bringToTop();
  }

  private showShop(): void {
    this.scene.sleep("drive");
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
      dx = Phaser.Math.Clamp((p.x - this.padCenter.x) / 70, -1, 1);
      dy = Phaser.Math.Clamp((p.y - this.padCenter.y) / 70, -1, 1);
      this.padKnob.setPosition(this.padCenter.x + dx * 40, this.padCenter.y + dy * 40);
    } else {
      this.padKnob.setPosition(this.padCenter.x, this.padCenter.y);
    }
    return clampInput(dx, dy);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (!this.padRing.visible) return;
    const d = Phaser.Math.Distance.Between(p.x, p.y, this.padCenter.x, this.padCenter.y);
    if (d <= 96) this.pointerId = p.id;
  }

  private onPointerUp(p: Phaser.Input.Pointer): void {
    if (this.pointerId === p.id) this.pointerId = null;
  }
}
