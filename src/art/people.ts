/**
 * Who the people in Kindling look like.
 *
 * Every look is baked as its own texture rather than tinted or layered at runtime:
 * `stampText` bakes the KINDLING wording into the pixels, `generateTextures` assigns
 * filter modes from a fixed key set, and every scene treats a person as one Image
 * with one key. What *is* layered is the authoring — a look is a set of independent
 * traits (build, garment, headwear, facial hair, accessory, pattern) composed at bake
 * time, so a new variant costs one row in a table rather than a new drawing.
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

/** Torso outline. The largest shape on the sprite, so the loudest of the cues. */
export type Build = "slim" | "regular" | "broad";

/** Garment *shapes*, not recolours: each one changes the body's outline. */
export type Garment =
  | "tee"
  | "hoodie"
  | "jacket"
  | "vest"
  | "tank"
  | "dress"
  | "skirt"
  | "coat"
  | "apron";

export type Legs = "trousers" | "bare" | "shorts";
export type Headwear = "none" | "beanie" | "cap" | "headscarf";
export type FacialHair = "none" | "stubble" | "moustache" | "beard";
export type Accessory = "none" | "earrings" | "satchel" | "neckScarf";
export type Pattern = "solid" | "stripe";
export type Footwear = "boot" | "flat";

/**
 * What each look was drawn *towards*. Authorial intent, recorded so the spread can be
 * asserted — it is deliberately not a rendering switch. Nothing reads this field to
 * decide what to draw; the traits above do all the work, which is what stops the cast
 * collapsing into two body types with a flag between them.
 */
export type Presentation = "masc" | "fem" | "andro";

export interface Look extends Complexion, HairColor, Outfit {
  hairStyle: HairStyle;
  iris: number;
  build: Build;
  garment: Garment;
  legs: Legs;
  headwear: Headwear;
  facialHair: FacialHair;
  accessory: Accessory;
  pattern: Pattern;
  footwear: Footwear;
  /** Second layer, seen through an open jacket or in a vest's sleeves. */
  inner: number;
  /** Headwear, scarves and small metal. Reads against both shirt and skin. */
  accent: number;
  presents: Presentation;
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
  moss: { shirt: 0x6d7a4a, shirtDark: 0x4c5632 },
  wine: { shirt: 0x7a3a42, shirtDark: 0x54262c },
  sand: { shirt: 0xd0b98a, shirtDark: 0xa08f66 },
  ink: { shirt: 0x2f3440, shirtDark: 0x1c202a },
} as const satisfies Record<string, Outfit>;

/** Under-layers and small accents. Flat single tones — they are read, not modelled. */
export const ACCENTS = {
  cream: 0xe8dcc0,
  charcoal: 0x2a2e36,
  ochre: 0xc8913c,
  rose: 0xc07a80,
  sky: 0x7fa3bd,
  pine: 0x35533c,
  brass: 0xd8b45c,
  oat: 0xbfae8c,
} as const satisfies Record<string, number>;

/** Garments that replace trousers with a hem and bare leg. */
const BARE_LEG_GARMENTS: ReadonlySet<Garment> = new Set<Garment>(["dress", "skirt"]);

interface LookSpec {
  skin: keyof typeof COMPLEXIONS;
  hair: keyof typeof HAIR_COLORS;
  hairStyle: HairStyle;
  iris: keyof typeof IRIS_COLORS;
  outfit: keyof typeof OUTFITS;
  build: Build;
  garment: Garment;
  presents: Presentation;
  inner?: keyof typeof ACCENTS;
  accent?: keyof typeof ACCENTS;
  headwear?: Headwear;
  facialHair?: FacialHair;
  accessory?: Accessory;
  pattern?: Pattern;
  footwear?: Footwear;
}

