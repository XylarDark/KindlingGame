import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { Pal } from "./palette";

const FLOOR_Y = 830;

/** Outdoor porch in front of a house — people stand on the walk. */
export function paintDoorstep(g: Phaser.GameObjects.Graphics, houseIndex: number): void {
  g.clear();
  const dusk = houseIndex % 2 === 1;
  const skyTop = dusk ? Pal.skyTop : 0x6a88b0;
  const skyLow = dusk ? Pal.skyLow : 0xc8b898;
  g.fillGradientStyle(skyTop, skyTop, skyLow, skyLow, 1);
  g.fillRect(0, 0, GAME_WIDTH, FLOOR_Y - 80);

  g.fillStyle(Pal.grassDark, 1);
  g.fillRect(0, FLOOR_Y - 80, GAME_WIDTH, GAME_HEIGHT - (FLOOR_Y - 80));
  g.fillStyle(Pal.grass, 1);
  g.fillRect(0, FLOOR_Y - 80, GAME_WIDTH, 36);

  const walls = [Pal.kraftLite, Pal.creamSoft, Pal.wall, Pal.grassLite];
  const roofs = [Pal.woodDark, Pal.dusk, 0x5a3038, Pal.leafDark];
  const wall = walls[houseIndex % walls.length]!;
  const roof = roofs[houseIndex % roofs.length]!;

  const houseW = 920;
  const houseH = 520;
  const hx = Math.floor((GAME_WIDTH - houseW) / 2);
  const hy = FLOOR_Y - 80 - houseH;

  g.fillStyle(Pal.ink, 0.35);
  g.fillRect(hx + 28, hy + 24, houseW, houseH);
  g.fillStyle(roof, 1);
  g.fillTriangle(hx - 40, hy + 120, hx + houseW / 2, hy - 40, hx + houseW + 40, hy + 120);
  g.fillStyle(Pal.roofLine, 1);
  g.fillRect(hx - 48, hy + 112, houseW + 96, 16);
  g.fillStyle(wall, 1);
  g.fillRect(hx, hy + 120, houseW, houseH - 120);
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(hx, hy + houseH - 16, houseW, 16);

  const doorW = 140;
  const doorH = 280;
  const dx = hx + Math.floor((houseW - doorW) / 2);
  const dy = hy + houseH - doorH;
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(dx - 12, dy - 12, doorW + 24, doorH + 12);
  g.fillStyle(Pal.wood, 1);
  g.fillRect(dx, dy, doorW, doorH);
  g.fillStyle(Pal.woodLight, 1);
  g.fillRect(dx + 18, dy + 28, 40, 70);
  g.fillRect(dx + doorW - 58, dy + 28, 40, 70);
  g.fillStyle(Pal.gold, 1);
  g.fillCircle(dx + doorW - 22, dy + doorH / 2, 8);

  windowPane(g, hx + 80, hy + 180);
  windowPane(g, hx + houseW - 80 - 160, hy + 180);
  windowPane(g, hx + 80, hy + 360);
  windowPane(g, hx + houseW - 80 - 160, hy + 360);

  g.fillStyle(Pal.asphalt, 1);
  g.fillRect(hx + houseW / 2 - 90, FLOOR_Y - 80, 180, 90);
  g.fillStyle(Pal.creamSoft, 0.35);
  g.fillRect(hx + houseW / 2 - 70, FLOOR_Y - 80, 140, 90);
}

function windowPane(g: Phaser.GameObjects.Graphics, x: number, y: number): void {
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(x, y, 160, 120);
  g.fillStyle(Pal.dusk, 1);
  g.fillRect(x + 12, y + 12, 136, 96);
  g.fillStyle(Pal.gold, 0.35);
  g.fillRect(x + 20, y + 20, 50, 40);
}

export const DOORSTEP_FLOOR_Y = FLOOR_Y;
export const DOORSTEP_DOOR_X = GAME_WIDTH / 2;
