import { generateNames } from "./names";

export type SkuType = "flower" | "edible" | "preroll";

export interface Sku {
  id: string;
  name: string;
  type: SkuType;
  color: number;
}

const TYPES: SkuType[] = ["flower", "edible", "preroll"];

const TYPE_COLORS: Record<SkuType, number> = {
  flower: 0x4fae5a,
  edible: 0xe07aa0,
  preroll: 0xd4a054,
};

export const CATALOG_SIZE = 9;

export function createCatalog(seed: number): Sku[] {
  const names = generateNames(CATALOG_SIZE, seed);
  return names.map((name, i) => {
    const type = TYPES[i % TYPES.length]!;
    return {
      id: `sku-${i + 1}`,
      name,
      type,
      color: TYPE_COLORS[type],
    };
  });
}

export function skuById(catalog: Sku[], id: string): Sku | undefined {
  return catalog.find((s) => s.id === id);
}
