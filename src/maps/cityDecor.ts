import Phaser from "phaser";
import {
  CITY,
  TILE,
  doorstepWorld,
  isEWStreet,
  isNSStreet,
  lotCenter,
  lotWorldRect,
  tileToWorld,
  type HouseStop,
} from "./cityT0";
import { Pal } from "../art/palette";

export type CityProp = {
  x: number;
  y: number;
  key: string;
  depth: number;
  display?: { w: number; h: number };
};

export type CityLamp = { x: number; y: number };

export type CityAccessPath = {
  /** Polyline from stall toward the house. */
  points: { x: number; y: number }[];
  /** Asphalt driveway, concrete walkway, or flagstone path. */
  kind: "drive" | "walk" | "flag";
  width: number;
};

function lotKeys(house: HouseStop): Set<string> {
  const keys = new Set<string>();
  for (let r = house.house.r; r < house.house.r + house.lotH; r++) {
    for (let c = house.house.c; c < house.house.c + house.lotW; c++) {
      keys.add(`${c},${r}`);
    }
  }
  for (const p of house.parking) keys.add(`${p.c},${p.r}`);
  return keys;
}

function allLotKeys(): Set<string> {
  const keys = new Set<string>();
  for (const house of CITY.houses) {
    for (const key of lotKeys(house)) keys.add(key);
  }
  for (let r = CITY.shopLot.origin.r; r < CITY.shopLot.origin.r + CITY.shopLot.h; r++) {
    for (let c = CITY.shopLot.origin.c; c < CITY.shopLot.origin.c + CITY.shopLot.w; c++) {
      keys.add(`${c},${r}`);
    }
  }
  for (const p of CITY.shopLot.parking) keys.add(`${p.c},${p.r}`);
  return keys;
}

export function cityStreetLamps(): CityLamp[] {
  const lamps: CityLamp[] = [];
  const kinds = CITY.kinds;
  for (let r = 1; r < kinds.length - 1; r++) {
    for (let c = 1; c < kinds[r]!.length - 1; c++) {
      if (kinds[r]![c] !== "road") continue;
      // Sit lamps on the outer curb mid-block — not stacked on every intersection.
      if (isEWStreet(r) && !isNSStreet(c) && c % 4 === 2) {
        const southLane = isEWStreet(r - 1);
        lamps.push({
          x: c * TILE + TILE / 2,
          y: southLane ? r * TILE + TILE - 10 : r * TILE + 10,
        });
      }
      if (isNSStreet(c) && !isEWStreet(r) && r % 4 === 2) {
        const eastLane = isNSStreet(c - 1);
        lamps.push({
          x: eastLane ? c * TILE + TILE - 10 : c * TILE + 10,
          y: r * TILE + TILE / 2,
        });
      }
    }
  }
  return lamps;
}

function parkCarOnPad(
  props: CityProp[],
  pad: { c: number; r: number },
  key: string,
  nsStreet: boolean,
): void {
  const x = pad.c * TILE + TILE / 2;
  const y = pad.r * TILE + TILE / 2;
  props.push({
    x,
    y,
    key,
    depth: 2,
    display: nsStreet ? { w: 44, h: 80 } : { w: 88, h: 44 },
  });
}

function nextToRoad(kinds: typeof CITY.kinds, c: number, r: number): boolean {
  return (
    kinds[r]?.[c - 1] === "road" ||
    kinds[r]?.[c + 1] === "road" ||
    kinds[r - 1]?.[c] === "road" ||
    kinds[r + 1]?.[c] === "road"
  );
}

function nextToLot(lots: Set<string>, c: number, r: number): boolean {
  return (
    lots.has(`${c - 1},${r}`) ||
    lots.has(`${c + 1},${r}`) ||
    lots.has(`${c},${r - 1}`) ||
    lots.has(`${c},${r + 1}`) ||
    lots.has(`${c - 1},${r - 1}`) ||
    lots.has(`${c + 1},${r - 1}`) ||
    lots.has(`${c - 1},${r + 1}`) ||
    lots.has(`${c + 1},${r + 1}`)
  );
}

const TREE_DISPLAY = { w: 56, h: 70 };

