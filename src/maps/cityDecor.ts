import {
  CITY,
  TILE,
  isEWStreet,
  isNSStreet,
  lotCenter,
  tileToWorld,
  type HouseStop,
} from "./cityT0";

export type CityProp = {
  x: number;
  y: number;
  key: string;
  depth: number;
  display?: { w: number; h: number };
};

export type CityLamp = { x: number; y: number };

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
        // Sparse yard trees only — avoid a second tree grid fighting the lots.
        if ((c * 11 + r * 7) % 17 === 3) {
          props.push({ x: x - 6, y: y - 8, key: trees[(c + r) % trees.length]!, depth: 1 });
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

  // Parked cars only on driveways / Kindling stalls — never on the road or lawn.
  CITY.houses.forEach((house, i) => {
    const home = lotCenter(house.house, house.lotW, house.lotH);
    const curb = tileToWorld(house.stop);
    const mx = home.x * 0.7 + curb.x * 0.3;
    const my = home.y * 0.7 + curb.y * 0.3;
    props.push({ x: mx, y: my, key: "tex-mailbox", depth: 2, display: { w: 28, h: 40 } });
    if (i % 2 === 0) {
      props.push({
        x: home.x + house.lotW * TILE * 0.28,
        y: home.y + house.lotH * TILE * 0.18,
        key: trees[i % trees.length]!,
        depth: 2,
      });
    }
    const pad = house.parking[1] ?? null;
    if (pad && i % 3 !== 2) {
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
