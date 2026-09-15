import { addType, type TypeStyle } from "./typekit";
import type { UiInk } from "./typeInk";

export { UI_FONT } from "./typekit";
export { typeResolution as textResolution } from "./typekit";
export type { UiInk } from "./typeInk";

export type UiTextOptions = TypeStyle;

export function addUiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: UiTextOptions = {},
): UiInk {
  return addType(scene, x, y, content, options);
}
