import Phaser from "phaser";
import { gameConfig } from "./config";
import { installMobileShell } from "./shell";
import "@fontsource/inter/latin-400.css";
import "@fontsource/inter/latin-600.css";
import "@fontsource/inter/latin-700.css";

const game = new Phaser.Game(gameConfig);
installMobileShell(game);