function look(spec: LookSpec): Look {
  return {
    ...COMPLEXIONS[spec.skin],
    ...HAIR_COLORS[spec.hair],
    ...OUTFITS[spec.outfit],
    hairStyle: spec.hairStyle,
    iris: IRIS_COLORS[spec.iris],
    build: spec.build,
    garment: spec.garment,
    legs: BARE_LEG_GARMENTS.has(spec.garment) ? "bare" : "trousers",
    headwear: spec.headwear ?? "none",
    facialHair: spec.facialHair ?? "none",
    accessory: spec.accessory ?? "none",
    pattern: spec.pattern ?? "solid",
    footwear: spec.footwear ?? "boot",
    inner: ACCENTS[spec.inner ?? "cream"],
    accent: ACCENTS[spec.accent ?? "charcoal"],
    presents: spec.presents,
  };
}

/**
 * The customer pool: twenty-four looks, written out rather than generated as a cross
 * product so each can be checked by eye.
 *
 * Gender presentation is carried by several weak cues at once — build, garment cut,
 * hem, headwear, facial hair, small metal — and never by one loud one. In particular
 * hair length is deliberately *decorrelated*: there are feminine looks with a crop and
 * masculine looks with long hair, because "long hair means woman" would make this a
 * stereotype rather than a crowd. Facial hair is likewise split, appearing on half the
 * masculine looks and on an androgynous one.
 *
 * Index 0 keeps the look the single baked customer had before the pool existed.
 */
