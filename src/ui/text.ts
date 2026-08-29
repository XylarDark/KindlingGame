import Phaser from "phaser";
import { addType, type TypeStyle } from "./typekit";

export { UI_FONT } from "./typekit";
export { typeResolution as textResolution } from "./typekit";

export type UiTextOptions = TypeStyle;

export function addUiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: UiTextOptions = {},
): Phaser.GameObjects.Text {
  return addType(scene, x, y, content, options);
}
