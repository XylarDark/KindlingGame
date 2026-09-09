import Phaser from "phaser";
import { gameConfig } from "./config";
import { installMobileShell } from "./shell";
import { installInstallCoach } from "./ui/installCoach";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";

const game = new Phaser.Game(gameConfig);
installMobileShell(game);
installInstallCoach();

// Network-first SW already in public/ — needed for Chromium beforeinstallprompt / installability.
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined);
  });
}

// Dev-only handle for the typography/layout QA harness (see docs/qa-typography.md).
if (import.meta.env.DEV) {
  (globalThis as unknown as { kindlingGame?: Phaser.Game }).kindlingGame = game;
}
