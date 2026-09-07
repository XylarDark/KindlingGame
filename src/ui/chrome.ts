import Phaser from "phaser";
import { Color, Type } from "./theme";
import { addUiText } from "./text";
import { HUD_TOUCH_MIN_DESIGN } from "./viewFit";

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

/** Tall enough that a stretched phone canvas still hits ~44 CSS px. */
export const HUD_BUTTON_MIN_H = HUD_TOUCH_MIN_DESIGN;

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
    caption?: string;
    /** Overrides for panels that run their own type step (e.g. settings). */
    labelSize?: string;
    captionSize?: string;
  } = {},
): Phaser.GameObjects.Container {
  const originX = opts.originX ?? 1;
  const originY = opts.originY ?? 0;
  const variant = opts.variant ?? "primary";
  const palette =
    variant === "primary"
      ? { fill: Color.leaf, text: Color.creamHex, stroke: 0x2a4a28, caption: Color.creamSoftHex }
      : variant === "amber"
        ? { fill: Color.amber, text: "#fff6e8", stroke: 0x6a2a10, caption: "#ffe8d0" }
        : { fill: 0x241c16, text: Color.creamHex, stroke: Color.panelStroke, caption: Color.muteHex };

  const text = addUiText(scene, 0, 0, label, {
    size: opts.labelSize ?? Type.heading,
    color: palette.text,
    fontStyle: "700",
    align: "center",
    strokeThickness: 0,
    maxWidth: Math.max(160, (opts.minWidth ?? 260) - 56),
    maxHeight: 36,
  }).setOrigin(0.5);
  const caption = addUiText(scene, 0, 0, opts.caption ?? "", {
    size: opts.captionSize ?? Type.caption,
    color: palette.caption,
    fontStyle: "600",
    align: "center",
    strokeThickness: 0,
    maxWidth: Math.max(160, (opts.minWidth ?? 260) - 48),
    maxHeight: 40,
  }).setOrigin(0.5);

  const CAP_GAP = 6;
  const paint = (pressed: boolean): void => {
    const cap = String(container.getData("caption") ?? "");
    caption.setText(cap);
    caption.setVisible(!!cap);
    const inner = Math.max(text.width, cap ? caption.width : 0);
    const w = Math.max(opts.minWidth ?? 260, inner + 56);
    // Label + caption are one centered stack — never pinned to opposite edges.
    const stackH = text.height + (cap ? CAP_GAP + caption.height : 0);
    const h = Math.max(HUD_BUTTON_MIN_H, stackH + 32);
    const left = -w * originX;
    const top = -h * originY;
    bg.clear();
    bg.fillStyle(palette.fill, pressed ? 0.82 : 1);
    bg.fillRoundedRect(left, top, w, h, 4);
    bg.lineStyle(3, palette.stroke, 1);
    bg.strokeRoundedRect(left, top, w, h, 4);
    const stackTop = top + (h - stackH) / 2;
    text.setPosition(left + w / 2, stackTop + text.height / 2);
    caption.setPosition(left + w / 2, stackTop + text.height + CAP_GAP + caption.height / 2);
    container.setSize(w, h);
    container.setInteractive(
      new Phaser.Geom.Rectangle(left, top, w, h),
      Phaser.Geom.Rectangle.Contains,
    );
    container.input!.cursor = "pointer";
  };

  const bg = scene.add.graphics();
  const container = scene.add.container(x, y, [bg, text, caption]);
  container.setDepth(opts.depth ?? 21);
  container.setData("caption", opts.caption ?? "");
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

  container.setData("setCopy", (next: string, nextCap?: string) => {
    const cap = nextCap ?? "";
    if (text.text === next && container.getData("caption") === cap) return;
    text.setText(next);
    container.setData("caption", cap);
    paint(false);
  });
  container.setData("label", label);
  return container;
}

export function setButtonCopy(button: Phaser.GameObjects.Container, label: string, caption = ""): void {
  const fn = button.getData("setCopy") as ((next: string, cap?: string) => void) | undefined;
  fn?.(label, caption);
}

export function setButtonLabel(button: Phaser.GameObjects.Container, label: string): void {
  setButtonCopy(button, label, String(button.getData("caption") ?? ""));
}

/** Pulse only the button chrome — keep label/caption text fully opaque. */
export function setButtonPulse(button: Phaser.GameObjects.Container, pulse: number, active: boolean): void {
  const alpha = active ? pulse : 1;
  for (const child of button.list) {
    if (child instanceof Phaser.GameObjects.Graphics) child.setAlpha(alpha);
    else if ("setAlpha" in child && typeof child.setAlpha === "function") child.setAlpha(1);
  }
  button.setAlpha(1);
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
    backgroundColor: Color.bannerInk,
    padding: { x: 18, y: 10 },
    align: "center",
    fontStyle: "600",
    maxWidth: width,
    maxHeight: 64,
  })
    .setOrigin(0.5, 0)
    .setDepth(opts.depth ?? 20);
}