export function cityProps(): CityProp[] {
  const props: CityProp[] = [];
  const kinds = CITY.kinds;
  const lots = allLotKeys();
  const trees = ["tex-tree", "tex-tree-2", "tex-tree-3"] as const;

  for (let r = 0; r < kinds.length; r++) {
    for (let c = 0; c < kinds[r]!.length; c++) {
      const kind = kinds[r]![c]!;
      const x = c * TILE + TILE / 2;
      const y = r * TILE + TILE / 2;
      if (lots.has(`${c},${r}`)) continue;

      if (kind === "wall") {
        // Keep canopy clear of house/shop lots — no trees on tiles that hug a lot edge.
        if ((c * 11 + r * 7) % 17 === 3 && !nextToLot(lots, c, r)) {
          props.push({
            x: x - 4,
            y: y - 6,
            key: trees[(c + r) % trees.length]!,
            depth: 1,
            display: TREE_DISPLAY,
          });
        }
        if ((c * 7 + r * 3) % 19 === 5 && nextToRoad(kinds, c, r)) {
          props.push({ x: x + 14, y: y + 18, key: "tex-hydrant", depth: 2, display: { w: 32, h: 44 } });
        }
        if ((c + r * 5) % 23 === 8 && nextToRoad(kinds, c, r)) {
          props.push({ x, y: y + 14, key: "tex-bench", depth: 2, display: { w: 64, h: 28 } });
        }
      }
    }
  }

  // Mailboxes beside the lawn approach; decorative cars only on longer pads.
  CITY.houses.forEach((house, i) => {
    const home = lotCenter(house.house, house.lotW, house.lotH);
    const door = doorstepWorld(house);
    const padEdge = tileEdgeToward(parkingNearestHouse(house), home);
    const alongX = Math.abs(padEdge.x - door.x) >= Math.abs(padEdge.y - door.y);
    const mx = alongX ? (padEdge.x + door.x) / 2 : padEdge.x + (padEdge.x >= home.x ? 18 : -18);
    const my = alongX ? padEdge.y + (padEdge.y >= home.y ? 18 : -18) : (padEdge.y + door.y) / 2;
    props.push({ x: mx, y: my, key: "tex-mailbox", depth: 2, display: { w: 28, h: 40 } });
    if (house.access === "garage") {
      props.push({
        x: home.x * 0.35 + padEdge.x * 0.65,
        y: home.y * 0.35 + padEdge.y * 0.65,
        key: "tex-garage",
        depth: 1,
        display: { w: 88, h: 72 },
      });
    }
    const pad = house.parking[1] ?? null;
    if (pad && house.access !== "curb" && i % 3 !== 2) {
      const ns = isNSStreet(house.stop.c) || Math.abs(pad.c - house.stop.c) === 0;
      parkCarOnPad(props, pad, i % 2 === 0 ? "tex-car" : "tex-car-2", ns);
    }
  });

  // Leave Kindling's curb-side stall empty for the van; decorate farther pads only.
  const shopStall = `${CITY.shopSpawn.c},${CITY.shopSpawn.r}`;
  CITY.shopLot.parking.forEach((pad, i) => {
    if (`${pad.c},${pad.r}` === shopStall) return;
    if (i % 2 === 0) return;
    parkCarOnPad(props, pad, i % 4 === 0 ? "tex-car" : "tex-car-2", isNSStreet(pad.c + 1) || isNSStreet(pad.c - 1));
  });

  return props;
}

/** Walkways / driveways from each stall to the house door (or garage). */
export function cityAccessPaths(): CityAccessPath[] {
  const paths: CityAccessPath[] = [];
  for (const house of CITY.houses) {
    paths.push(accessPathFor(house));
  }
  return paths;
}

/**
 * Paths live on the lawn between pad and house — orthogonal L-elbows that start
 * at the house-facing parking edge so they never stroke over stall asphalt.
 */
function accessPathFor(house: HouseStop): CityAccessPath {
  const home = lotCenter(house.house, house.lotW, house.lotH);
  const door = doorstepWorld(house);
  const padCell = parkingNearestHouse(house);
  const padEdge = tileEdgeToward(padCell, home);

  if (house.access === "garage") {
    const garage = {
      x: home.x * 0.35 + padEdge.x * 0.65,
      y: home.y * 0.35 + padEdge.y * 0.65,
    };
    return {
      kind: "drive",
      width: 40,
      points: orthoTo(padEdge, garage),
    };
  }

  if (house.access === "walkway") {
    return {
      kind: "walk",
      width: 20,
      points: orthoTo(padEdge, door),
    };
  }

  return {
    kind: "flag",
    width: 16,
    points: orthoTo(door, padEdge),
  };
}

