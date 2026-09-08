import { findPath, type TileCell } from "../sim/pathfinding";

export const TILE = 120;

/** Neighborhood: two-tile streets, house lots with driveways, shop parking. */
export const MAP_COLS = 40;
export const MAP_ROWS = 28;
export const MAP_PX_W = MAP_COLS * TILE;
export const MAP_PX_H = MAP_ROWS * TILE;

const BLOCK_H = 8;
const BLOCK_W = 9;
/** The map is specced to fourteen lots — the minimap and the delivery rota both size to it. */
export const MAX_HOUSES = 14;

export type TileKind = "wall" | "road" | "shop" | "house" | "parking";

/** How the delivery stall connects to the house. */
export type HouseAccess = "garage" | "walkway" | "curb";

export interface HouseStop {
  id: string;
  house: TileCell;
  /** Delivery / return parking stall (driveable pad, not the street). */
  stop: TileCell;
  lotW: number;
  lotH: number;
  /** Driveway / parking pad beside the house. */
  parking: TileCell[];
  /** Visual + layout style for getting from the stall to the door. */
  access: HouseAccess;
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
    // Driveable so the van can pull into the stall.
    walkable[cell.r]![cell.c] = true;
  }
}

function drivewayTowardRoad(
  kinds: TileKind[][],
  walkable: boolean[][],
  build: TileCell,
  bw: number,
  bh: number,
  access: HouseAccess,
): { parking: TileCell[]; stop: TileCell } | null {
  const buildCells = lotCells(build, bw, bh);
  const candidates: { parking: TileCell[]; stop: TileCell; score: number }[] = [];

  for (const cell of buildCells) {
    for (const n of neighbors4(cell)) {
      if (!inBounds(n.r, n.c)) continue;
      if (kinds[n.r]![n.c] !== "wall") continue;
      const road = neighbors4(n).find((r) => kinds[r.r]?.[r.c] === "road");
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
      // Curb style: single street-side stall. Garage/walkway: longer pad when possible.
      const parking =
        access === "curb" ? [n] : along.length >= 2 ? along.slice(0, 2) : [n];
      if (parking.some((p) => buildCells.some((b) => b.c === p.c && b.r === p.r))) continue;
      let score = parking.length * 10 + ((road.c + road.r) % 3);
      if (access === "garage" && parking.length >= 2) score += 8;
      if (access === "curb" && parking.length === 1) score += 6;
      candidates.push({ parking, stop: parking[0]!, score });
    }
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

const ACCESS_CYCLE: HouseAccess[] = ["garage", "walkway", "curb"];

/** One city block's buildable interior — the rectangle the streets fence off. */
interface Block {
  r0: number;
  r1: number;
  c0: number;
  c1: number;
}

/** Contiguous non-street spans between the border rings, i.e. the block interiors on one axis. */
function blockSpans(isStreetIndex: (i: number) => boolean, count: number): { lo: number; hi: number }[] {
  const spans: { lo: number; hi: number }[] = [];
  let lo: number | null = null;
  for (let i = 1; i < count - 1; i++) {
    if (isStreetIndex(i)) {
      if (lo !== null) spans.push({ lo, hi: i - 1 });
      lo = null;
    } else if (lo === null) {
      lo = i;
    }
  }
  if (lo !== null) spans.push({ lo, hi: count - 2 });
  return spans;
}

/**
 * Every block the streets carve out, in reading order. Derived from the street
 * predicates rather than hard-coded, so retuning `BLOCK_H` / `BLOCK_W` cannot
 * silently leave whole quarters of the city unbuilt.
 */
export function cityBlocks(): Block[] {
  const blocks: Block[] = [];
  for (const rows of blockSpans(isEWStreet, MAP_ROWS)) {
    for (const cols of blockSpans(isNSStreet, MAP_COLS)) {
      blocks.push({ r0: rows.lo, r1: rows.hi, c0: cols.lo, c1: cols.hi });
    }
  }
  return blocks;
}

/** Stamp a lot at `origin` if it fits and can reach a street. Mutates the grid on success. */
function tryPlaceHouse(
  kinds: TileKind[][],
  walkable: boolean[][],
  houses: HouseStop[],
  r: number,
  c: number,
): boolean {
  const size = BUILD_SIZES[(c + r * 3) % BUILD_SIZES.length]!;
  const origin = { c, r };
  if (!lotFree(kinds, origin, size.w, size.h, "wall")) return false;
  const access = ACCESS_CYCLE[houses.length % ACCESS_CYCLE.length]!;
  // Need empty wall ring for driveway / curb stall.
  const pad = drivewayTowardRoad(kinds, walkable, origin, size.w, size.h, access);
  if (!pad) return false;
  if (!pad.parking.every((p) => kinds[p.r]![p.c] === "wall")) return false;
  // Thinning: the `c * 5` term is a multiple of 5 and drops out, so this bars every
  // fifth row. Keeps lots off a shared row line rather than terracing them.
  if ((c * 5 + r * 3) % 5 === 0) return false;

  for (const cell of lotCells(origin, size.w, size.h)) kinds[cell.r]![cell.c] = "house";
  paintParking(kinds, walkable, pad.parking);
  houses.push({
    id: `house-${houses.length + 1}`,
    house: origin,
    stop: pad.stop,
    lotW: size.w,
    lotH: size.h,
    parking: pad.parking,
    access,
  });
  return true;
}

/**
 * Fill one lot inside `block`, scanning from the corner `corner` picks (low bit flips the
 * row sweep, second bit the column sweep). Staggering the start corner block by block
 * puts houses on different sides of the streets instead of stamping each block alike.
 */
function placeOneInBlock(
  kinds: TileKind[][],
  walkable: boolean[][],
  houses: HouseStop[],
  block: Block,
  corner: number,
): boolean {
  const fromBottom = (corner & 1) !== 0;
  const fromRight = (corner & 2) !== 0;
  for (let i = block.r0; i <= block.r1; i++) {
    const r = fromBottom ? block.r1 - (i - block.r0) : i;
    for (let j = block.c0; j <= block.c1; j++) {
      const c = fromRight ? block.c1 - (j - block.c0) : j;
      if (tryPlaceHouse(kinds, walkable, houses, r, c)) return true;
    }
  }
  return false;
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

  // Park at Kindling in the west strip (opens onto the street), not in the road.
  const shopSpawn =
    parking.find((p) => neighbors4(p).some((n) => kinds[n.r]?.[n.c] === "road")) ?? parking[0] ?? { c: 3, r: 4 };
  if (!parking.some((p) => p.c === shopSpawn.c && p.r === shopSpawn.r)) {
    parking.unshift(shopSpawn);
    paintParking(kinds, walkable, [shopSpawn]);
  }

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
  const blocks = cityBlocks();
  // One lot per block per pass, round-robin. Scanning the map row-major instead reaches
  // MAX_HOUSES while still inside the first block row, which is what used to leave two
  // thirds of the city — and of the phone minimap — with nothing on it.
  for (let pass = 0; houses.length < MAX_HOUSES; pass++) {
    let placedThisPass = 0;
    for (let i = 0; i < blocks.length && houses.length < MAX_HOUSES; i++) {
      if (placeOneInBlock(kinds, walkable, houses, blocks[i]!, i + pass)) placedThisPass += 1;
    }
    if (placedThisPass === 0) break;
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
  const lot = lotWorldRect(house.house, house.lotW, house.lotH);
  const home = lotCenter(house.house, house.lotW, house.lotH);
  const pads = house.parking.length > 0 ? house.parking : [house.stop];
  let px = 0;
  let py = 0;
  for (const p of pads) {
    const w = tileToWorld(p);
    px += w.x;
    py += w.y;
  }
  px /= pads.length;
  py /= pads.length;

  // Sit the door on the lot facade that faces the driveway / curb stall.
  const inset = 14;
  const dx = px - home.x;
  const dy = py - home.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x = dx < 0 ? lot.left + inset : lot.right - inset;
    const y = Math.min(lot.bottom - TILE * 0.28, Math.max(lot.top + TILE * 0.32, py));
    return { x, y };
  }
  const y = dy < 0 ? lot.top + inset : lot.bottom - inset;
  const x = Math.min(lot.right - TILE * 0.28, Math.max(lot.left + TILE * 0.28, px));
  return { x, y };
}

export function roadTextureKey(kinds: TileKind[][], r: number, c: number): string {
  const isRoadCell = (rr: number, cc: number): boolean => {
    const k = kinds[rr]?.[cc];
    return k === "road" || k === "parking" || (k === "shop" && CITY.walkable[rr]?.[cc]);
  };
  const ew = isEWStreet(r) && isRoadCell(r, c);
  const ns = isNSStreet(c) && isRoadCell(r, c);
  if (ew && ns) {
    // 2×2 junction: pick the quadrant so curbs/crosswalks sit only on the outer rim.
    const northOfPair = isEWStreet(r + 1);
    const westOfPair = isNSStreet(c + 1);
    if (northOfPair && westOfPair) return "tex-road-x-nw";
    if (northOfPair) return "tex-road-x-ne";
    if (westOfPair) return "tex-road-x-sw";
    return "tex-road-x-se";
  }
  if (ew) {
    // Two-tile EW street: north lane has curb on top; south has curb on bottom; center line meets in the middle.
    const northOfPair = isEWStreet(r + 1);
    return northOfPair ? "tex-road-hn" : "tex-road-hs";
  }
  if (ns) {
    const westOfPair = isNSStreet(c + 1);
    return westOfPair ? "tex-road-vw" : "tex-road-ve";
  }
  return "tex-road-hn";
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
