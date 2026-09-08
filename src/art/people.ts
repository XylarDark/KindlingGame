/**
 * Who the people in Kindling look like.
 *
 * Every look is baked as its own texture rather than tinted at runtime: `stampText`
 * bakes the KINDLING wording into the pixels, `generateTextures` assigns filter
 * modes from a fixed key set, and one tint cannot move skin, hair and shirt
 * independently anyway.
 *
 * Pure module — no Phaser — so the pool and the identity hash are unit-testable.
 */
import { hashSeed } from "../sim/dropoff";

/** Skin base plus the shade used for jaw, temples, and the far hand. */
export interface Complexion {
  skin: number;
  skinDark: number;
}

/** Hair body plus the lighter pass that catches the light on top. */
export interface HairColor {
  hair: number;
  hairLite: number;
}

export interface Outfit {
  shirt: number;
  shirtDark: number;
}

/** Silhouettes are what read at 24 logical pixels — colour alone is not enough. */
export type HairStyle = "crop" | "swept" | "long" | "bun" | "coils";

export interface Look extends Complexion, HairColor, Outfit {
  hairStyle: HairStyle;
  iris: number;
}

/**
 * Six complexions across the range, kept inside the game's warm, desaturated
 * palette so nobody looks pasted in from a different art pack.
 */
export const COMPLEXIONS = {
  porcelain: { skin: 0xf0d8bc, skinDark: 0xd6b795 },
  light: { skin: 0xe2c09a, skinDark: 0xc49870 },
  olive: { skin: 0xc9a276, skinDark: 0xa8814f },
  tan: { skin: 0xab7c52, skinDark: 0x8c6039 },
  umber: { skin: 0x815236, skinDark: 0x633c26 },
  deep: { skin: 0x63412c, skinDark: 0x492c1f },
} as const satisfies Record<string, Complexion>;

export const HAIR_COLORS = {
  // Black hair carries a real sheen: without it the darkest complexions lose the
  // hairline entirely and read as bald.
  black: { hair: 0x1a1410, hairLite: 0x453e36 },
  darkBrown: { hair: 0x2e1e14, hairLite: 0x4a3020 },
  brown: { hair: 0x3a2418, hairLite: 0x5a3a28 },
  auburn: { hair: 0x5a3a28, hairLite: 0x7a4a32 },
  blonde: { hair: 0x9a7638, hairLite: 0xc4a060 },
  silver: { hair: 0x6a6660, hairLite: 0x94908a },
  inkTeal: { hair: 0x24343e, hairLite: 0x3c5a66 },
} as const satisfies Record<string, HairColor>;

export const IRIS_COLORS = {
  slate: 0x6a90a8,
  amber: 0xc86a38,
  green: 0x3d6a44,
  hazel: 0x5a3a28,
  coal: 0x2a2420,
} as const satisfies Record<string, number>;

export const OUTFITS = {
  denim: { shirt: 0x4a5c72, shirtDark: 0x2a3848 },
  rust: { shirt: 0xa85a38, shirtDark: 0x6a3a28 },
  leaf: { shirt: 0x3d6a44, shirtDark: 0x2a4a30 },
  kraft: { shirt: 0xb89258, shirtDark: 0x8a6a3c },
  plum: { shirt: 0x6a4058, shirtDark: 0x4a2a3c },
  teal: { shirt: 0x2f5c5a, shirtDark: 0x1e403e },
  clay: { shirt: 0xc08070, shirtDark: 0x9a5f52 },
  slate: { shirt: 0x50565e, shirtDark: 0x353a40 },
} as const satisfies Record<string, Outfit>;

function look(
  complexion: keyof typeof COMPLEXIONS,
  hair: keyof typeof HAIR_COLORS,
  hairStyle: HairStyle,
  iris: keyof typeof IRIS_COLORS,
  outfit: keyof typeof OUTFITS,
): Look {
  return {
    ...COMPLEXIONS[complexion],
    ...HAIR_COLORS[hair],
    ...OUTFITS[outfit],
    hairStyle,
    iris: IRIS_COLORS[iris],
  };
}

/**
 * The customer pool. Combinations are written out rather than generated as a
 * cross product so each one can be checked by eye: no two share a complexion
 * *and* a hair colour, and the five silhouettes are spread evenly across them.
 *
 * The deepest complexions are paired with light hair on purpose — black hair on
 * deep skin lost its hairline at this pixel size and read as a flat helmet.
 *
 * Index 0 keeps the look the single baked customer had before the pool existed.
 */