function parkingNearestHouse(house: HouseStop): { c: number; r: number } {
  const home = lotCenter(house.house, house.lotW, house.lotH);
  let best = house.parking[0] ?? house.stop;
  let bestD = Infinity;
  for (const p of house.parking) {
    const w = tileToWorld(p);
    const d = Math.hypot(w.x - home.x, w.y - home.y);
    if (d < bestD) {
      best = p;
      bestD = d;
    }
  }
  return best;
}

/** World point on the side of a tile facing `toward` (pad lip, not the stall center). */
function tileEdgeToward(cell: { c: number; r: number }, toward: { x: number; y: number }): { x: number; y: number } {
  const c = tileToWorld(cell);
  const dx = toward.x - c.x;
  const dy = toward.y - c.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: c.x + Math.sign(dx || 1) * (TILE * 0.5 - 2), y: c.y };
  }
  return { x: c.x, y: c.y + Math.sign(dy || 1) * (TILE * 0.5 - 2) };
}

/** Axis-aligned approach: one elbow max, prefers the leg that hugs the house wall. */
function orthoTo(from: { x: number; y: number }, to: { x: number; y: number }): { x: number; y: number }[] {
  if (Math.abs(from.x - to.x) < 10) return [from, { x: to.x, y: to.y }];
  if (Math.abs(from.y - to.y) < 10) return [from, { x: to.x, y: to.y }];
  // Run beside the lot first (match door's dominant offset), then cut in.
  const byX = Math.abs(from.x - to.x);
  const byY = Math.abs(from.y - to.y);
  const mid = byX >= byY ? { x: to.x, y: from.y } : { x: from.x, y: to.y };
  return [from, mid, to];
}

/** Paint access paths under house/prop sprites. */
export function paintAccessPaths(g: Phaser.GameObjects.Graphics, paths: readonly CityAccessPath[]): void {
  for (const path of paths) {
    if (path.points.length < 2) continue;
    if (path.kind === "drive") paintDriveApron(g, path.points, path.width);
    else if (path.kind === "walk") paintConcreteWalk(g, path.points, path.width);
    else paintFlagstones(g, path.points, path.width);
  }
}

/** Concrete lips where parking pads meet house lots, plus door stoops. */
export function paintHouseStreetSeams(g: Phaser.GameObjects.Graphics): void {
  for (const house of CITY.houses) {
    paintPadLotSeam(g, house);
    paintDoorStoop(g, house);
  }
}

function paintPadLotSeam(g: Phaser.GameObjects.Graphics, house: HouseStop): void {
  const lot = lotWorldRect(house.house, house.lotW, house.lotH);
  const home = lotCenter(house.house, house.lotW, house.lotH);
  const pad = parkingNearestHouse(house);
  const padW = tileToWorld(pad);
  const dx = padW.x - home.x;
  const dy = padW.y - home.y;
  const thick = 10;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const x = dx < 0 ? lot.left - thick : lot.right;
    g.fillStyle(Pal.curb, 1);
    g.fillRect(x, lot.top + 8, thick, lot.bottom - lot.top - 16);
    g.fillStyle(Pal.wall, 0.85);
    g.fillRect(x + 2, lot.top + 12, thick - 4, lot.bottom - lot.top - 24);
  } else {
    const y = dy < 0 ? lot.top - thick : lot.bottom;
    g.fillStyle(Pal.curb, 1);
    g.fillRect(lot.left + 8, y, lot.right - lot.left - 16, thick);
    g.fillStyle(Pal.wall, 0.85);
    g.fillRect(lot.left + 12, y + 2, lot.right - lot.left - 24, thick - 4);
  }
}

