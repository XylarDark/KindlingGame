import Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import type { SkySample } from "../sim/dayNight";
import { Pal } from "./palette";
import { paintSky } from "./skyPaint";

const FLOOR_Y = 830;

export type DoorStyle = "gable" | "ranch" | "town" | "cottage" | "twoStory" | "modern";

export const DOOR_STYLES: DoorStyle[] = ["gable", "ranch", "town", "cottage", "twoStory", "modern"];

export type DoorFacade = {
  style: DoorStyle;
  wall: number;
  roof: number;
  trim: number;
};

const FACADES: Record<DoorStyle, Omit<DoorFacade, "style">> = {
  gable: { wall: Pal.kraftLite, roof: Pal.woodDark, trim: Pal.wood },
  ranch: { wall: Pal.creamSoft, roof: Pal.dusk, trim: 0x8a6a48 },
  town: { wall: 0xb09082, roof: 0x5a3038, trim: Pal.woodTrim },
  cottage: { wall: Pal.grassLite, roof: Pal.leafDark, trim: Pal.leaf },
  twoStory: { wall: Pal.wall, roof: Pal.rustDark, trim: Pal.kraft },
  modern: { wall: Pal.cream, roof: 0x3a3858, trim: Pal.denim },
};

export function doorStyleFor(houseIndex: number): DoorStyle {
  const i = ((houseIndex % DOOR_STYLES.length) + DOOR_STYLES.length) % DOOR_STYLES.length;
  return DOOR_STYLES[i]!;
}

export function doorFacade(houseIndex: number): DoorFacade {
  const style = doorStyleFor(houseIndex);
  return { style, ...FACADES[style] };
}

/** Outdoor porch in front of a house — people stand on the walk. Facade is stable per destination. */
export function paintDoorstep(g: Phaser.GameObjects.Graphics, houseIndex: number, sky: SkySample): void {
  g.clear();
  const facade = doorFacade(houseIndex);
  const skyH = FLOOR_Y - 80;
  paintSky(g, 0, 0, GAME_WIDTH, skyH, sky, { sunRadius: 36, moonRadius: 22 });

  g.fillStyle(Pal.grassDark, 1);
  g.fillRect(0, skyH, GAME_WIDTH, GAME_HEIGHT - skyH);
  g.fillStyle(Pal.grass, 1);
  g.fillRect(0, skyH, GAME_WIDTH, 36);
  g.fillStyle(Pal.grassLite, 0.35);
  g.fillRect(40, skyH + 8, 180, 18);
  g.fillRect(GAME_WIDTH - 260, skyH + 12, 200, 16);

  const houseW = facade.style === "town" || facade.style === "twoStory" ? 840 : facade.style === "ranch" ? 1040 : 920;
  const houseH = facade.style === "ranch" ? 440 : facade.style === "cottage" ? 480 : 520;
  const hx = Math.floor((GAME_WIDTH - houseW) / 2);
  const hy = skyH - houseH;

  g.fillStyle(Pal.ink, 0.35);
  g.fillRect(hx + 28, hy + 24, houseW, houseH);

  paintRoof(g, hx, hy, houseW, facade);
  g.fillStyle(facade.wall, 1);
  g.fillRect(hx, hy + 120, houseW, houseH - 120);
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(hx, hy + houseH - 16, houseW, 16);
  g.fillStyle(facade.trim, 1);
  g.fillRect(hx, hy + 120, houseW, 10);

  if (facade.style === "town" || facade.style === "twoStory") {
    g.fillStyle(Pal.shadow, 0.22);
    g.fillRect(hx + houseW * 0.48, hy + 130, 8, houseH - 146);
  }

  const doorW = facade.style === "modern" ? 160 : 140;
  const doorH = 280;
  const dx = hx + Math.floor((houseW - doorW) / 2);
  const dy = hy + houseH - doorH;
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(dx - 16, dy - 16, doorW + 32, doorH + 16);
  g.fillStyle(facade.style === "modern" ? Pal.denimDark : Pal.wood, 1);
  g.fillRect(dx, dy, doorW, doorH);
  g.fillStyle(Pal.woodLight, 1);
  g.fillRect(dx + 18, dy + 28, 40, 70);
  g.fillRect(dx + doorW - 58, dy + 28, 40, 70);
  g.fillStyle(Pal.gold, 1);
  g.fillCircle(dx + doorW - 22, dy + doorH / 2, 8);

  const night = sky.windowGlow;
  windowPane(g, hx + 80, hy + 180, night);
  windowPane(g, hx + houseW - 80 - 160, hy + 180, night);
  if (facade.style !== "ranch") {
    windowPane(g, hx + 80, hy + 360, night);
    windowPane(g, hx + houseW - 80 - 160, hy + 360, night);
  } else {
    windowPane(g, hx + 280, hy + 200, night);
    windowPane(g, hx + houseW - 280 - 160, hy + 200, night);
  }

  paintPorch(g, hx, houseW, dx, doorW, sky, houseIndex);
  paintYardProps(g, hx, houseW, skyH, facade, houseIndex);
}

