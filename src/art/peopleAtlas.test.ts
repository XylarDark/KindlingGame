import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  PEOPLE_PORTRAIT_ATLAS_KEY,
  PEOPLE_STANDING_ATLAS_FRAMES,
  PEOPLE_STANDING_ATLAS_KEY,
  PEOPLE_PORTRAIT_ATLAS_FRAMES,
} from "./peopleAtlas";

const src = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "peopleAtlas.ts"), "utf8");

describe("peopleAtlas", () => {
  it("packs standing customer and crew keys into one atlas key", () => {
    expect(PEOPLE_STANDING_ATLAS_KEY).toBe("atlas-people-standing");
    expect(PEOPLE_STANDING_ATLAS_FRAMES).toContain("tex-customer-0");
    expect(PEOPLE_STANDING_ATLAS_FRAMES).toContain("tex-driver");
    expect(PEOPLE_STANDING_ATLAS_FRAMES).toContain("tex-keylead");
    expect(src).toContain("saveTexture");
    expect(src).toContain("saved.add");
    expect(src).toContain("renderTexture");
    expect(src).toContain("destroyPackedSources");
    expect(src).toContain("peopleAtlas: build failed");
  });

  it("packs portrait keys into a separate faces atlas", () => {
    expect(PEOPLE_PORTRAIT_ATLAS_KEY).toBe("atlas-people-faces");
    expect(PEOPLE_PORTRAIT_ATLAS_FRAMES).toContain("tex-face-0");
    expect(PEOPLE_PORTRAIT_ATLAS_FRAMES).toHaveLength(24);
  });
});
