import Phaser from "phaser";
import { MARK } from "./copy";
import { TYPE_MIN_FIT_PX, Type, designPxForMinCss } from "./theme";
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
import { VIEWFIT_EVENT, getStageContainScale } from "./viewFit";

export { capsTracking, currentDpr, displayFit, isAllCaps, overlayStroke, parseFontPx, typeResolution, UI_FONT };
export type { TypeResolutionInput } from "./typeMetrics";

const TYPEKIT_DATA = "kindlingTypekit";
const TYPEKIT_BOX = "typekitBox";
const MIN_FIT_PX = TYPE_MIN_FIT_PX;

type TypeBox = {
  maxWidth?: number;
  maxHeight?: number;
  minPx?: number;
  /** Recompute design floor from on-screen CSS px on each fit (viewfit-safe). */
  minCssFloor?: number;
  basePx?: number;
  noWrap?: boolean;
};

function enableCanvasSmoothing(text: Phaser.GameObjects.Text): void {
  const ctx = text.context;
  if (!ctx) return;
  ctx.imageSmoothingEnabled = true;
  if ("imageSmoothingQuality" in ctx) ctx.imageSmoothingQuality = "high";
}

/** Apply high-DPI raster + LINEAR filter. Safe to call after setText / resize. */
export function polishText(text: Phaser.GameObjects.Text, scene?: Phaser.Scene): Phaser.GameObjects.Text {
  const host = scene ?? text.scene;
  text.setScale(1);
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
  // Multi-line labels: tracking fights word-wrap math and clips edges.
  if (content.includes("\n")) return 0;
  return isAllCaps(content) ? capsTracking(px) : 0;
}

function applyTracking(text: Phaser.GameObjects.Text, content: string, explicit?: number): void {
  const px = parseFontPx(text.style.fontSize);
  text.setLetterSpacing(trackingFor(content, px, explicit));
}

function padExtents(text: Phaser.GameObjects.Text): { x: number; y: number } {
  const p = text.padding;
  return {
    x: (p?.left ?? 0) + (p?.right ?? 0),
    y: (p?.top ?? 0) + (p?.bottom ?? 0),
  };
}

/**
 * Shrink font size until the glyph box fits — never bitmap-scale (that pixelates).
 * Wrap width is padded conservatively so letter-spacing cannot spill past the box.
 */
export function fitTypeToBox(
  text: Phaser.GameObjects.Text,
  maxWidth?: number,
  maxHeight?: number,
  minPx = MIN_FIT_PX,
): Phaser.GameObjects.Text {
  text.setScale(1);
  const box: TypeBox = text.getData(TYPEKIT_BOX) ?? {};
  const basePx = box.basePx ?? parseFontPx(text.style.fontSize);
  const cssFloor =
    box.minCssFloor !== undefined
      ? designPxForMinCss(box.minCssFloor, getStageContainScale())
      : 0;
  const floor = Math.max(MIN_FIT_PX, minPx, cssFloor);
  let px = basePx;

  const widthLimit = maxWidth ?? box.maxWidth;
  const heightLimit = maxHeight ?? box.maxHeight;
  const noWrap = box.noWrap ?? false;

  const applySize = (size: number): void => {
    text.setFontSize(size);
    applyTracking(text, text.text, text.getData("typekitTracking"));
    const pad = padExtents(text);
    if (noWrap) {
      text.setStyle({ wordWrap: { width: 0 } });
    } else if (widthLimit && widthLimit > 0) {
      // Phaser wrap ignores letter-spacing; keep a small safety gutter.
      const gutter = Math.max(4, Math.round(size * 0.35));
      const wrapW = Math.max(8, widthLimit - pad.x - gutter);
      text.setStyle({ wordWrap: { width: wrapW } });
    }
    text.updateText();
  };

  applySize(px);

  let guard = 0;
  while (px > floor && guard++ < 200) {
    const tooWide = widthLimit !== undefined && widthLimit > 0 && text.width > widthLimit + 0.5;
    const tooTall = heightLimit !== undefined && heightLimit > 0 && text.height > heightLimit + 0.5;
    if (!tooWide && !tooTall) break;
    px -= 1;
    applySize(px);
  }

  text.setData(TYPEKIT_BOX, {
    maxWidth: widthLimit,
    maxHeight: heightLimit,
    minPx: floor,
    minCssFloor: box.minCssFloor,
    basePx,
    noWrap,
  } satisfies TypeBox);
  return polishText(text, text.scene);
}

/** @deprecated Prefer fitTypeToBox — kept for call sites that only constrain width. */
export function fitTypeToWidth(text: Phaser.GameObjects.Text, maxWidth: number, minPx = MIN_FIT_PX): Phaser.GameObjects.Text {
  return fitTypeToBox(text, maxWidth, undefined, minPx);
}

/**
 * Move a boxed label's type step at runtime. `setFontSize` alone does not survive here:
 * shrink-to-fit always restarts from the size the label was authored with, so the next
 * refit — a viewport change is enough — would put the old step back. The seed lives in
 * the stored box, and this is the only way to move it.
 */
