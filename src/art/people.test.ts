import { describe, expect, it } from "vitest";
import {
  COMPLEXIONS,
  CREW_FACE_COUNT,
  CUSTOMER_LOOKS,
  CUSTOMER_LOOK_COUNT,
  crewFace,
  customerLook,
  customerLookIndex,
  customerPortraitKey,
  customerPortraitKeys,
  customerTextureKey,
  customerTextureKeys,
} from "./people";
import { generateCustomerName } from "../sim/names";
import { ageForSeed, idCardFor } from "../sim/dropoff";

type PoolLook = (typeof CUSTOMER_LOOKS)[number];

const KEY_OF = (look: PoolLook): string =>
  [look.skin, look.hair, look.hairStyle, look.shirt, look.iris].join("/");

/**
 * Everything about a look that survives being drawn in one flat colour. Two variants
 * sharing this read as the same person in different light, which is the failure the
 * colour-only distinctness check could not see.
 */
const SHAPE_OF = (look: PoolLook): string =>
  [look.build, look.garment, look.legs, look.hairStyle, look.headwear, look.facialHair].join("/");

describe("customer appearance pool", () => {
  it("offers a pool worth varying", () => {
    expect(CUSTOMER_LOOK_COUNT).toBe(24);
    expect(CUSTOMER_LOOKS).toHaveLength(CUSTOMER_LOOK_COUNT);
  });

  it("makes every variant distinct", () => {
    const seen = new Set(CUSTOMER_LOOKS.map(KEY_OF));
    expect(seen.size).toBe(CUSTOMER_LOOK_COUNT);
  });

  it("makes every variant distinct in silhouette, not only in colour", () => {
    // The point of the pass: no two people may share a body and a wardrobe and be
    // told apart only by what colour their shirt was dyed.
    const shapes = CUSTOMER_LOOKS.map(SHAPE_OF);
    expect(new Set(shapes).size).toBe(CUSTOMER_LOOK_COUNT);
  });

  it("spreads complexions across the pool rather than recolouring one face", () => {
    const skins = new Set(CUSTOMER_LOOKS.map((l) => l.skin));
    expect(skins.size).toBe(Object.keys(COMPLEXIONS).length);
    // 24 looks over 6 tones: an even four each, so no complexion may dominate.
    for (const skin of skins) {
      expect(CUSTOMER_LOOKS.filter((l) => l.skin === skin).length).toBeLessThanOrEqual(4);
    }
  });

  it("uses every silhouette, so two variants never differ by colour alone", () => {
    const styles = new Set(CUSTOMER_LOOKS.map((l) => l.hairStyle));
    expect([...styles].sort()).toEqual(["bun", "coils", "crop", "long", "swept"]);
  });

  it("puts the whole wardrobe on the floor", () => {
    const garments = new Set(CUSTOMER_LOOKS.map((l) => l.garment));
    expect([...garments].sort()).toEqual([
      "apron",
      "coat",
      "dress",
      "hoodie",
      "jacket",
      "skirt",
      "tank",
      "tee",
      "vest",
    ]);
    // Nothing may be the uniform of the crowd.
    for (const garment of garments) {
      expect(CUSTOMER_LOOKS.filter((l) => l.garment === garment).length).toBeLessThanOrEqual(5);
    }
  });

  it("varies build, headwear, accessories and fabric as well as clothes", () => {
    expect(new Set(CUSTOMER_LOOKS.map((l) => l.build)).size).toBe(3);
    expect(new Set(CUSTOMER_LOOKS.map((l) => l.headwear)).size).toBe(4);
    expect(new Set(CUSTOMER_LOOKS.map((l) => l.facialHair)).size).toBe(4);
    expect(new Set(CUSTOMER_LOOKS.map((l) => l.accessory)).size).toBe(4);
    expect(new Set(CUSTOMER_LOOKS.map((l) => l.pattern)).size).toBe(2);
    expect(new Set(CUSTOMER_LOOKS.map((l) => l.footwear)).size).toBe(2);
  });

  it("drops the trousers where the garment has a hem", () => {
    for (const look of CUSTOMER_LOOKS) {
      const hemmed = look.garment === "dress" || look.garment === "skirt";
      expect(look.legs).toBe(hemmed ? "bare" : "trousers");
    }
  });
});

