import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (rel: string): string => readFileSync(new URL(rel, import.meta.url), "utf8").replace(/\r\n/g, "\n");

describe("typeAtlas", () => {
  it("warms three HUD roles — speech stays canvas", () => {
    const atlas = read("./typeAtlas.ts");
    expect(atlas).toContain('["hudTitle", "hudBody", "hudSmall"]');
    expect(atlas).not.toContain('"speech"');
    expect(atlas).toContain("TYPE_ATLAS_CHARS");
  });

  it("phone-only gate skips desktop and stroked ink", () => {
    const atlas = read("./typeAtlas.ts");
    expect(atlas).toMatch(/shouldUseTypeAtlas[\s\S]*isCoarsePointer\(\)/);
    expect(atlas).toMatch(/hasStroke/);
  });

  it("Boot registers atlas after fonts and before art flush", () => {
    const boot = read("../scenes/BootScene.ts");
    const warm = boot.slice(boot.indexOf("private async runBootWarm"), boot.indexOf("showBootStage(\"Art\")") + 40);
    expect(warm.indexOf("waitForFonts")).toBeLessThan(warm.indexOf("registerTypeAtlas"));
    expect(warm.indexOf("registerTypeAtlas")).toBeLessThan(warm.indexOf("showBootStage(\"Art\")"));
  });

  it("typekit routes role tokens through atlas on coarse when ready", () => {
    const typekit = read("./typekit.ts");
    expect(typekit).toContain("shouldUseTypeAtlas");
    expect(typekit).toContain("makeAtlasInk");
    expect(typekit).toContain("finishAtlasType");
  });

  it("perfProbe counts canvas uploads and atlas vs canvas ink", () => {
    const probe = read("./perfProbe.ts");
    expect(probe).toContain("textUploadCount");
    expect(probe).toContain("atlasTextCount");
    expect(probe).toContain("notePerfTextUpload");
  });
});
