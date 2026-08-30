import { findPath, type TileCell } from "../sim/pathfinding";

export const TILE = 120;

/** Neighborhood: two-tile streets around roomy house lots. */
export const MAP_COLS = 36;
export const MAP_ROWS = 24;
export const MAP_PX_W = MAP_COLS * TILE;
export const MAP_PX_H = MAP_ROWS * TILE;

const BLOCK_H = 6;
const BLOCK_W = 7;
const MAX_HOUSES = 14;

export type TileKind = "wall" | "road" | "shop" | "house";

export interface HouseStop {
  id: string;
  house: TileCell;
  stop: TileCell;
  lotW: number;
  lotH: number;
}

export interface ShopLot {
  origin: TileCell;
  w: number;
  h: number;
}

export interface CityMap {
  kinds: TileKind[][];
  walkable: boolean[][];
  shopSpawn: TileCell;
  shopLot: ShopLot;
  houses: HouseStop[];
}

function isBorder(r: number, c: number): boolean {
  return r === 0 || c === 0 || r === MAP_ROWS - 1 || c === MAP_COLS - 1;
}

function isEWStreet(r: number): boolean {
  if (isBorder(r, 1)) return false;
  const m = (r - 1) % BLOCK_H;
  return m === 0 || m === 1;
}

function isNSStreet(c: number): boolean {
  if (isBorder(1, c)) return false;
  const m = (c - 1) % BLOCK_W;
  return m === 0 || m === 1;
}

function isStreet(r: number, c: number): boolean {
  if (isBorder(r, c)) return false;
  return isEWStreet(r) || isNSStreet(c);
}

function neighbors4(cell: TileCell): TileCell[] {
  return [
    { c: cell.c - 1, r: cell.r },
    { c: cell.c + 1, r: cell.r },
    { c: cell.c, r: cell.r - 1 },
    { c: cell.c, r: cell.r + 1 },
  ];
}

function inBounds(r: number, c: number): boolean {
  return r >= 0 && c >= 0 && r < MAP_ROWS && c < MAP_COLS;
}

function lotCells(origin: TileCell, w: number, h: number): TileCell[] {
  const cells: TileCell[] = [];
  for (let r = origin.r; r < origin.r + h; r++) {
    for (let c = origin.c; c < origin.c + w; c++) {
      cells.push({ c, r });
    }
  }
  return cells;
}

function lotFree(kinds: TileKind[][], origin: TileCell, w: number, h: number, want: TileKind): boolean {
  for (const cell of lotCells(origin, w, h)) {
    if (!inBounds(cell.r, cell.c)) return false;
    if (kinds[cell.r]![cell.c] !== want) return false;
  }
  return true;
}

const LOT_SIZES = [
  { w: 3, h: 3 },
  { w: 3, h: 2 },
  { w: 2, h: 3 },
  { w: 2, h: 2 },
];

export function buildCityMap(): CityMap {
  const kinds: TileKind[][] = [];
  const walkable: boolean[][] = [];
  const shopLot: ShopLot = { origin: { c: 3, r: 3 }, w: 4, h: 3 };
  const shopSpawn: TileCell = { c: 2, r: 4 };

  for (let r = 0; r < MAP_ROWS; r++) {
    kinds[r] = [];
    walkable[r] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      if (isStreet(r, c)) {
        kinds[r]![c] = "road";
        walkable[r]![c] = true;
      } else {
        kinds[r]![c] = "wall";
        walkable[r]![c] = false;
      }
    }
  }

  kinds[shopSpawn.r]![shopSpawn.c] = "shop";
  walkable[shopSpawn.r]![shopSpawn.c] = true;
  for (const cell of lotCells(shopLot.origin, shopLot.w, shopLot.h)) {
    kinds[cell.r]![cell.c] = "shop";
    walkable[cell.r]![cell.c] = false;
  }

  const houses: HouseStop[] = [];
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (houses.length >= MAX_HOUSES) break;
      const size = LOT_SIZES[(c + r * 3) % LOT_SIZES.length]!;
      const origin = { c, r };
      if (!lotFree(kinds, origin, size.w, size.h, "wall")) continue;
      const cells = lotCells(origin, size.w, size.h);
      const touchesRoad = cells.some((cell) => neighbors4(cell).some((n) => walkable[n.r]?.[n.c]));
      if (!touchesRoad) continue;
      if ((c * 5 + r * 3) % 7 === 0) continue;
      const stop = nearestRoadToLot(walkable, cells);
      if (!stop) continue;
      for (const cell of cells) kinds[cell.r]![cell.c] = "house";
      houses.push({
        id: `house-${houses.length + 1}`,
        house: origin,
        stop,
        lotW: size.w,
        lotH: size.h,
      });
    }
  }

  return { kinds, walkable, shopSpawn, shopLot, houses };
}

