import Phaser from "phaser";
import { BootScene } from "./scenes/BootScene";
import { DoorScene } from "./scenes/DoorScene";
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
  backgroundColor: "#1b2238",
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
    // Game stays 1920×1080. Shell sizes #game-root to a uniform 16:9 stage (CSS contain).
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    parent: "game-root",
    expandParent: false,
    autoRound: false,
  },
  input: {
    activePointers: 3,
  },
  scene: [BootScene, ShopScene, DriveScene, DoorScene, HudScene, TitleScene],
};
