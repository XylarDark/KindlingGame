import Phaser from "phaser";
import { attachDayNight, detachDayNight } from "./art/dayNightPipeline";
import { gameConfig } from "./config";
import { bootKindlingPwa } from "./pwaUpdate";
import { applyCanvasDisplayScale, installMobileShell } from "./shell";
import { installInstallCoach } from "./ui/installCoach";
import {
  applyRenderBudgetToGame,
  forceRenderBudget,
  getRenderBudget,
  initRenderBudget,
  onRenderBudgetChange,
  setRenderBudgetAuto,
  tickRenderBudget,
} from "./ui/renderBudget";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";

const DAY_NIGHT_SCENES = new Set(["shop", "drive", "door"]);

function syncDayNightCameras(game: Phaser.Game): void {
  const postFx = getRenderBudget().postFx;
  for (const scene of game.scene.getScenes(true)) {
    const key = scene.sys.settings.key;
    if (typeof key !== "string" || !DAY_NIGHT_SCENES.has(key)) continue;
    const cam = scene.cameras?.main;
    if (!cam) continue;
    if (postFx) attachDayNight(cam);
    else detachDayNight(cam);
  }
}

function applyBudget(game: Phaser.Game): void {
  applyRenderBudgetToGame(game);
  applyCanvasDisplayScale(game);
  syncDayNightCameras(game);
}

function startGame(): void {
  const coarse = globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
  initRenderBudget(coarse);
  // Prefer sustained smoothness on phones over chasing 60Hz fill-rate.
  const config: Phaser.Types.Core.GameConfig = {
    ...gameConfig,
    fps: {
      ...(typeof gameConfig.fps === "object" && gameConfig.fps ? gameConfig.fps : {}),
      smoothStep: false,
      target: coarse ? 30 : 60,
      limit: coarse ? 30 : 0,
    },
  };
  const game = new Phaser.Game(config);
  installMobileShell(game);
  installInstallCoach();
  onRenderBudgetChange(() => applyBudget(game));
  game.events.once(Phaser.Core.Events.READY, () => applyBudget(game));
  // Dev-only handle for the typography/layout QA harness (see docs/qa-typography.md).
  if (import.meta.env.DEV) {
    const handle = globalThis as unknown as {
      kindlingGame?: Phaser.Game;
      kindlingRenderBudget?: {
        get: typeof getRenderBudget;
        apply: () => void;
        tick: typeof tickRenderBudget;
        init: typeof initRenderBudget;
        force: typeof forceRenderBudget;
        setAuto: typeof setRenderBudgetAuto;
      };
    };
    handle.kindlingGame = game;
    handle.kindlingRenderBudget = {
      get: getRenderBudget,
      apply: () => applyBudget(game),
      tick: tickRenderBudget,
      init: initRenderBudget,
      force: forceRenderBudget,
      setAuto: setRenderBudgetAuto,
    };
  }
}

// Phaser first — never blank the page waiting on a service-worker activate/reload.
startGame();
void bootKindlingPwa();