export const CUSTOMER_LOOKS: readonly Look[] = [
  look({ skin: "light", hair: "auburn", hairStyle: "long", iris: "slate", outfit: "denim", build: "regular", garment: "tee", presents: "andro" }),
  look({ skin: "umber", hair: "black", hairStyle: "coils", iris: "coal", outfit: "kraft", build: "broad", garment: "hoodie", presents: "masc", facialHair: "beard", accent: "oat" }),
  look({ skin: "porcelain", hair: "blonde", hairStyle: "swept", iris: "green", outfit: "teal", build: "slim", garment: "dress", presents: "fem", accessory: "earrings", accent: "brass", footwear: "flat" }),
  look({ skin: "tan", hair: "darkBrown", hairStyle: "bun", iris: "hazel", outfit: "rust", build: "regular", garment: "apron", presents: "fem", accessory: "neckScarf", pattern: "stripe", inner: "cream", accent: "rose" }),
  look({ skin: "deep", hair: "silver", hairStyle: "crop", iris: "coal", outfit: "leaf", build: "broad", garment: "jacket", presents: "masc", headwear: "cap", accessory: "satchel", inner: "oat", accent: "charcoal" }),
  look({ skin: "olive", hair: "brown", hairStyle: "long", iris: "amber", outfit: "plum", build: "regular", garment: "coat", presents: "masc", facialHair: "moustache", inner: "cream" }),
  look({ skin: "light", hair: "silver", hairStyle: "bun", iris: "slate", outfit: "slate", build: "slim", garment: "vest", presents: "andro", accessory: "earrings", inner: "sky", accent: "brass", footwear: "flat" }),
  look({ skin: "umber", hair: "inkTeal", hairStyle: "coils", iris: "hazel", outfit: "denim", build: "regular", garment: "skirt", presents: "fem", accessory: "neckScarf", accent: "ochre", footwear: "flat" }),
  look({ skin: "tan", hair: "black", hairStyle: "swept", iris: "coal", outfit: "clay", build: "broad", garment: "tee", presents: "masc", headwear: "beanie", facialHair: "beard", pattern: "stripe", accent: "charcoal" }),
  look({ skin: "porcelain", hair: "auburn", hairStyle: "crop", iris: "amber", outfit: "leaf", build: "slim", garment: "tank", presents: "fem", accessory: "earrings", accent: "brass", footwear: "flat" }),
  look({ skin: "deep", hair: "blonde", hairStyle: "bun", iris: "hazel", outfit: "teal", build: "regular", garment: "jacket", presents: "andro", accessory: "satchel", inner: "cream", accent: "charcoal" }),
  look({ skin: "olive", hair: "inkTeal", hairStyle: "crop", iris: "slate", outfit: "kraft", build: "regular", garment: "hoodie", presents: "andro", headwear: "beanie", accent: "pine" }),
  look({ skin: "light", hair: "black", hairStyle: "crop", iris: "coal", outfit: "wine", build: "regular", garment: "coat", presents: "fem", accessory: "earrings", pattern: "stripe", inner: "cream", accent: "brass", footwear: "flat" }),
  look({ skin: "porcelain", hair: "darkBrown", hairStyle: "long", iris: "hazel", outfit: "moss", build: "slim", garment: "tee", presents: "masc", facialHair: "stubble", accessory: "satchel", accent: "charcoal" }),
  look({ skin: "deep", hair: "brown", hairStyle: "coils", iris: "amber", outfit: "sand", build: "broad", garment: "dress", presents: "fem", headwear: "headscarf", pattern: "stripe", accent: "rose", footwear: "flat" }),
  look({ skin: "umber", hair: "silver", hairStyle: "swept", iris: "green", outfit: "ink", build: "broad", garment: "apron", presents: "andro", facialHair: "stubble", inner: "oat", accent: "ochre" }),
  look({ skin: "tan", hair: "auburn", hairStyle: "long", iris: "green", outfit: "clay", build: "regular", garment: "hoodie", presents: "fem", accessory: "neckScarf", accent: "sky", footwear: "flat" }),
  look({ skin: "olive", hair: "black", hairStyle: "bun", iris: "coal", outfit: "moss", build: "slim", garment: "vest", presents: "masc", headwear: "cap", inner: "cream", accent: "charcoal" }),
  look({ skin: "porcelain", hair: "inkTeal", hairStyle: "coils", iris: "slate", outfit: "plum", build: "slim", garment: "skirt", presents: "andro", accessory: "earrings", accent: "brass", footwear: "flat" }),
  look({ skin: "light", hair: "blonde", hairStyle: "swept", iris: "amber", outfit: "denim", build: "regular", garment: "apron", presents: "masc", facialHair: "beard", inner: "cream", accent: "oat" }),
  look({ skin: "deep", hair: "darkBrown", hairStyle: "long", iris: "hazel", outfit: "slate", build: "broad", garment: "coat", presents: "andro", headwear: "headscarf", accessory: "satchel", inner: "oat", accent: "pine" }),
  look({ skin: "umber", hair: "brown", hairStyle: "crop", iris: "amber", outfit: "sand", build: "regular", garment: "tank", presents: "masc", facialHair: "moustache", accent: "charcoal" }),
  look({ skin: "tan", hair: "silver", hairStyle: "coils", iris: "slate", outfit: "ink", build: "slim", garment: "tee", presents: "andro", headwear: "beanie", accessory: "neckScarf", pattern: "stripe", accent: "sky", footwear: "flat" }),
  look({ skin: "olive", hair: "auburn", hairStyle: "bun", iris: "green", outfit: "wine", build: "broad", garment: "jacket", presents: "fem", accessory: "earrings", inner: "rose", accent: "brass" }),
];

export const CUSTOMER_LOOK_COUNT = CUSTOMER_LOOKS.length;

/**
 * Which of the pool a customer is, from the same identity the ID card is built
 * from. Salted so the look does not track the printed date of birth.
 *
 * This is the *only* place a customer's appearance is chosen. The sprite key and
 * the ID portrait key are both derived from the result, so a door sprite and its
 * photo cannot disagree.
 *
 * Note what this deliberately does *not* do: it does not consult the name for gender.
 * See `generateCustomerName` — the first-name pool is unisex by construction, so
 * there is no gender to read, and inventing one would hard-code a name-to-gender map
 * that is wrong for most of the pool.
 */
export function customerLookIndex(name: string, age: number): number {
  return hashSeed(`look:${name}:${age}`) % CUSTOMER_LOOK_COUNT;
}