describe("gender presentation", () => {
  const of = (p: PoolLook["presents"]): PoolLook[] => CUSTOMER_LOOKS.filter((l) => l.presents === p);

  it("casts all three presentations, none of them a token", () => {
    for (const presents of ["masc", "fem", "andro"] as const) {
      expect(of(presents).length).toBeGreaterThanOrEqual(CUSTOMER_LOOK_COUNT / 6);
    }
  });

  it("does not let hair length carry the signal", () => {
    // The stereotype this pass exists to avoid: long hair meaning woman. Both the
    // long styles and the cropped ones have to appear on more than one presentation.
    const longHaired = CUSTOMER_LOOKS.filter((l) => l.hairStyle === "long");
    const shortHaired = CUSTOMER_LOOKS.filter((l) => l.hairStyle === "crop");
    expect(new Set(longHaired.map((l) => l.presents)).size).toBeGreaterThan(1);
    expect(new Set(shortHaired.map((l) => l.presents)).size).toBeGreaterThan(1);
    expect(longHaired.some((l) => l.presents === "masc")).toBe(true);
    expect(shortHaired.some((l) => l.presents === "fem")).toBe(true);
  });

  it("does not let facial hair carry it either", () => {
    const bearded = CUSTOMER_LOOKS.filter((l) => l.facialHair !== "none");
    // Present on some masculine looks, absent on others, and not exclusive to them.
    expect(of("masc").some((l) => l.facialHair !== "none")).toBe(true);
    expect(of("masc").some((l) => l.facialHair === "none")).toBe(true);
    expect(bearded.some((l) => l.presents !== "masc")).toBe(true);
  });

  it("does not dress a presentation in one costume", () => {
    for (const presents of ["masc", "fem", "andro"] as const) {
      const group = of(presents);
      expect(new Set(group.map((l) => l.garment)).size).toBeGreaterThanOrEqual(3);
      expect(new Set(group.map((l) => l.hairStyle)).size).toBeGreaterThanOrEqual(3);
      expect(new Set(group.map((l) => l.build)).size).toBeGreaterThanOrEqual(2);
    }
  });

  it("gives feminine looks trousers as often as hems", () => {
    const fem = of("fem");
    expect(fem.filter((l) => l.legs === "trousers").length).toBeGreaterThan(fem.length / 2);
  });
});

describe("appearance pool legibility and cost", () => {
  it("keeps a readable gap between hair and skin", () => {
    const luma = (c: number): number =>
      (0.299 * ((c >> 16) & 0xff) + 0.587 * ((c >> 8) & 0xff) + 0.114 * (c & 0xff)) / 255;
    for (const look of CUSTOMER_LOOKS) {
      const gap = Math.max(
        Math.abs(luma(look.skin) - luma(look.hair)),
        Math.abs(luma(look.skin) - luma(look.hairLite)),
      );
      expect(gap).toBeGreaterThan(0.08);
    }
  });

  it("gives every variant its own texture and portrait key", () => {
    expect(new Set(customerTextureKeys()).size).toBe(CUSTOMER_LOOK_COUNT);
    expect(new Set(customerPortraitKeys()).size).toBe(CUSTOMER_LOOK_COUNT);
    // Standing sprite and portrait must never collide in the texture manager.
    const all = new Set([...customerTextureKeys(), ...customerPortraitKeys()]);
    expect(all.size).toBe(CUSTOMER_LOOK_COUNT * 2);
  });

  it("costs a known number of textures at boot", () => {
    // Two bakes per look, plus the three crew sprites. Stated rather than derived so
    // growing the pool is a decision someone makes on purpose: at 8px cells these are
    // 270KB standing and 184KB per portrait, so 48 customer textures is ~11MB.
    expect(customerTextureKeys().length + customerPortraitKeys().length).toBe(48);
  });
});