function paintRoof(g: Phaser.GameObjects.Graphics, hx: number, hy: number, houseW: number, facade: DoorFacade): void {
  g.fillStyle(facade.roof, 1);
  if (facade.style === "modern") {
    g.fillRect(hx - 20, hy + 72, houseW + 40, 52);
    g.fillStyle(facade.trim, 1);
    g.fillRect(hx - 20, hy + 72, houseW + 40, 12);
    return;
  }
  if (facade.style === "ranch") {
    g.fillTriangle(hx - 24, hy + 132, hx + houseW / 2, hy + 20, hx + houseW + 24, hy + 132);
  } else if (facade.style === "cottage") {
    g.fillTriangle(hx - 10, hy + 140, hx + houseW / 2, hy - 20, hx + houseW + 10, hy + 140);
    g.fillStyle(Pal.leaf, 1);
    g.fillRect(hx + 40, hy + 200, 70, 36);
    g.fillRect(hx + houseW - 110, hy + 210, 64, 40);
  } else {
    g.fillTriangle(hx - 40, hy + 120, hx + houseW / 2, hy - 40, hx + houseW + 40, hy + 120);
  }
  g.fillStyle(Pal.roofLine, 1);
  g.fillRect(hx - 48, hy + 112, houseW + 96, 16);
}

function paintPorch(
  g: Phaser.GameObjects.Graphics,
  hx: number,
  houseW: number,
  dx: number,
  doorW: number,
  sky: SkySample,
  houseIndex: number,
): void {
  const walkX = hx + houseW / 2 - 90;
  g.fillStyle(Pal.asphalt, 1);
  g.fillRect(walkX, FLOOR_Y - 80, 180, 90);
  g.fillStyle(Pal.creamSoft, 0.35);
  g.fillRect(walkX + 20, FLOOR_Y - 80, 140, 90);
  g.fillStyle(Pal.wood, 1);
  g.fillRect(walkX + 8, FLOOR_Y - 80, 164, 18);
  g.fillRect(walkX + 24, FLOOR_Y - 62, 132, 12);
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(walkX + 4, FLOOR_Y - 80, 10, 52);
  g.fillRect(walkX + 166, FLOOR_Y - 80, 10, 52);

  const lampX = dx + doorW / 2;
  const lampY = FLOOR_Y - 80 - 300;
  g.fillStyle(Pal.ink, 1);
  g.fillRect(lampX - 4, lampY, 8, 36);
  g.fillStyle(Pal.gold, 1);
  g.fillRect(lampX - 16, lampY + 28, 32, 18);
  if (sky.lampAlpha > 0.08) {
    g.fillStyle(0xffe0a8, 0.12 + 0.38 * sky.lampAlpha);
    g.fillCircle(lampX, lampY + 48, 70 + 40 * sky.lampAlpha);
    g.fillStyle(0xfff0c8, 0.2 + 0.45 * sky.lampAlpha);
    g.fillCircle(lampX, lampY + 40, 22);
  }

  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(dx - 70, FLOOR_Y - 80 - 8, 36, 48);
  g.fillStyle(houseIndex % 2 === 0 ? Pal.leaf : Pal.rust, 1);
  g.fillRect(dx - 66, FLOOR_Y - 80 - 40, 28, 32);
  g.fillStyle(Pal.leafDark, 1);
  g.fillRect(dx - 60, FLOOR_Y - 80 - 52, 16, 16);
}

function paintYardProps(
  g: Phaser.GameObjects.Graphics,
  hx: number,
  houseW: number,
  skyH: number,
  facade: DoorFacade,
  houseIndex: number,
): void {
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(hx + houseW + 36, skyH - 70, 28, 40);
  g.fillStyle(Pal.kraft, 1);
  g.fillRect(hx + houseW + 40, skyH - 62, 20, 16);
  g.fillStyle(Pal.ink, 1);
  g.fillRect(hx + houseW + 48, skyH - 30, 4, 18);

  g.fillStyle(Pal.leafDark, 1);
  g.fillCircle(hx - 70, skyH - 20, 36);
  g.fillStyle(Pal.leaf, 1);
  g.fillCircle(hx - 58, skyH - 36, 28);
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(hx - 64, skyH - 8, 10, 36);

  if (facade.style === "cottage" || houseIndex % 3 === 1) {
    g.fillStyle(Pal.leaf, 1);
    g.fillCircle(hx + houseW + 90, skyH - 10, 24);
    g.fillStyle(Pal.woodDark, 1);
    g.fillRect(hx + houseW + 86, skyH + 6, 8, 28);
  }
}

function windowPane(g: Phaser.GameObjects.Graphics, x: number, y: number, glow: number): void {
  g.fillStyle(Pal.woodDark, 1);
  g.fillRect(x, y, 160, 120);
  const glass = glow > 0.2 ? Pal.gold : Pal.dusk;
  g.fillStyle(glass, glow > 0.2 ? 0.35 + 0.55 * glow : 1);
  g.fillRect(x + 12, y + 12, 136, 96);
  g.fillStyle(Pal.gold, 0.2 + 0.55 * glow);
  g.fillRect(x + 20, y + 20, 50, 40);
  if (glow > 0.25) {
    g.fillStyle(0xffe8b0, 0.18 + 0.35 * glow);
    g.fillRect(x + 8, y + 8, 144, 104);
  }
}

export const DOORSTEP_FLOOR_Y = FLOOR_Y;
export const DOORSTEP_DOOR_X = GAME_WIDTH / 2;
export const DOORSTEP_PORCH = { x: GAME_WIDTH / 2, y: FLOOR_Y - 200 };
