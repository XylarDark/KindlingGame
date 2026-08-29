import { findPath, type TileCell } from "../sim/pathfinding";

export const TILE = 64;

/** Neighborhood grid: east-west streets every 5 rows, north-south every 6 cols. */
export const MAP_COLS = 42;
export const MAP_ROWS = 26;
export const MAP_PX_W = MAP_COLS * TILE;
export const MAP_PX_H = MAP_ROWS * TILE;

const STREET_ROW = 5;
const STREET_COL = 6;
const MAX_HOUSES = 16;

export type TileKind = "wall" | "road" | "shop" | "house";

export interface HouseStop {
  id: string;
  house: TileCell;
  stop: TileCell;
}

export interface CityMap {
  kinds: TileKind[][];
  walkable: boolean[][];
  shopSpawn: TileCell;
  houses: HouseStop[];
}

function isBorder(r: number, c: number): boolean {
  return r === 0 || c === 0 || r === MAP_ROWS - 1 || c === MAP_COLS - 1;
}

function isStreet(r: number, c: number): boolean {
  if (isBorder(r, c)) return false;
  return r % STREET_ROW === 1 || c % STREET_COL === 1;
}

function neighbors4(cell: TileCell): TileCell[] {
  return [
    { c: cell.c - 1, r: cell.r },
    { c: cell.c + 1, r: cell.r },
    { c: cell.c, r: cell.r - 1 },
    { c: cell.c, r: cell.r + 1 },
  ];
}

export function buildCityMap(): CityMap {
  const kinds: TileKind[][] = [];
  const walkable: boolean[][] = [];
  const shopSpawn: TileCell = { c: 1, r: 1 };

  for (let r = 0; r < MAP_ROWS; r++) {
    kinds[r] = [];
    walkable[r] = [];
    for (let c = 0; c < MAP_COLS; c++) {
      if (r === shopSpawn.r && c === shopSpawn.c) {
        kinds[r]![c] = "shop";
        walkable[r]![c] = true;
      } else if (isStreet(r, c)) {
        kinds[r]![c] = "road";
        walkable[r]![c] = true;
      } else {
        kinds[r]![c] = "wall";
        walkable[r]![c] = false;
      }
    }
  }

  const candidates: TileCell[] = [];
  for (let r = 1; r < MAP_ROWS - 1; r++) {
    for (let c = 1; c < MAP_COLS - 1; c++) {
      if (kinds[r]![c] !== "wall") continue;
      if (r + c < 6) continue;
      const touchesRoad = neighbors4({ c, r }).some((n) => walkable[n.r]?.[n.c]);
      if (touchesRoad) candidates.push({ c, r });
    }
  }

  const houseTiles: { id: string; cell: TileCell }[] = [];
  for (let i = 0; i < candidates.length && houseTiles.length < MAX_HOUSES; i++) {
    if (i % 2 !== 0) continue;
    const cell = candidates[i]!;
    kinds[cell.r]![cell.c] = "house";
    houseTiles.push({ id: `house-${houseTiles.length + 1}`, cell });
  }

  const houses: HouseStop[] = houseTiles.map((h) => ({
    id: h.id,
    house: h.cell,
    stop: nearestRoad(walkable, h.cell) ?? shopSpawn,
  }));

  return { kinds, walkable, shopSpawn, houses };
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

export function doorstepWorld(house: HouseStop): { x: number; y: number } {
  const home = tileToWorld(house.house);
  const curb = tileToWorld(house.stop);
  return { x: home.x * 0.55 + curb.x * 0.45, y: home.y * 0.55 + curb.y * 0.45 };
}

export function roadTextureKey(kinds: TileKind[][], r: number, c: number): string {
  const road = (rr: number, cc: number) => {
    const k = kinds[rr]?.[cc];
    return k === "road" || k === "shop";
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
