import Phaser from "phaser";
import {
  BACK_DOOR,
  BACK_DOOR_H,
  BACK_DOOR_W,
  BAG_STACK,
  BENCH,
  COUNTER_FRONT,
  COUNTER_LEFT,
  COUNTER_MID,
  COUNTER_RIGHT,
  COUNTER_TOP,
  DOOR,
  DOOR_H,
  DOOR_W,
  STRAINS_PER_TV,
  TV_COUNT,
  TV_H,
  TV_W,
  WINDOW,
  tabletLayout,
  tvPos,
} from "../maps/shopT0";
import { GAME_HEIGHT, GAME_WIDTH } from "../sim/constants";
import { addUiText } from "../ui/text";
import { Color, Type } from "../ui/theme";
import { PX, fill, snap } from "./px";

function tvBezel(g: Phaser.GameObjects.Graphics, left: number, top: number, w: number, h: number): void {
  fill(g, left - 8, top + h, w + 16, 8, 0x2a2218);
  fill(g, left - 8, top - 8, w + 16, h + 16, Color.woodDark);
  fill(g, left - 4, top - 4, w + 8, h + 8, 0x2a2218);
  fill(g, left, top, w, h, 0x0a1210);
  fill(g, left + 8, top + 4, 40, 4, Color.woodLight);
  const slotH = Math.floor((h - 20) / STRAINS_PER_TV);
  const blockTop = top + 10;
  for (let s = 1; s < STRAINS_PER_TV; s++) {
    fill(g, left + 10, blockTop + s * slotH, w - 20, 2, 0x1a2a22);
  }
}

const WALL = 0x7a4a28;
const WALL_SHADE = 0x6a3e22;
const WAINSCOT = 0x6a3a20;
const WAINSCOT_LINE = 0x4a2818;
const WOOD_HI = 0x8a522c;
const WOOD_MID = 0x7a4a28;
const WOOD_LO = Color.woodDark;
const WOOD_EDGE = 0x3a2214;
const WOOD_REVEAL = 0x2a1810;
const WOOD_REVEAL_IN = 0x4a2818;

const PAINT = 0xf2f2f0;
const PAINT_HI = 0xffffff;
const PAINT_SHADE = 0xd0d2d4;
const PAINT_EDGE = 0xa8acb0;
const PAINT_GROOVE = 0x8e9090;
const PAINT_PANEL = 0xc4c6c8;
const JAMB = 0x6e7070;
const JAMB_DARK = 0x4a4c4e;
const JAMB_HI = 0xa4a6a6;

const POT_HOT = 0xffe8b0;
const POT_WARM = 0xe8c070;

function potLight(g: Phaser.GameObjects.Graphics, x: number): void {
  fill(g, x - 48, 28, 96, 72, POT_WARM, 0.08);
  fill(g, x - 28, 28, 56, 40, POT_WARM, 0.12);
  fill(g, x - 12, 28, 24, 20, POT_HOT, 0.16);

  fill(g, x - 14, 8, 28, 16, 0x1a1410);
  fill(g, x - 10, 10, 20, 12, 0x2a2218);
  fill(g, x - 8, 12, 16, 8, Color.gold);
  fill(g, x - 4, 14, 8, 6, POT_HOT);
  fill(g, x - 2, 16, 4, 4, 0xfff6d8);
}

