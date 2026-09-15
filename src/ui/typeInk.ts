import Phaser from "phaser";
import { parseFontPx } from "./typeMetrics";

/** Marks ink created from the Inter role atlas (BitmapText) vs canvas Text. */
export const TYPE_ATLAS_INK = "kindlingAtlasInk";
export const TYPE_ATLAS_FONT = "kindlingAtlasFont";

export type UiInk = Phaser.GameObjects.Text | Phaser.GameObjects.BitmapText;

export function isAtlasInk(ink: UiInk): ink is Phaser.GameObjects.BitmapText {
  if (typeof ink.getData !== "function") return false;
  return ink.getData(TYPE_ATLAS_INK) === true;
}

export function inkCopy(ink: UiInk): string {
  return String(ink.text ?? "");
}

export function inkOriginX(ink: UiInk): number {
  return ink.originX;
}

export function inkOriginY(ink: UiInk): number {
  return ink.originY;
}

export function inkDepth(ink: UiInk): number {
  return ink.depth;
}

export function inkVisible(ink: UiInk): boolean {
  return ink.visible;
}

export function inkLineSpacing(ink: UiInk): number {
  if (isAtlasInk(ink)) return ink.lineSpacing ?? 0;
  return ink.lineSpacing;
}

export function inkPadding(ink: UiInk): { left: number; top: number; right: number; bottom: number } {
  if (isAtlasInk(ink)) return { left: 0, top: 0, right: 0, bottom: 0 };
  const p = ink.padding;
  return { left: p?.left ?? 0, top: p?.top ?? 0, right: p?.right ?? 0, bottom: p?.bottom ?? 0 };
}

export function inkRefresh(ink: UiInk): void {
  if (!isAtlasInk(ink)) ink.updateText();
}

export function inkWidth(ink: UiInk): number {
  return ink.width;
}

export function inkHeight(ink: UiInk): number {
  return ink.height;
}

export function inkSetPosition(ink: UiInk, x: number, y: number): void {
  ink.setPosition(x, y);
}

export function inkSetDepth(ink: UiInk, depth: number): void {
  ink.setDepth(depth);
}

export function inkSetVisible(ink: UiInk, visible: boolean): void {
  ink.setVisible(visible);
}

export function inkSetText(ink: UiInk, value: string): UiInk {
  ink.setText(value);
  return ink;
}

export function inkSetOrigin(ink: UiInk, x?: number, y?: number): UiInk {
  return ink.setOrigin(x, y);
}

export function inkSetFontSize(ink: UiInk, size: string | number): UiInk {
  if (isAtlasInk(ink)) return ink;
  return ink.setFontSize(size);
}

export function inkLocalBounds(ink: UiInk): { width: number; height: number } {
  if (isAtlasInk(ink)) {
    const bounds = ink.getTextBounds(false);
    return { width: bounds.local.width, height: bounds.local.height };
  }
  return { width: ink.width, height: ink.height };
}

export function hexToTint(hex: string): number {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  return Number.isFinite(n) ? n : 0x140e0a;
}

export function inkFontSizePx(ink: UiInk): number {
  if (isAtlasInk(ink)) {
    const box = ink.getData("typekitBox") as { basePx?: number } | undefined;
    return box?.basePx ?? 18;
  }
  return parseFontPx(ink.style.fontSize);
}

export function inkSetColor(ink: UiInk, color: string): void {
  if (isAtlasInk(ink)) ink.setTint(hexToTint(color));
  else ink.setColor(color);
}

export function inkSetStroke(ink: UiInk, stroke: string, thickness: number): void {
  if (!isAtlasInk(ink)) ink.setStroke(stroke, thickness);
}

export function inkSetPadding(ink: UiInk, left: number, top: number, right: number, bottom: number): void {
  if (!isAtlasInk(ink)) ink.setPadding(left, top, right, bottom);
}
