/**
 * Geometry for the neighbourhood map on the delivery phone.
 *
 * The city is fully deterministic (no RNG), so every static feature — street
 * bands, blocks, all fourteen house lots, their driveways, the shop — can be
 * computed once and baked, instead of the phone re-issuing a fill per tile on
 * every frame. Streets come out as whole bands rather than per-tile squares,
 * which is also what kills the seams at fractional tile scale.
 *
 * Pure module — no Phaser — so it unit-tests headlessly like `cityT0.test.ts`.
 */
import {
  CITY,
  MAP_COLS,
  MAP_PX_H,
  MAP_PX_W,
  MAP_ROWS,
  TILE,
  isEWStreet,
  isNSStreet,
  lotWorldRect,
} from "./cityT0";

export interface WorldRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** 40×28 tiles — the panel has to match this or it letterboxes its own data. */
export const CITY_ASPECT = MAP_PX_W / MAP_PX_H;

export interface MinimapProjection {
  /** World pixels → panel pixels. */
  scale: number;
  ox: number;
  oy: number;
  toMap(wx: number, wy: number): { x: number; y: number };
  /** A world rect as a rounded panel rect — integers, so no half-pixel seams. */
  rect(r: WorldRect): { x: number; y: number; w: number; h: number };
}

/**
 * Fit the whole city into `box`. When the box carries the city's aspect there is
 * nothing to centre, but the offsets are kept so a mismatched box degrades to
 * letterboxing instead of stretching.
 */
export function minimapProjection(box: Box): MinimapProjection {
  const scale = Math.min(box.w / MAP_PX_W, box.h / MAP_PX_H);
  const ox = box.x + (box.w - MAP_PX_W * scale) * 0.5;
  const oy = box.y + (box.h - MAP_PX_H * scale) * 0.5;
  const toMap = (wx: number, wy: number): { x: number; y: number } => ({
    x: ox + wx * scale,
    y: oy + wy * scale,
  });
  return {
    scale,
    ox,
    oy,
    toMap,
    rect: (r: WorldRect) => {
      const a = toMap(r.left, r.top);
      const b = toMap(r.right, r.bottom);
      const x = Math.round(a.x);
      const y = Math.round(a.y);
      // Round the far edge too, so adjoining rects share an integer boundary.
      return { x, y, w: Math.max(1, Math.round(b.x) - x), h: Math.max(1, Math.round(b.y) - y) };
    },
  };
}

/** A city-aspect panel centred inside the space available for it. */
export function fitCityPanel(avail: Box): Box {
  let w = avail.w;
  let h = w / CITY_ASPECT;
  if (h > avail.h) {
    h = avail.h;
    w = h * CITY_ASPECT;
  }
  return {
    x: avail.x + (avail.w - w) * 0.5,
    y: avail.y + (avail.h - h) * 0.5,
    w,
    h,
  };
}

export interface CityMinimapGeometry {
  /** Everything inside the border ring — the part with streets and lots on it. */
  interior: WorldRect;
  /** The four two-lane east–west streets, as single bands. */
  streetsEW: WorldRect[];
  /** The five two-lane north–south streets, as single bands. */
  streetsNS: WorldRect[];
  /** City blocks between the streets — the base tone the lots sit on. */
  blocks: WorldRect[];
  houses: { id: string; rect: WorldRect }[];
  /** Driveway / curb stall for each house, in the same order. */
  stalls: { id: string; rect: WorldRect }[];
  shop: WorldRect;
  shopStalls: WorldRect[];
}

/** Contiguous runs of indices for which `member` holds. */
function runs(count: number, member: (i: number) => boolean): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start: number | null = null;
  for (let i = 0; i < count; i++) {
    if (member(i)) {
      if (start === null) start = i;
      continue;
    }
    if (start !== null) {
      out.push({ from: start, to: i - 1 });
      start = null;
    }
  }
  if (start !== null) out.push({ from: start, to: count - 1 });
  return out;
}

/** Gaps between runs, clipped to the interior. */
function gaps(bands: { from: number; to: number }[], first: number, last: number): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let cursor = first;
  for (const band of bands) {
    if (band.from > cursor) out.push({ from: cursor, to: band.from - 1 });
    cursor = band.to + 1;
  }
  if (cursor <= last) out.push({ from: cursor, to: last });
  return out;
}

function tileRect(fromC: number, toC: number, fromR: number, toR: number): WorldRect {
  return {
    left: fromC * TILE,
    top: fromR * TILE,
    right: (toC + 1) * TILE,
    bottom: (toR + 1) * TILE,
  };
}

function cellRect(cell: { c: number; r: number }): WorldRect {
  return tileRect(cell.c, cell.c, cell.r, cell.r);
}

export function cityMinimapGeometry(): CityMinimapGeometry {
  const firstC = 1;
  const lastC = MAP_COLS - 2;
  const firstR = 1;
  const lastR = MAP_ROWS - 2;

  const rowBands = runs(MAP_ROWS, isEWStreet);
  const colBands = runs(MAP_COLS, isNSStreet);
  const rowGaps = gaps(rowBands, firstR, lastR);
  const colGaps = gaps(colBands, firstC, lastC);

  const blocks: WorldRect[] = [];
  for (const rg of rowGaps) {
    for (const cg of colGaps) blocks.push(tileRect(cg.from, cg.to, rg.from, rg.to));
  }

  return {
    interior: tileRect(firstC, lastC, firstR, lastR),
    streetsEW: rowBands.map((b) => tileRect(firstC, lastC, b.from, b.to)),
    streetsNS: colBands.map((b) => tileRect(b.from, b.to, firstR, lastR)),
    blocks,
    houses: CITY.houses.map((h) => ({ id: h.id, rect: lotWorldRect(h.house, h.lotW, h.lotH) })),
    stalls: CITY.houses.map((h) => ({ id: h.id, rect: stallRect(h.parking, h.stop) })),
    shop: lotWorldRect(CITY.shopLot.origin, CITY.shopLot.w, CITY.shopLot.h),
    shopStalls: CITY.shopLot.parking.map(cellRect),
  };
}

/** Bounding box of a house's parking pads — one rect reads better than two dots. */
function stallRect(parking: { c: number; r: number }[], stop: { c: number; r: number }): WorldRect {
  const cells = parking.length > 0 ? parking : [stop];
  const first = cells[0]!;
  let minC = first.c;
  let maxC = first.c;
  let minR = first.r;
  let maxR = first.r;
  for (const cell of cells) {
    minC = Math.min(minC, cell.c);
    maxC = Math.max(maxC, cell.c);
    minR = Math.min(minR, cell.r);
    maxR = Math.max(maxR, cell.r);
  }
  return tileRect(minC, maxC, minR, maxR);
}