function drawDuskOutside(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, accent: "moon" | "lamp"): void {
  fill(g, x, y, w, Math.floor(h * 0.3), Color.skyTop);
  fill(g, x, y + Math.floor(h * 0.28), w, Math.floor(h * 0.18), 0x2a2e4a);
  fill(g, x, y + Math.floor(h * 0.44), w, Math.floor(h * 0.18), Color.skyMid);
  fill(g, x, y + Math.floor(h * 0.6), w, Math.floor(h * 0.16), Color.skyLow);
  fill(g, x, y + Math.floor(h * 0.74), w, h - Math.floor(h * 0.74), 0xc47868);

  fill(g, x + 12, y + 12, PX, PX, Color.cream, 0.7);
  fill(g, x + Math.floor(w * 0.22), y + 28, PX, PX, Color.cream, 0.45);
  fill(g, x + Math.floor(w * 0.4), y + 10, PX, PX, Color.cream, 0.55);
  fill(g, x + Math.floor(w * 0.62), y + 22, PX, PX, Color.cream, 0.4);
  fill(g, x + w - 28, y + 36, PX, PX, Color.cream, 0.5);

  if (accent === "moon") {
    const moonX = x + Math.floor(w * 0.72);
    const moonY = y + Math.floor(h * 0.18);
    fill(g, moonX - 12, moonY - 8, 24, 24, 0xf0c070);
    fill(g, moonX - 8, moonY - 12, 16, 32, 0xf0c070);
    fill(g, moonX - 16, moonY - 4, 32, 16, 0xf0c070);
    fill(g, moonX - 4, moonY - 4, 12, 12, Color.cream);
  } else {
    const poleX = x + Math.floor(w * 0.7);
    const lampY = y + Math.floor(h * 0.2);
    const poleH = Math.floor(h * 0.58);
    fill(g, poleX - 36, lampY - 8, 56, 48, 0xf0c070, 0.16);
    fill(g, poleX - 24, lampY, 40, 28, 0xc47868, 0.28);
    fill(g, poleX - 4, lampY + 20, 6, poleH, 0x1a1014);
    fill(g, poleX - 20, lampY + 16, 24, 4, 0x1a1014);
    fill(g, poleX - 24, lampY - 4, 28, 4, 0x2a1824);
    fill(g, poleX - 22, lampY, 24, 16, 0xf0c070);
    fill(g, poleX - 18, lampY + 4, 16, 8, Color.cream);
    fill(g, poleX - 16, lampY + 6, 8, 4, 0xfff0c0);
    fill(g, poleX - 20, y + Math.floor(h * 0.72), 32, 12, 0xf0c070, 0.2);
  }

  const roofY = y + Math.floor(h * 0.78);
  fill(g, x, roofY, w, h - Math.floor(h * 0.78), 0x2a1824);
  fill(g, x + Math.floor(w * 0.08), roofY - 20, Math.floor(w * 0.2), 28, 0x2a1824);
  fill(g, x + Math.floor(w * 0.12), roofY - 28, Math.floor(w * 0.12), 12, 0x2a1824);
  fill(g, x + Math.floor(w * 0.48), roofY - 16, Math.floor(w * 0.28), 24, 0x2a1824);
  fill(g, x + Math.floor(w * 0.56), roofY - 24, Math.floor(w * 0.14), 12, 0x2a1824);

  if (accent === "lamp") {
    const winX = x + Math.floor(w * 0.14);
    const winY = roofY - 12;
    fill(g, winX, winY, 10, 10, 0xf0c070, 0.7);
    fill(g, winX + 18, winY + 4, 8, 8, 0xc47868, 0.55);
  }

  fill(g, x + 6, y + 8, Math.max(PX * 2, Math.floor(w * 0.05)), h - 16, Color.cream, 0.1);
}

function drawNightGlass(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number): void {
  drawDuskOutside(g, x, y, w, h, "lamp");
}

function clipFill(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  color: number,
  clipBottom?: number,
  alpha = 1,
): void {
  if (clipBottom !== undefined) {
    const bottom = snap(clipBottom);
    const sy = snap(y);
    if (sy >= bottom) return;
    const sx = snap(x);
    const sw = Math.max(PX, snap(w) || PX);
    const sh = Math.min(Math.max(PX, snap(h) || PX), bottom - sy);
    if (sh < PX) return;
    g.fillStyle(color, alpha);
    g.fillRect(sx, sy, sw, sh);
    return;
  }
  fill(g, x, y, w, h, color, alpha);
}

