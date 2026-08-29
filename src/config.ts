import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { DriveScene } from "./scenes/DriveScene";
import { HudScene } from "./scenes/HudScene";
import { ShopScene } from "./scenes/ShopScene";
import { TitleScene } from "./scenes/TitleScene";
import { GAME_HEIGHT, GAME_WIDTH } from "./sim/constants";

export const gameConfig: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  parent: "game-root",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#241c16",
  pixelArt: true,
  roundPixels: true,
  antialias: false,
  render: {
    pixelArt: true,
    roundPixels: true,
    antialias: false,
    antialiasGL: false,
    powerPreference: "high-performance",
  },
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  input: {
    activePointers: 3,
  },
  scene: [BootScene, TitleScene, ShopScene, DriveScene, HudScene],
};