export const CUSTOMER_LOOKS: readonly Look[] = [
  look("light", "auburn", "long", "slate", "denim"),
  look("umber", "black", "coils", "coal", "kraft"),
  look("porcelain", "blonde", "swept", "green", "teal"),
  look("tan", "darkBrown", "bun", "hazel", "rust"),
  look("deep", "silver", "crop", "coal", "leaf"),
  look("olive", "brown", "long", "amber", "plum"),
  look("light", "silver", "bun", "slate", "slate"),
  look("umber", "inkTeal", "coils", "hazel", "denim"),
  look("tan", "black", "swept", "coal", "clay"),
  look("porcelain", "auburn", "crop", "amber", "leaf"),
  look("deep", "blonde", "bun", "hazel", "teal"),
  look("olive", "inkTeal", "crop", "slate", "kraft"),
];

export const CUSTOMER_LOOK_COUNT = CUSTOMER_LOOKS.length;

/**
 * Which of the pool a customer is, from the same identity the ID card is built
 * from. Salted so the look does not track the printed date of birth.
 *
 * This is the *only* place a customer's appearance is chosen. The sprite key and
 * the ID portrait key are both derived from the result, so a door sprite and its
 * photo cannot disagree.
 */
export function customerLookIndex(name: string, age: number): number {
  return hashSeed(`look:${name}:${age}`) % CUSTOMER_LOOK_COUNT;
}

export function customerLook(index: number): Look {
  const found = CUSTOMER_LOOKS[((index % CUSTOMER_LOOK_COUNT) + CUSTOMER_LOOK_COUNT) % CUSTOMER_LOOK_COUNT];
  if (!found) throw new Error("customer look pool is empty");
  return found;
}

/** Standing sprite for a pool index — shop floor, curb, and doorstep. */
export function customerTextureKey(index: number): string {
  return `tex-customer-${((index % CUSTOMER_LOOK_COUNT) + CUSTOMER_LOOK_COUNT) % CUSTOMER_LOOK_COUNT}`;
}

/** Head-and-shoulders portrait for the same person, for the ID card photo box. */
export function customerPortraitKey(index: number): string {
  return `tex-face-${((index % CUSTOMER_LOOK_COUNT) + CUSTOMER_LOOK_COUNT) % CUSTOMER_LOOK_COUNT}`;
}

/** Every standing customer texture, in pool order — the bake list and the filter set. */
export function customerTextureKeys(): string[] {
  return CUSTOMER_LOOKS.map((_, i) => customerTextureKey(i));
}

export function customerPortraitKeys(): string[] {
  return CUSTOMER_LOOKS.map((_, i) => customerPortraitKey(i));
}

/**
 * The crew wear Kindling colours, so only the person varies — complexion, hair
 * colour, silhouette, eyes. Shirt is supplied by the kit at bake time.
 */
const CREW_FACES: readonly { complexion: keyof typeof COMPLEXIONS; hair: keyof typeof HAIR_COLORS; hairStyle: HairStyle; iris: keyof typeof IRIS_COLORS }[] = [
  { complexion: "light", hair: "black", hairStyle: "crop", iris: "amber" },
  { complexion: "umber", hair: "black", hairStyle: "coils", iris: "coal" },
  { complexion: "deep", hair: "darkBrown", hairStyle: "crop", iris: "hazel" },
  { complexion: "porcelain", hair: "blonde", hairStyle: "swept", iris: "slate" },
  { complexion: "tan", hair: "brown", hairStyle: "bun", iris: "hazel" },
  { complexion: "olive", hair: "silver", hairStyle: "swept", iris: "green" },
  { complexion: "light", hair: "auburn", hairStyle: "long", iris: "green" },
  { complexion: "umber", hair: "inkTeal", hairStyle: "coils", iris: "amber" },
];

export const CREW_FACE_COUNT = CREW_FACES.length;

/**
 * The driver and the key lead are cast once per session, so the seated driver and
 * the standing driver are the same person all day.
 */
export function crewFace(seed: number, slot: "driver" | "keylead"): Omit<Look, keyof Outfit> {
  const h = hashSeed(`crew:${slot}:${seed}`);
  const pick = CREW_FACES[h % CREW_FACE_COUNT];
  if (!pick) throw new Error("crew face pool is empty");
  return {
    ...COMPLEXIONS[pick.complexion],
    ...HAIR_COLORS[pick.hair],
    hairStyle: pick.hairStyle,
    iris: IRIS_COLORS[pick.iris],
  };
}