export const CITY = buildCityMap();

export function houseNumber(id: string): string {
  return id.replace("house-", "");
}

export function houseTitle(id: string): string {
  return `House ${houseNumber(id)}`;
}

export function houseById(id: string): HouseStop | undefined {
  return CITY.houses.find((h) => h.id === id);
}

export function tileToWorld(cell: TileCell): { x: number; y: number } {
  return { x: cell.c * TILE + TILE / 2, y: cell.r * TILE + TILE / 2 };
}

export function worldToTile(x: number, y: number): TileCell {
  return { c: Math.floor(x / TILE), r: Math.floor(y / TILE) };
}

export function lotCenter(origin: TileCell, w: number, h: number): { x: number; y: number } {
  return {
    x: origin.c * TILE + (w * TILE) / 2,
    y: origin.r * TILE + (h * TILE) / 2,
  };
}

export function lotWorldRect(origin: TileCell, w: number, h: number): { left: number; top: number; right: number; bottom: number } {
  return {
    left: origin.c * TILE,
    top: origin.r * TILE,
    right: (origin.c + w) * TILE,
    bottom: (origin.r + h) * TILE,
  };
}

/** Generous tap target over the Kindling building plus the curb in front. */
export function shopWorldHit(): { x: number; y: number; w: number; h: number } {
  const pad = TILE * 0.7;
  const lot = lotWorldRect(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
  const spawn = tileToWorld(CITY.shopSpawn);
  const left = Math.min(lot.left, spawn.x - TILE * 0.7) - pad;
  const top = Math.min(lot.top, spawn.y - TILE * 0.7) - pad;
  const right = Math.max(lot.right, spawn.x + TILE * 0.7) + pad;
  const bottom = Math.max(lot.bottom, spawn.y + TILE * 0.7) + pad;
  return { x: (left + right) / 2, y: (top + bottom) / 2, w: right - left, h: bottom - top };
}

export function doorstepWorld(house: HouseStop): { x: number; y: number } {
  const home = lotCenter(house.house, house.lotW, house.lotH);
  const curb = tileToWorld(house.stop);
  return { x: home.x * 0.55 + curb.x * 0.45, y: home.y * 0.55 + curb.y * 0.45 };
}

export function roadTextureKey(kinds: TileKind[][], r: number, c: number): string {
  const road = (rr: number, cc: number) => {
    const k = kinds[rr]?.[cc];
    return k === "road" || (k === "shop" && CITY.walkable[rr]?.[cc]);
  };
  const h = road(r, c - 1) || road(r, c + 1);
  const v = road(r - 1, c) || road(r + 1, c);
  if (h && v) return "tex-road-x";
  if (v && !h) return "tex-road-v";
  return "tex-road";
}

export function pathToHouse(from: TileCell, houseId: string): TileCell[] {
  const house = houseById(houseId);
  if (!house) return [];
  return findPath(CITY.walkable, from, house.stop);
}

export function isDriveWalkable(cell: TileCell): boolean {
  return !!CITY.walkable[cell.r]?.[cell.c];
}

export function isFootWalkable(cell: TileCell, door?: TileCell): boolean {
  if (isDriveWalkable(cell)) return true;
  if (!door) return false;
  return Math.abs(cell.c - door.c) + Math.abs(cell.r - door.r) <= 1;
}

function nearestRoad(walkable: boolean[][], cell: TileCell): TileCell | null {
  for (const n of neighbors4(cell)) {
    if (walkable[n.r]?.[n.c]) return n;
  }
  return null;
}

function nearestRoadToLot(walkable: boolean[][], cells: TileCell[]): TileCell | null {
  for (const cell of cells) {
    const road = nearestRoad(walkable, cell);
    if (road) return road;
  }
  return null;
}
