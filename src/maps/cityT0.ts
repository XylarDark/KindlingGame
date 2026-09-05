import { findPath, type TileCell } from "../sim/pathfinding";

export const TILE = 120;

/** Neighborhood: two-tile streets, house lots with driveways, shop parking. */
export const MAP_COLS = 40;
export const MAP_ROWS = 28;
export const MAP_PX_W = MAP_COLS * TILE;
export const MAP_PX_H = MAP_ROWS * TILE;

const BLOCK_H = 8;
const BLOCK_W = 9;
const MAX_HOUSES = 14;

export type TileKind = "wall" | "road" | "shop" | "house" | "parking";

export interface HouseStop {
  id: string;
  house: TileCell;
  stop: TileCell;
  lotW: number;
  lotH: number;
  /** Driveway / parking pad beside the house. */
  parking: TileCell[];
}

export interface ShopLot {
  origin: TileCell;
  w: number;
  h: number;
  parking: TileCell[];
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

export function isEWStreet(r: number): boolean {
  if (isBorder(r, 1)) return false;
  const m = (r - 1) % BLOCK_H;
  return m === 0 || m === 1;
}

export function isNSStreet(c: number): boolean {
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

/** Building footprint sizes — leave room on the lot for a driveway. */
const BUILD_SIZES = [
  { w: 2, h: 2 },
  { w: 3, h: 2 },
  { w: 2, h: 3 },
];

function paintParking(kinds: TileKind[][], walkable: boolean[][], cells: TileCell[]): void {
  for (const cell of cells) {
    kinds[cell.r]![cell.c] = "parking";
    walkable[cell.r]![cell.c] = false;
  }
}

function drivewayTowardRoad(
  kinds: TileKind[][],
  walkable: boolean[][],
  build: TileCell,
  bw: number,
  bh: number,
): { parking: TileCell[]; stop: TileCell } | null {
  const buildCells = lotCells(build, bw, bh);
  const candidates: { parking: TileCell[]; stop: TileCell; score: number }[] = [];

  for (const cell of buildCells) {
    for (const n of neighbors4(cell)) {
      if (!inBounds(n.r, n.c)) continue;
      if (kinds[n.r]![n.c] !== "wall") continue;
      const road = neighbors4(n).find((r) => walkable[r.r]?.[r.c]);
      if (!road) continue;
      // Prefer a 1×2 pad along the curb when space allows.
      const along =
        road.r === n.r
          ? [
              n,
              { c: n.c, r: n.r + (n.r > build.r ? 1 : -1) },
            ].filter((p) => inBounds(p.r, p.c) && kinds[p.r]![p.c] === "wall")
          : [
              n,
              { c: n.c + (n.c > build.c ? 1 : -1), r: n.r },
            ].filter((p) => inBounds(p.r, p.c) && kinds[p.r]![p.c] === "wall");
      const parking = along.length >= 2 ? along.slice(0, 2) : [n];
      if (parking.some((p) => buildCells.some((b) => b.c === p.c && b.r === p.r))) continue;
      candidates.push({ parking, stop: road, score: parking.length * 10 + (road.c + road.r) % 3 });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function placeShop(kinds: TileKind[][], walkable: boolean[][]): { shopLot: ShopLot; shopSpawn: TileCell } {
  // Building sits one lot in from the N–S street so a full parking strip faces the curb.
  const origin = { c: 4, r: 3 };
  const w = 4;
  const h = 3;
  for (const cell of lotCells(origin, w, h)) {
    kinds[cell.r]![cell.c] = "shop";
    walkable[cell.r]![cell.c] = false;
  }

  const parking: TileCell[] = [];
  for (let r = origin.r; r < origin.r + h; r++) {
    const c = origin.c - 1;
    if (kinds[r]?.[c] === "wall") parking.push({ c, r });
  }
  for (let c = origin.c; c < origin.c + w; c++) {
    const r = origin.r + h;
    if (kinds[r]?.[c] === "wall") parking.push({ c, r });
  }
  paintParking(kinds, walkable, parking);

  const shopSpawn: TileCell = { c: 2, r: 4 };
  kinds[shopSpawn.r]![shopSpawn.c] = "shop";
  walkable[shopSpawn.r]![shopSpawn.c] = true;

  return { shopLot: { origin, w, h, parking }, shopSpawn };
}

export function buildCityMap(): CityMap {
  const kinds: TileKind[][] = [];
  const walkable: boolean[][] = [];

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

  const { shopLot, shopSpawn } = placeShop(kinds, walkable);

  const houses: HouseStop[] = [];
  for (let r = 2; r < MAP_ROWS - 3; r++) {
    for (let c = 2; c < MAP_COLS - 3; c++) {
      if (houses.length >= MAX_HOUSES) break;
      const size = BUILD_SIZES[(c + r * 3) % BUILD_SIZES.length]!;
      const origin = { c, r };
      if (!lotFree(kinds, origin, size.w, size.h, "wall")) continue;
      // Need empty wall ring for driveway.
      const pad = drivewayTowardRoad(kinds, walkable, origin, size.w, size.h);
      if (!pad) continue;
      if (!pad.parking.every((p) => kinds[p.r]![p.c] === "wall")) continue;
      if ((c * 5 + r * 3) % 5 === 0) continue;

      for (const cell of lotCells(origin, size.w, size.h)) kinds[cell.r]![cell.c] = "house";
      paintParking(kinds, walkable, pad.parking);
      houses.push({
        id: `house-${houses.length + 1}`,
        house: origin,
        stop: pad.stop,
        lotW: size.w,
        lotH: size.h,
        parking: pad.parking,
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

/** Kindling building lot — same size as the shop sprite on the map. */
export function shopWorldHit(): { x: number; y: number; w: number; h: number } {
  const lot = lotWorldRect(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h);
  return {
    x: (lot.left + lot.right) / 2,
    y: (lot.top + lot.bottom) / 2,
    w: lot.right - lot.left,
    h: lot.bottom - lot.top,
  };
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
