import Phaser from "phaser";
import { UI_FONT, textResolution } from "./textResolution";

export { UI_FONT, textResolution };

export interface UiTextOptions {
  size?: string | number;
  color?: string;
  backgroundColor?: string;
  align?: string;
  padding?: { x?: number; y?: number };
  fontStyle?: string;
  wordWrap?: { width: number };
  strokeThickness?: number;
  lineSpacing?: number;
}

export function addUiText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: UiTextOptions = {},
): Phaser.GameObjects.Text {
  const text = scene.add.text(x, y, content, {
    fontFamily: UI_FONT,
    fontSize: options.size ?? "18px",
    color: options.color ?? "#f4e8c1",
    backgroundColor: options.backgroundColor,
    align: options.align,
    padding: options.padding,
    fontStyle: options.fontStyle,
    lineSpacing: options.lineSpacing ?? 8,
    wordWrap: options.wordWrap,
    stroke: options.backgroundColor || options.strokeThickness === 0 ? "#00000000" : "#120c08",
    strokeThickness: options.strokeThickness ?? (options.backgroundColor ? 0 : 4),
  });
  text.setResolution(textResolution());
  text.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return text;
}
