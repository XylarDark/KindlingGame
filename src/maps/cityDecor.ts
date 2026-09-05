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
      if (!isEWStreet(r) || !isNSStreet(c)) continue;
      lamps.push({
        x: c * TILE + 22,
        y: r * TILE + 20,
      });
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
        if ((c + r) % 4 === 1) {
          props.push({ x: x - 8, y: y - 10, key: trees[(c + r) % trees.length]!, depth: 1 });
        }
        if ((c * 7 + r * 3) % 11 === 2) {
          props.push({ x: x + 18, y: y + 22, key: "tex-hydrant", depth: 2, display: { w: 36, h: 48 } });
        }
        if ((c + r * 5) % 13 === 4) {
          props.push({ x, y: y + 16, key: "tex-bench", depth: 2, display: { w: 72, h: 32 } });
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
    const pad = house.parking[0];
    if (pad && i % 3 !== 2) {
      const ns = isNSStreet(house.stop.c);
      parkCarOnPad(props, pad, i % 2 === 0 ? "tex-car" : "tex-car-2", ns);
    }
  });

  CITY.shopLot.parking.forEach((pad, i) => {
    if (i % 2 === 1) return;
    parkCarOnPad(props, pad, i % 4 === 0 ? "tex-car" : "tex-car-2", isNSStreet(pad.c + 1) || isNSStreet(pad.c - 1));
  });

  return props;
}
