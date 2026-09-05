import { existsSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const BGM_PATH = "assets/kindling-loop.wav";
const wav = join(dirname(fileURLToPath(import.meta.url)), "../../public", BGM_PATH);

describe("kindling loop asset", () => {
  it("ships an original generated loop under public/assets", () => {
    expect(BGM_PATH).toBe("assets/kindling-loop.wav");
    expect(existsSync(wav)).toBe(true);
    expect(statSync(wav).size).toBeGreaterThan(80_000);
    expect(statSync(wav).size).toBeLessThan(800_000);
  });
});
