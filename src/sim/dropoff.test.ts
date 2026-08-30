import { describe, expect, it } from "vitest";
import { ageForSeed, DROPOFF_MIN_AGE, idCardFor } from "./dropoff";

describe("idCardFor", () => {
  it("treats 19 and older as age-ok", () => {
    const card = idCardFor("Ash Park", 19);
    expect(card.ageOk).toBe(true);
    expect(card.age).toBe(19);
    expect(card.name).toBe("Ash Park");
    expect(card.dob).toMatch(/\d+ \w+ \d{4}/);
  });

  it("marks under-19 cards as a deny", () => {
    const card = idCardFor("Ren Voss", 17);
    expect(card.ageOk).toBe(false);
    expect(card.age).toBe(17);
    expect(card.dob).toContain(String(2026 - 17));
  });

  it("is stable for the same name and age", () => {
    expect(idCardFor("Milo Cho", 24)).toEqual(idCardFor("Milo Cho", 24));
  });

  it("seeds some customers under 19 and some 19+", () => {
    const ages = Array.from({ length: 24 }, (_, i) => ageForSeed(`ord-${i}:Patel`));
    expect(ages.some((age) => age < DROPOFF_MIN_AGE)).toBe(true);
    expect(ages.some((age) => age >= DROPOFF_MIN_AGE)).toBe(true);
    expect(ageForSeed("ord-3:Patel")).toBe(ageForSeed("ord-3:Patel"));
  });
});
