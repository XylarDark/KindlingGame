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

const KEY_OF = (look: (typeof CUSTOMER_LOOKS)[number]): string =>
  [look.skin, look.hair, look.hairStyle, look.shirt, look.iris].join("/");

describe("customer appearance pool", () => {
  it("offers a pool worth varying", () => {
    expect(CUSTOMER_LOOK_COUNT).toBeGreaterThanOrEqual(10);
    expect(CUSTOMER_LOOKS).toHaveLength(CUSTOMER_LOOK_COUNT);
  });

  it("makes every variant distinct", () => {
    const seen = new Set(CUSTOMER_LOOKS.map(KEY_OF));
    expect(seen.size).toBe(CUSTOMER_LOOK_COUNT);
  });

  it("spreads complexions across the pool rather than recolouring one face", () => {
    const skins = new Set(CUSTOMER_LOOKS.map((l) => l.skin));
    expect(skins.size).toBe(Object.keys(COMPLEXIONS).length);
    // No complexion may dominate: 12 looks over 6 tones, so 3 is already generous.
    for (const skin of skins) {
      expect(CUSTOMER_LOOKS.filter((l) => l.skin === skin).length).toBeLessThanOrEqual(3);
    }
  });

  it("uses every silhouette, so two variants never differ by colour alone", () => {
    const styles = new Set(CUSTOMER_LOOKS.map((l) => l.hairStyle));
    expect([...styles].sort()).toEqual(["bun", "coils", "crop", "long", "swept"]);
  });

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
});