function drawDoor(
  g: Phaser.GameObjects.Graphics,
  cx: number,
  floorY: number,
  w: number,
  h: number,
  kind: "glass" | "panel",
  clipBottom?: number,
): void {
  const left = cx - w / 2;
  const top = floorY - h;

  if (kind === "glass") {
    const reveal = 8;
    fill(g, left - reveal, top - reveal, w + reveal * 2, h + reveal, JAMB_DARK);
    fill(g, left - reveal + 4, top - reveal + 4, w + reveal * 2 - 4, h + reveal - 4, JAMB);
    fill(g, left - reveal, top - reveal, w + reveal * 2, 8, JAMB_HI);
    fill(g, left - reveal, top - reveal, w + reveal * 2, 4, PAINT_HI);
    fill(g, left - reveal, top, 8, h, JAMB_DARK);
    fill(g, left + w, top, 8, h, JAMB);
    fill(g, left - reveal, floorY - 4, w + reveal * 2, 4, 0x3a3c3e);

    fill(g, left + 4, top + 4, w - 8, h - 4, PAINT);
    fill(g, left + 4, top + 4, 6, h - 4, PAINT_HI);
    fill(g, left + w - 10, top + 4, 6, h - 4, PAINT_SHADE);
    fill(g, left + 4, top + 4, w - 8, 6, PAINT_HI);

    const glassW = Math.floor(w * 0.62);
    const glassH = Math.floor(h * 0.52);
    const glassX = left + Math.floor((w - glassW) / 2);
    const glassY = top + Math.floor(h * 0.16);
    fill(g, glassX - 6, glassY - 6, glassW + 12, glassH + 12, JAMB_DARK);
    fill(g, glassX - 4, glassY - 4, glassW + 8, glassH + 8, PAINT_HI);
    drawNightGlass(g, glassX, glassY, glassW, glassH);
    fill(g, glassX, glassY, glassW, 4, PAINT_HI);
    fill(g, glassX, glassY, 4, glassH, PAINT_HI);
    fill(g, glassX + glassW - 4, glassY, 4, glassH, PAINT_EDGE);
    fill(g, glassX, glassY + glassH - 4, glassW, 4, PAINT_SHADE);

    fill(g, left + 12, top + h - 44, w - 24, 36, JAMB);
    fill(g, left + 16, top + h - 40, w - 32, 4, JAMB_HI);

    const handleX = left + w - 22;
    const handleY = top + Math.floor(h * 0.48);
    fill(g, handleX - 2, handleY - 10, 8, 28, 0x6a6e72);
    fill(g, handleX, handleY - 8, 4, 24, 0xc8ccd0);
    fill(g, handleX - 16, handleY - 4, 22, 8, 0xa8acb0);
    fill(g, handleX - 16, handleY - 4, 22, 3, 0xe8eaee);
    fill(g, handleX - 18, handleY - 2, 8, 6, 0xd0d4d8);
    return;
  }

  clipFill(g, left - 8, top - 8, w + 16, h + 8, JAMB_DARK, clipBottom);
  clipFill(g, left - 4, top - 4, w + 8, 8, JAMB_HI, clipBottom);
  clipFill(g, left - 4, top, 8, h, JAMB_HI, clipBottom);
  clipFill(g, left + w - 4, top, 8, h, JAMB_HI, clipBottom);

  clipFill(g, left, top, w, h, PAINT, clipBottom);
  clipFill(g, left, top, 8, h, PAINT_HI, clipBottom);
  clipFill(g, left, top, w, 8, PAINT_HI, clipBottom);
  clipFill(g, left + w - 8, top, 8, h, PAINT_SHADE, clipBottom);

  for (let x = left + 16; x < left + w - 12; x += 20) {
    clipFill(g, x, top + 8, PX, h - 16, PAINT_GROOVE, clipBottom);
    clipFill(g, x + PX, top + 8, PX, h - 16, PAINT_SHADE, clipBottom);
  }

  const inset = (ix: number, iy: number, iw: number, ih: number) => {
    clipFill(g, ix, iy, iw, ih, JAMB_DARK, clipBottom);
    clipFill(g, ix + 4, iy + 4, iw - 8, ih - 8, PAINT_PANEL, clipBottom);
    clipFill(g, ix + 8, iy + 8, iw - 16, ih - 16, PAINT, clipBottom);
    clipFill(g, ix + 8, iy + 8, iw - 16, 4, PAINT_HI, clipBottom);
    clipFill(g, ix + 8, iy + 8, 4, ih - 16, PAINT_HI, clipBottom);
    for (let x = ix + 20; x < ix + iw - 16; x += 16) {
      clipFill(g, x, iy + 12, PX, ih - 24, PAINT_GROOVE, clipBottom);
    }
  };
  const paneW = w - 40;
  const paneX = left + 20;
  inset(paneX, top + 20, paneW, Math.floor(h * 0.36));
  inset(paneX, top + 28 + Math.floor(h * 0.36), paneW, Math.floor(h * 0.38));

  const leverX = left + w - 22;
  const leverY = top + Math.floor(h * 0.48);
  clipFill(g, leverX - 2, leverY - 10, 8, 28, 0x6a6e72, clipBottom);
  clipFill(g, leverX, leverY - 8, 4, 24, 0xc8ccd0, clipBottom);
  clipFill(g, leverX - 16, leverY - 4, 22, 8, 0xa8acb0, clipBottom);
  clipFill(g, leverX - 16, leverY - 4, 22, 3, 0xe8eaee, clipBottom);
  clipFill(g, leverX - 18, leverY - 2, 8, 6, 0xd0d4d8, clipBottom);
}