function paintDoorStoop(g: Phaser.GameObjects.Graphics, house: HouseStop): void {
  if (house.access === "garage") return;
  const door = doorstepWorld(house);
  const home = lotCenter(house.house, house.lotW, house.lotH);
  const padEdge = tileEdgeToward(parkingNearestHouse(house), home);
  const dx = padEdge.x - door.x;
  const dy = padEdge.y - door.y;
  const alongX = Math.abs(dx) >= Math.abs(dy);
  const outX = alongX ? Math.sign(dx || 1) : 0;
  const outY = alongX ? 0 : Math.sign(dy || 1);
  const cx = door.x + outX * 10;
  const cy = door.y + outY * 10;
  const w = alongX ? 18 : 28;
  const h = alongX ? 28 : 16;
  g.fillStyle(Pal.asphaltDark, 0.35);
  g.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w, h);
  g.fillStyle(Pal.curb, 1);
  g.fillRect(cx - w / 2, cy - h / 2, w, h);
  g.fillStyle(Pal.wall, 0.95);
  g.fillRect(cx - w / 2 + 2, cy - h / 2 + 2, w - 4, h - 4);
  // Door threshold mark on the facade.
  g.fillStyle(Pal.woodDark, 1);
  if (alongX) g.fillRect(door.x - 3, door.y - 10, 6, 20);
  else g.fillRect(door.x - 10, door.y - 3, 20, 6);
}

function paintDriveApron(
  g: Phaser.GameObjects.Graphics,
  points: readonly { x: number; y: number }[],
  width: number,
): void {
  fillOrthoRibbon(g, points, width + 6, Pal.asphaltDark, 1);
  fillOrthoRibbon(g, points, width, Pal.asphalt, 1);
  fillOrthoRibbon(g, points, Math.max(6, width - 18), Pal.asphaltLite, 0.55);
}

function paintConcreteWalk(
  g: Phaser.GameObjects.Graphics,
  points: readonly { x: number; y: number }[],
  width: number,
): void {
  fillOrthoRibbon(g, points, width + 5, Pal.curb, 1);
  fillOrthoRibbon(g, points, width, Pal.wall, 1);
  fillOrthoRibbon(g, points, Math.max(8, width - 6), Pal.creamSoft, 0.92);
  // Slab joints every ~TILE/2 along each leg.
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const horiz = Math.abs(a.y - b.y) < 4;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.floor(len / 28));
    for (let s = 1; s < steps; s++) {
      const t = s / steps;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      g.fillStyle(Pal.curb, 0.55);
      if (horiz) g.fillRect(x - 1, y - width / 2, 2, width);
      else g.fillRect(x - width / 2, y - 1, width, 2);
    }
  }
}

function paintFlagstones(
  g: Phaser.GameObjects.Graphics,
  points: readonly { x: number; y: number }[],
  width: number,
): void {
  const stones = sampleOrtho(points, 22);
  stones.forEach((p, i) => {
    const wobble = (i % 2 === 0 ? -1 : 1) * 3;
    const hw = width * 0.55 + (i % 3);
    const hh = width * 0.42 + ((i * 2) % 3);
    g.fillStyle(Pal.asphaltDark, 0.35);
    g.fillRect(p.x - hw + 2 + wobble, p.y - hh + 2, hw * 2, hh * 2);
    g.fillStyle(i % 2 === 0 ? Pal.curb : Pal.creamSoft, 1);
    g.fillRect(p.x - hw + wobble, p.y - hh, hw * 2, hh * 2);
    g.fillStyle(Pal.wall, 0.35);
    g.fillRect(p.x - hw + 2 + wobble, p.y - hh + 1, hw * 2 - 4, 3);
  });
}

function fillOrthoRibbon(
  g: Phaser.GameObjects.Graphics,
  points: readonly { x: number; y: number }[],
  width: number,
  color: number,
  alpha: number,
): void {
  g.fillStyle(color, alpha);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    if (maxY - minY < 4) {
      g.fillRect(minX, a.y - width / 2, Math.max(2, maxX - minX), width);
    } else if (maxX - minX < 4) {
      g.fillRect(a.x - width / 2, minY, width, Math.max(2, maxY - minY));
    } else {
      // Safety: unexpected diagonal — cover with a short axis pair.
      g.fillRect(minX, a.y - width / 2, maxX - minX, width);
      g.fillRect(b.x - width / 2, minY, width, maxY - minY);
    }
    g.fillRect(a.x - width / 2, a.y - width / 2, width, width);
  }
  const last = points[points.length - 1]!;
  g.fillRect(last.x - width / 2, last.y - width / 2, width, width);
}

function sampleOrtho(
  points: readonly { x: number; y: number }[],
  spacing: number,
): { x: number; y: number }[] {
  const out: { x: number; y: number }[] = [];
  let carry = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1) continue;
    let d = spacing - carry;
    while (d <= len) {
      const t = d / len;
      out.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
      d += spacing;
    }
    carry = (len + carry) % spacing;
  }
  if (out.length === 0 && points[0]) out.push(points[0]);
  return out;
}
