import Phaser from "phaser";
import { Color, Type } from "./theme";
import { addUiText } from "./text";

export function addPanel(
  scene: Phaser.Scene,
  x: number,
  y: number,
  w: number,
  h: number,
  opts: { depth?: number; alpha?: number; radius?: number; fill?: number; stroke?: number } = {},
): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const radius = opts.radius ?? 4;
  g.fillStyle(opts.fill ?? Color.panel, opts.alpha ?? 0.94);
  g.fillRoundedRect(x, y, w, h, radius);
  g.lineStyle(2, opts.stroke ?? Color.panelStroke, 0.9);
  g.strokeRoundedRect(x, y, w, h, radius);
  if (opts.depth !== undefined) g.setDepth(opts.depth);
  return g;
}

/** Tall enough that FIT-scaled 16:9 still hits ~44pt on iPhone landscape. */
export const HUD_BUTTON_MIN_H = 112;

export function addHudButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  label: string,
  onClick: () => void,
  opts: {
    originX?: number;
    originY?: number;
    variant?: "primary" | "amber" | "ghost";
    depth?: number;
    minWidth?: number;
  } = {},
): Phaser.GameObjects.Container {
  const originX = opts.originX ?? 1;
  const originY = opts.originY ?? 0;
  const variant = opts.variant ?? "primary";
  const palette =
    variant === "primary"
      ? { fill: Color.leaf, text: Color.creamHex, stroke: 0x2a4a28 }
      : variant === "amber"
        ? { fill: Color.amber, text: "#fff6e8", stroke: 0x6a2a10 }
        : { fill: 0x241c16, text: Color.creamHex, stroke: Color.panelStroke };

  const text = addUiText(scene, 0, 0, label, {
    size: Type.heading,
    color: palette.text,
    fontStyle: "700",
    align: "center",
    strokeThickness: 0,
  }).setOrigin(0.5);

  const paint = (pressed: boolean): void => {
    const w = Math.max(opts.minWidth ?? 260, text.width + 56);
    const h = Math.max(HUD_BUTTON_MIN_H, text.height + 40);
    const left = -w * originX;
    const top = -h * originY;
    bg.clear();
    bg.fillStyle(palette.fill, pressed ? 0.82 : 1);
    bg.fillRoundedRect(left, top, w, h, 4);
    bg.lineStyle(3, palette.stroke, 1);
    bg.strokeRoundedRect(left, top, w, h, 4);
    text.setPosition(left + w / 2, top + h / 2);
    container.setSize(w, h);
    container.setInteractive(
      new Phaser.Geom.Rectangle(left, top, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    container.input!.cursor = "pointer";
  };

  const bg = scene.add.graphics();
  const container = scene.add.container(x, y, [bg, text]);
  container.setDepth(opts.depth ?? 21);
  paint(false);

  const hover = !(globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false);
  if (hover) {
    container.on("pointerover", () => paint(true));
    container.on("pointerout", () => paint(false));
  }
  container.on("pointerdown", (p: Phaser.Input.Pointer) => {
    p.event.stopPropagation();
    paint(true);
    onClick();
  });
  container.on("pointerup", () => paint(false));

  container.setData("setLabel", (next: string) => {
    if (text.text === next) return;
    text.setText(next);
    paint(false);
  });
  container.setData("label", label);
  return container;
}

export function setButtonLabel(button: Phaser.GameObjects.Container, label: string): void {
  const fn = button.getData("setLabel") as ((next: string) => void) | undefined;
  fn?.(label);
}

export function wireHover(obj: Phaser.GameObjects.GameObject & { setTint?: (c: number) => unknown; clearTint?: () => unknown }): void {
  obj.on("pointerover", () => obj.setTint?.(0xfff0c0));
  obj.on("pointerout", () => obj.clearTint?.());
}

export function addBanner(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  opts: { depth?: number } = {},
): Phaser.GameObjects.Text {
  return addUiText(scene, x, y, "", {
    size: Type.body,
    color: Color.creamHex,
    backgroundColor: "#1c1612ee",
    padding: { x: 18, y: 10 },
    align: "center",
    wordWrap: { width },
    fontStyle: "600",
  })
    .setOrigin(0.5, 0)
    .setDepth(opts.depth ?? 20);
}
