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
    // Phaser 3.90: MobilePipeline on iOS/Android (cheaper default batching).
    autoMobilePipeline: true,
  },
  physics: {
    default: "arcade",
    arcade: { gravity: { x: 0, y: 0 }, debug: false },
  },
  scale: {
    // Design layout is 1920×1080; RenderBudget may shrink the WebGL buffer via scale.resize
    // + camera zoom. Shell sizes #game-root to a uniform 16:9 stage (CSS contain).
    mode: Phaser.Scale.NONE,
    autoCenter: Phaser.Scale.NO_CENTER,
    parent: "game-root",
    expandParent: false,
    autoRound: false,
  },
  input: {
    activePointers: 3,
  },
  // Smoothed delta: hitch frames ease instead of stalling (product feel over wall-clock sim).
  fps: {
    smoothStep: true,
    // Desktop target; coarse phones override limit/target to 30 in main.ts.
    target: 60,
  },
  scene: [BootScene, ShopScene, DriveScene, DoorScene, HudScene, TitleScene],
};