function wrap(index: number): number {
  return ((index % CUSTOMER_LOOK_COUNT) + CUSTOMER_LOOK_COUNT) % CUSTOMER_LOOK_COUNT;
}

export function customerLook(index: number): Look {
  const found = CUSTOMER_LOOKS[wrap(index)];
  if (!found) throw new Error("customer look pool is empty");
  return found;
}

/** Standing sprite for a pool index — shop floor, curb, and doorstep. */
export function customerTextureKey(index: number): string {
  return `tex-customer-${wrap(index)}`;
}

/** Head-and-shoulders portrait for the same person, for the ID card photo box. */
export function customerPortraitKey(index: number): string {
  return `tex-face-${wrap(index)}`;
}

/** Every standing customer texture, in pool order — the bake list and the filter set. */
export function customerTextureKeys(): string[] {
  return CUSTOMER_LOOKS.map((_, i) => customerTextureKey(i));
}

export function customerPortraitKeys(): string[] {
  return CUSTOMER_LOOKS.map((_, i) => customerPortraitKey(i));
}

/**
 * The crew wear Kindling colours, so the uniform is fixed and only the person varies:
 * complexion, hair, build, facial hair, small metal. Shirt is supplied by the kit at
 * bake time, which is why this returns a Look without its outfit.
 */
export type CrewFace = Omit<Look, keyof Outfit | "garment" | "legs" | "presents" | "pattern" | "footwear" | "inner" | "accent">;

interface CrewSpec {
  skin: keyof typeof COMPLEXIONS;
  hair: keyof typeof HAIR_COLORS;
  hairStyle: HairStyle;
  iris: keyof typeof IRIS_COLORS;
  build: Build;
  facialHair?: FacialHair;
  accessory?: Accessory;
  headwear?: Headwear;
}

const CREW_FACES: readonly CrewSpec[] = [
  { skin: "light", hair: "black", hairStyle: "crop", iris: "amber", build: "regular", facialHair: "stubble" },
  { skin: "umber", hair: "black", hairStyle: "coils", iris: "coal", build: "broad", facialHair: "beard" },
  { skin: "deep", hair: "darkBrown", hairStyle: "crop", iris: "hazel", build: "regular" },
  { skin: "porcelain", hair: "blonde", hairStyle: "swept", iris: "slate", build: "slim", accessory: "earrings" },
  { skin: "tan", hair: "brown", hairStyle: "bun", iris: "hazel", build: "regular", accessory: "earrings" },
  { skin: "olive", hair: "silver", hairStyle: "swept", iris: "green", build: "broad", facialHair: "moustache" },
  { skin: "light", hair: "auburn", hairStyle: "long", iris: "green", build: "slim", accessory: "earrings" },
  { skin: "umber", hair: "inkTeal", hairStyle: "coils", iris: "amber", build: "regular" },
  { skin: "deep", hair: "silver", hairStyle: "bun", iris: "coal", build: "broad" },
  { skin: "olive", hair: "darkBrown", hairStyle: "long", iris: "amber", build: "regular", facialHair: "stubble" },
];

export const CREW_FACE_COUNT = CREW_FACES.length;

/**
 * The driver and the key lead are cast once per session, so the seated driver and
 * the standing driver are the same person all day.
 */
export function crewFace(seed: number, slot: "driver" | "keylead"): CrewFace {
  const h = hashSeed(`crew:${slot}:${seed}`);
  const pick = CREW_FACES[h % CREW_FACE_COUNT];
  if (!pick) throw new Error("crew face pool is empty");
  return {
    ...COMPLEXIONS[pick.skin],
    ...HAIR_COLORS[pick.hair],
    hairStyle: pick.hairStyle,
    iris: IRIS_COLORS[pick.iris],
    build: pick.build,
    facialHair: pick.facialHair ?? "none",
    accessory: pick.accessory ?? "none",
    // The cap is the uniform; crew never wear their own headwear over it.
    headwear: "none",
  };
}
