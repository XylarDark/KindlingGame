import Phaser from "phaser";
import { MARK } from "./copy";
import {
  capsTracking,
  currentDpr,
  displayFit,
  isAllCaps,
  overlayStroke,
  parseFontPx,
  typeResolution,
  UI_FONT,
} from "./typeMetrics";
import { VIEWFIT_EVENT } from "./viewFit";

export { capsTracking, currentDpr, displayFit, isAllCaps, overlayStroke, parseFontPx, typeResolution, UI_FONT };
export type { TypeResolutionInput } from "./typeMetrics";

const TYPEKIT_DATA = "kindlingTypekit";
const MIN_FIT_PX = 12;

function enableCanvasSmoothing(text: Phaser.GameObjects.Text): void {
  const ctx = text.context;
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
}

/** Apply high-DPI raster + LINEAR filter. Safe to call after setText / resize. */
export function polishText(text: Phaser.GameObjects.Text, scene?: Phaser.Scene): Phaser.GameObjects.Text {
  const host = scene ?? text.scene;
  const objectScale = Math.max(Math.abs(text.scaleX), Math.abs(text.scaleY), 1);
  const res = typeResolution({
    dpr: currentDpr(),
    fit: displayFit(host?.scale),
    objectScale,
  });
  if (text.style.resolution !== res) text.setResolution(res);
  enableCanvasSmoothing(text);
  text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  text.setData(TYPEKIT_DATA, true);
  return text;
}

function trackingFor(content: string, px: number, explicit?: number): number {
  if (explicit !== undefined) return explicit;
  return isAllCaps(content) ? capsTracking(px) : 0;
}

function applyTracking(text: Phaser.GameObjects.Text, content: string, explicit?: number): void {
  const px = parseFontPx(text.style.fontSize);
  text.setLetterSpacing(trackingFor(content, px, explicit));
}

function bindPolish(text: Phaser.GameObjects.Text, scene: Phaser.Scene, explicitTracking?: number): void {
  const raw = text.setText.bind(text);
  text.setText = ((value: string | string[]) => {
    raw(value);
    const content = Array.isArray(value) ? value.join("\n") : value;
    applyTracking(text, content, explicitTracking);
    return polishText(text, scene);
  }) as typeof text.setText;
}

/** Shrink font size to fit, never bitmap-scale (that pixelates). */
export function fitTypeToWidth(text: Phaser.GameObjects.Text, maxWidth: number, minPx = MIN_FIT_PX): Phaser.GameObjects.Text {
  text.setScale(1);
  let px = parseFontPx(text.style.fontSize);
  const floor = Math.max(minPx, MIN_FIT_PX);
  while (px > floor && text.width > maxWidth) {
    px -= 1;
    text.setFontSize(px);
  }
  applyTracking(text, text.text, text.getData("typekitTracking"));
  return polishText(text, text.scene);
}

export interface TypeStyle {
  size?: string | number;
  color?: string;
  backgroundColor?: string;
  align?: string;
  padding?: { x?: number; y?: number };
  fontStyle?: string;
  wordWrap?: { width: number };
  stroke?: string;
  strokeThickness?: number;
  lineSpacing?: number;
  letterSpacing?: number;
}

function canvasStyle(options: TypeStyle): Phaser.Types.GameObjects.Text.TextStyle {
  const strokeOff = options.strokeThickness === 0 || (options.strokeThickness === undefined && !options.stroke);
  return {
    fontFamily: UI_FONT,
    fontSize: options.size ?? "20px",
    color: options.color ?? "#f4e8c1",
    backgroundColor: options.backgroundColor,
    align: options.align,
    padding: options.padding,
    fontStyle: options.fontStyle ?? "600",
    lineSpacing: options.lineSpacing ?? 6,
    wordWrap: options.wordWrap,
    stroke: options.stroke ?? (strokeOff ? "#00000000" : "#140e0a"),
    strokeThickness: options.strokeThickness ?? (strokeOff ? 0 : 2),
  };
}

function finishType(
  text: Phaser.GameObjects.Text,
  scene: Phaser.Scene,
  content: string,
  options: TypeStyle,
): Phaser.GameObjects.Text {
  applyTracking(text, content, options.letterSpacing);
  if (options.letterSpacing !== undefined) text.setData("typekitTracking", options.letterSpacing);
  bindPolish(text, scene, options.letterSpacing);
  return polishText(text, scene);
}

export function makeType(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: TypeStyle = {},
): Phaser.GameObjects.Text {
  const text = scene.make.text({
    x,
    y,
    add: false,
    text: content,
    style: canvasStyle(options),
  });
  return finishType(text, scene, content, options);
}

export function addType(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: TypeStyle = {},
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, content, canvasStyle(options));
  return finishType(text, scene, content, options);
}

/** Shop mark: KINDLING, tracked caps, no bitmap scale. */
export function addMark(
  scene: Phaser.Scene,
  x: number,
  y: number,
  options: TypeStyle & { maxWidth?: number } = {},
): Phaser.GameObjects.Text {
  const { maxWidth, ...style } = options;
  const px = parseFontPx(style.size ?? "24px");
  const text = addType(scene, x, y, MARK, {
    fontStyle: "700",
    strokeThickness: 0,
    letterSpacing: capsTracking(px),
    ...style,
  });
  if (maxWidth) fitTypeToWidth(text, maxWidth, 12);
  return text;
}

function eachText(obj: Phaser.GameObjects.GameObject, visit: (text: Phaser.GameObjects.Text) => void): void {
  if (obj instanceof Phaser.GameObjects.Text) visit(obj);
  if (obj instanceof Phaser.GameObjects.Container) {
    for (const child of obj.list) eachText(child as Phaser.GameObjects.GameObject, visit);
  }
}

export function refreshTypekit(game: Phaser.Game): void {
  for (const scene of game.scene.getScenes(true)) {
    scene.children.each((obj) => {
      eachText(obj as Phaser.GameObjects.GameObject, (text) => {
        if (text.getData(TYPEKIT_DATA)) polishText(text, scene);
      });
    });
  }
}

/** Keep raster density in sync when CSS stretch changes the canvas size. */
export function installTypekit(game: Phaser.Game): void {
  if (game.registry.get("kindlingTypekitInstalled")) return;
  game.registry.set("kindlingTypekitInstalled", true);
  game.scale.on(Phaser.Scale.Events.RESIZE, () => refreshTypekit(game));
  game.events.on(VIEWFIT_EVENT, () => refreshTypekit(game));
}