const BOARD = [0x7a4a28, 0x6a3e22, 0x8a522c, Color.woodDark, 0x6a3a20];

function drawBoardFloor(g: Phaser.GameObjects.Graphics): void {
  const boardH = 32;
  let y = COUNTER_FRONT;
  let i = 0;
  while (y < GAME_HEIGHT) {
    const h = Math.min(boardH, GAME_HEIGHT - y);
    fill(g, 0, y, GAME_WIDTH, h, BOARD[i % BOARD.length]!);
    fill(g, 0, y, GAME_WIDTH, 4, Color.wood);
    fill(g, 0, y + h - 4, GAME_WIDTH, 4, 0x3a2214);
    const stagger = i % 2 === 0 ? 48 : 168;
    for (let x = stagger; x < GAME_WIDTH; x += 256) fill(g, x, y, PX, h, Color.woodDark);
    fill(g, 80 + (i % 3) * 120, y + 8, 96, 4, i % 2 === 0 ? 0x8a5a32 : 0x4a2818);
    y += boardH;
    i += 1;
  }
}

function drawStaffDoor(scene: Phaser.Scene): void {
  const g = scene.add.graphics().setDepth(4);
  drawDoor(g, BACK_DOOR.x, COUNTER_FRONT, BACK_DOOR_W, BACK_DOOR_H, "panel", COUNTER_TOP);
}

export function drawShopInterior(scene: Phaser.Scene): void {
  const g = scene.add.graphics();

  fill(g, 0, 0, GAME_WIDTH, COUNTER_FRONT, WALL);
  fill(g, 0, 28, GAME_WIDTH, 48, WALL_SHADE, 0.35);

  fill(g, 0, COUNTER_TOP - 92, GAME_WIDTH, COUNTER_FRONT - (COUNTER_TOP - 92), WAINSCOT);
  for (let x = 0; x < GAME_WIDTH; x += 48) fill(g, x, COUNTER_TOP - 92, PX, COUNTER_FRONT - (COUNTER_TOP - 92), WAINSCOT_LINE);
  fill(g, 0, COUNTER_TOP - 96, GAME_WIDTH, 8, WOOD_LO);
  fill(g, 0, COUNTER_TOP - 88, GAME_WIDTH, 8, WOOD_EDGE);

  fill(g, 0, 0, GAME_WIDTH, 28, WOOD_LO);
  fill(g, 0, 28, GAME_WIDTH, 4, WOOD_HI);

  const pots = [170, 430, 760, 1100, 1440, 1760];
  for (const x of pots) potLight(g, x);

  for (let i = 0; i < TV_COUNT; i++) {
    const p = tvPos(i);
    tvBezel(g, p.x - TV_W / 2, p.y - TV_H / 2, TV_W, TV_H);
  }

  const orders = tabletLayout();
  tvBezel(g, orders.left, orders.top, orders.w, orders.h);
  fill(g, orders.screenLeft, orders.screenTop, orders.screenW, orders.headerH, Color.woodLight);

  const winLeft = WINDOW.x - WINDOW.w / 2;
  const winTop = BENCH.y - WINDOW.h;
  const winH = WINDOW.h;
  const reveal = 8;
  fill(g, winLeft - reveal, winTop - reveal, WINDOW.w + reveal * 2, winH + reveal, WOOD_REVEAL);
  fill(g, winLeft - reveal + 4, winTop - reveal + 4, WINDOW.w + reveal * 2 - 4, winH + reveal - 4, WOOD_REVEAL_IN);
  fill(g, winLeft - reveal, winTop - reveal, WINDOW.w + reveal * 2, 8, WOOD_HI);
  fill(g, winLeft - reveal, winTop - reveal, WINDOW.w + reveal * 2, 4, WOOD_MID);
  fill(g, winLeft - reveal, winTop, 8, winH, WOOD_LO);
  fill(g, winLeft + WINDOW.w, winTop, 8, winH, WOOD_MID);

  drawDuskOutside(g, winLeft, winTop, WINDOW.w, winH, "moon");

  fill(g, winLeft, winTop, WINDOW.w, 8, WOOD_HI);
  fill(g, winLeft, winTop, 8, winH, WOOD_HI);
  fill(g, winLeft + WINDOW.w - 8, winTop, 8, winH, WOOD_HI);
  fill(g, WINDOW.x - 4, winTop, 8, winH, WOOD_HI);
  fill(g, winLeft, winTop + Math.floor(winH / 2) - 4, WINDOW.w, 8, WOOD_HI);
  fill(g, winLeft, winTop + winH - 8, WINDOW.w, 8, WOOD_MID);

  drawBoardFloor(g);

  drawDoor(g, DOOR.x, COUNTER_FRONT, DOOR_W, DOOR_H, "glass");

  const seatY = BENCH.y;
  const benchLeft = COUNTER_RIGHT;
  const benchW = GAME_WIDTH - 28 - benchLeft;
  const benchH = COUNTER_FRONT - seatY;
  fill(g, benchLeft + 8, COUNTER_FRONT, benchW, 12, 0x1a1008, 0.5);
  fill(g, benchLeft - 12, seatY - 8, 12, benchH + 8, 0xc8c4bc);
  fill(g, benchLeft, seatY, benchW, benchH, 0xf2eee6);
  fill(g, benchLeft, seatY, 8, benchH, 0xd8d4cc);
  fill(g, benchLeft + benchW - 12, seatY, 12, benchH, 0xc8c4bc);
  for (let x = benchLeft + 20; x < benchLeft + benchW - 16; x += 20) {
    fill(g, x, seatY + 8, PX, benchH - 16, 0xd0ccc4);
  }
  fill(g, benchLeft, COUNTER_FRONT - 8, benchW, 8, 0xb8b4ac);
  fill(g, benchLeft, seatY - 24, benchW, 8, 0x2a1810, 0.45);
  fill(g, benchLeft - 4, seatY - 20, benchW + 4, 24, 0x0a0808);
  fill(g, benchLeft, seatY - 24, benchW - 8, 20, 0x141210);
  fill(g, benchLeft + 12, seatY - 28, benchW - 32, 8, 0x2a2826);
  fill(g, benchLeft + 24, seatY - 26, 48, 4, 0x3a3836);
  fill(g, benchLeft, seatY - 4, benchW, 8, 0x080604);

  drawStaffDoor(scene);
}