export function retypeSize(text: Phaser.GameObjects.Text, px: number): Phaser.GameObjects.Text {
  const box = (text.getData(TYPEKIT_BOX) as TypeBox | undefined) ?? {};
  text.setData(TYPEKIT_BOX, { ...box, basePx: px } satisfies TypeBox);
  return fitTypeToBox(text, box.maxWidth, box.maxHeight, box.minPx ?? MIN_FIT_PX);
}

/** Re-run shrink-to-fit after padding / color chrome changes. */
export function refitType(text: Phaser.GameObjects.Text): Phaser.GameObjects.Text {
  refitStoredBox(text);
  return text;
}

function refitStoredBox(text: Phaser.GameObjects.Text): void {
  const box = text.getData(TYPEKIT_BOX) as TypeBox | undefined;
  if (!box) return;
  fitTypeToBox(text, box.maxWidth, box.maxHeight, box.minPx ?? MIN_FIT_PX);
}

function bindPolish(text: Phaser.GameObjects.Text, scene: Phaser.Scene, explicitTracking?: number): void {
  const raw = text.setText.bind(text);
  text.setText = ((value: string | string[]) => {
    raw(value);
    const content = Array.isArray(value) ? value.join("\n") : value;
    applyTracking(text, content, explicitTracking);
    polishText(text, scene);
    refitStoredBox(text);
    return text;
  }) as typeof text.setText;
}

export interface TypeStyle {
  size?: string | number;
  color?: string;
  align?: string;
  padding?: { x?: number; y?: number };
  fontStyle?: string;
  wordWrap?: { width: number };
  stroke?: string;
  strokeThickness?: number;
  lineSpacing?: number;
  letterSpacing?: number;
  /** Shrink until glyphs fit this width (also sets word wrap). */
  maxWidth?: number;
  /** Shrink until glyphs fit this height. */
  maxHeight?: number;
  /** Floor for shrink-to-fit (default {@link TYPE_MIN_FIT_PX}). */
  minPx?: number;
  /**
   * On-screen CSS px floor. Converted to design px via current contain scale on each
   * fit so viewfit refresh cannot silently drop below the readability contract.
   */
  minCssFloor?: number;
  /** Keep authored line breaks — shrink to fit width instead of wrapping. */
  noWrap?: boolean;
}

function canvasStyle(options: TypeStyle): Phaser.Types.GameObjects.Text.TextStyle {
  const strokeOff = options.strokeThickness === 0 || (options.strokeThickness === undefined && !options.stroke);
  const fontSize = options.size ?? Type.body;
  const px = parseFontPx(fontSize);
  const padX = ((options.padding?.x ?? 0) * 2);
  const rawWrap = options.noWrap ? undefined : (options.wordWrap?.width ?? options.maxWidth);
  const wrapW = rawWrap ? Math.max(8, rawWrap - padX - Math.max(4, Math.round(px * 0.35))) : undefined;
  return {
    fontFamily: UI_FONT,
    fontSize,
    color: options.color ?? "#f4e8c1",
    // No `backgroundColor`: a text's own background is a flat rect that cannot carry a
    // border, and every text box in this game is a sign plaque instead. Boxed copy goes
    // through `addSignText`, which is why this option is not offered.
    align: options.align,
    padding: options.padding,
    fontStyle: options.fontStyle ?? "600",
    lineSpacing: options.lineSpacing ?? Math.max(2, Math.round(px * 0.2)),
    wordWrap: wrapW ? { width: wrapW } : undefined,
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
  const basePx = parseFontPx(options.size ?? Type.body);
  text.setData(TYPEKIT_BOX, {
    maxWidth: options.maxWidth ?? options.wordWrap?.width,
    maxHeight: options.maxHeight,
    minPx: options.minPx ?? MIN_FIT_PX,
    minCssFloor: options.minCssFloor,
    basePx,
    noWrap: options.noWrap ?? false,
  } satisfies TypeBox);
  applyTracking(text, content, options.letterSpacing);
  if (options.letterSpacing !== undefined) text.setData("typekitTracking", options.letterSpacing);
  bindPolish(text, scene, options.letterSpacing);
  polishText(text, scene);
  if (options.maxWidth || options.maxHeight || options.wordWrap) {
    fitTypeToBox(text, options.maxWidth ?? options.wordWrap?.width, options.maxHeight, options.minPx);
  }
  return text;
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
  const { maxWidth, maxHeight, minPx, ...style } = options;
  const px = parseFontPx(style.size ?? Type.heading);
  const text = addType(scene, x, y, MARK, {
    fontStyle: "700",
    strokeThickness: 0,
    letterSpacing: capsTracking(px),
    maxWidth,
    maxHeight,
    minPx: minPx ?? MIN_FIT_PX,
    ...style,
  });
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
        if (text.getData(TYPEKIT_DATA)) {
          polishText(text, scene);
          refitStoredBox(text);
        }
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
