import Phaser from "phaser";
import { gameConfig } from "./config";
import { bootKindlingPwa } from "./pwaUpdate";
import { installMobileShell } from "./shell";
import { installInstallCoach } from "./ui/installCoach";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";

function startGame(): void {
  const game = new Phaser.Game(gameConfig);
  installMobileShell(game);
  installInstallCoach();
  // Dev-only handle for the typography/layout QA harness (see docs/qa-typography.md).
  if (import.meta.env.DEV) {
    (globalThis as unknown as { kindlingGame?: Phaser.Game }).kindlingGame = game;
  }
}

void bootKindlingPwa().then((outcome) => {
  if (outcome === "reloading") return;
  startGame();
});