export function drawShopCounter(scene: Phaser.Scene): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(7);
  const w = COUNTER_RIGHT - COUNTER_LEFT;
  const depth = 28;
  const topBack = COUNTER_TOP - depth;
  const grey = 0x8e9090;
  const greyLite = 0xa4a6a6;
  const greyEdge = 0x6e7070;
  const faceH = COUNTER_FRONT - COUNTER_TOP;

  fill(g, COUNTER_LEFT - 16, topBack + 8, 16, COUNTER_FRONT - (topBack + 8), PAINT_SHADE);

  fill(g, COUNTER_LEFT, COUNTER_TOP, w, faceH, PAINT);
  fill(g, COUNTER_LEFT, COUNTER_FRONT - 8, w, 8, PAINT_EDGE);

  fill(g, COUNTER_LEFT, topBack, w, depth, grey);
  fill(g, COUNTER_LEFT, topBack, w, 6, greyEdge);
  fill(g, COUNTER_LEFT, COUNTER_TOP - 8, w, 8, greyLite);

  fill(g, BAG_STACK.x - 24, BAG_STACK.y - 8, 48, 8, greyEdge);

  const cx = COUNTER_MID;
  const plaqueH = 48;
  const plaqueW = 280;
  const plaqueTop = COUNTER_TOP + Math.floor((faceH - plaqueH) / 2);
  fill(g, cx - plaqueW / 2, plaqueTop, plaqueW, plaqueH, PAINT_SHADE);
  fill(g, cx - plaqueW / 2 + 8, plaqueTop + 4, plaqueW - 16, plaqueH - 8, PAINT);
  fill(g, cx - plaqueW / 2 + 8, plaqueTop + plaqueH - 6, plaqueW - 16, 6, PAINT_EDGE);
  addUiText(scene, cx, plaqueTop + plaqueH / 2, "KINDLING", {
    size: Type.title,
    color: Color.inkHex,
    fontStyle: "700",
    strokeThickness: 0,
  })
    .setOrigin(0.5, 0.5)
    .setDepth(8);

  return g;
}