describe("customerLookIndex", () => {
  it("stays inside the pool for generated identities", () => {
    for (let seed = 0; seed < 200; seed++) {
      const name = generateCustomerName(seed);
      const age = ageForSeed(`ord-${seed}:${name}`);
      const index = customerLookIndex(name, age);
      expect(Number.isInteger(index)).toBe(true);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(index).toBeLessThan(CUSTOMER_LOOK_COUNT);
    }
  });

  it("is stable across repeated derivation", () => {
    expect(customerLookIndex("Nico Diaz", 24)).toBe(customerLookIndex("Nico Diaz", 24));
    expect(customerLook(customerLookIndex("Nico Diaz", 24))).toBe(
      customerLook(customerLookIndex("Nico Diaz", 24)),
    );
  });

  it("resolves a customer's sprite and their ID photo to the same variant", () => {
    for (let seed = 0; seed < 120; seed++) {
      const name = generateCustomerName(seed);
      const age = ageForSeed(`ord-${seed}:${name}`);
      const card = idCardFor(name, age);
      // The card is the only identity the HUD has; deriving from it must land on
      // exactly the look the door sprite is showing.
      const fromCard = customerLookIndex(card.name, card.age);
      const fromOrder = customerLookIndex(name, age);
      expect(fromCard).toBe(fromOrder);
      expect(customerPortraitKey(fromCard)).toBe(customerPortraitKey(fromOrder));
      expect(customerTextureKey(fromCard).replace("customer", "face")).toBe(
        customerPortraitKey(fromOrder),
      );
    }
  });

  it("actually spreads customers over the pool", () => {
    const hits = new Set<number>();
    for (let seed = 0; seed < 400; seed++) {
      const name = generateCustomerName(seed);
      hits.add(customerLookIndex(name, ageForSeed(`ord-${seed}:${name}`)));
    }
    expect(hits.size).toBe(CUSTOMER_LOOK_COUNT);
  });

  it("does not tie a first name to one gender presentation", () => {
    // The pool of given names is unisex by construction, so appearance is decoupled
    // from it on purpose. This is the assertion that keeps the decoupling honest: if
    // a name only ever produced one presentation, a player would start reading the
    // name as a promise about the portrait — and the first mismatch would look broken.
    const byFirstName = new Map<string, Set<string>>();
    for (let seed = 0; seed < 600; seed++) {
      const name = generateCustomerName(seed);
      const first = name.split(" ")[0] ?? name;
      const age = ageForSeed(`ord-${seed}:${name}`);
      const presents = customerLook(customerLookIndex(name, age)).presents;
      (byFirstName.get(first) ?? byFirstName.set(first, new Set()).get(first)!).add(presents);
    }
    expect(byFirstName.size).toBeGreaterThan(6);
    for (const [first, seen] of byFirstName) {
      expect(seen.size, `${first} only ever presents as ${[...seen]}`).toBeGreaterThan(1);
    }
  });

  it("does not track the date printed on the card", () => {
    // Same person, so same look; the DOB day comes off a different hash.
    const days = new Set<string>();
    const looks = new Set<number>();
    for (let age = 19; age < 40; age++) {
      days.add(idCardFor("Ivy Park", age).dob);
      looks.add(customerLookIndex("Ivy Park", age));
    }
    expect(days.size).toBeGreaterThan(5);
    expect(looks.size).toBeGreaterThan(1);
  });

  it("tolerates an out-of-range index instead of returning undefined", () => {
    expect(customerLook(CUSTOMER_LOOK_COUNT)).toBe(CUSTOMER_LOOKS[0]);
    expect(customerLook(-1)).toBe(CUSTOMER_LOOKS[CUSTOMER_LOOK_COUNT - 1]);
  });
});

describe("crew casting", () => {
  it("casts the driver once per seed", () => {
    expect(crewFace(7, "driver")).toEqual(crewFace(7, "driver"));
  });

  it("casts the driver and the key lead independently", () => {
    const differ = Array.from({ length: 40 }, (_, s) => s).some(
      (s) => crewFace(s, "driver").skin !== crewFace(s, "keylead").skin,
    );
    expect(differ).toBe(true);
  });

  it("draws crew faces from a pool, not a fixed face", () => {
    const skins = new Set(Array.from({ length: 200 }, (_, s) => crewFace(s, "driver").skin));
    expect(skins.size).toBeGreaterThan(1);
    expect(CREW_FACE_COUNT).toBeGreaterThanOrEqual(4);
  });

  it("varies the crew's build and face, not just their colouring", () => {
    const cast = Array.from({ length: 200 }, (_, s) => crewFace(s, "driver"));
    expect(new Set(cast.map((c) => c.build)).size).toBe(3);
    expect(new Set(cast.map((c) => c.hairStyle)).size).toBeGreaterThanOrEqual(4);
    expect(new Set(cast.map((c) => c.facialHair)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(cast.map((c) => c.accessory)).size).toBeGreaterThanOrEqual(2);
  });

  it("never puts a customer's headwear under the Kindling cap", () => {
    for (let s = 0; s < 60; s++) {
      expect(crewFace(s, "driver").headwear).toBe("none");
      expect(crewFace(s, "keylead").headwear).toBe("none");
    }
  });
});
