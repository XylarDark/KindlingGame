import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, beforeEach } from "vitest";
import {
  isSceneWarm,
  markSceneWarm,
  resetSceneWarmFlags,
  sceneWarmTimeout,
  WARM_DOOR_TIMEOUT_MS,
  WARM_DRIVE_TIMEOUT_MS,
} from "./sceneWarm";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("sceneWarm flags", () => {
  beforeEach(() => resetSceneWarmFlags());

  it("tracks drive and door warm completion independently", () => {
    expect(isSceneWarm("drive")).toBe(false);
    markSceneWarm("drive");
    expect(isSceneWarm("drive")).toBe(true);
    expect(isSceneWarm("door")).toBe(false);
    markSceneWarm("door");
    expect(isSceneWarm("door")).toBe(true);
  });

  it("gives drive a longer warm budget than door", () => {
    expect(WARM_DRIVE_TIMEOUT_MS).toBeGreaterThan(WARM_DOOR_TIMEOUT_MS);
    expect(sceneWarmTimeout("drive")).toBe(WARM_DRIVE_TIMEOUT_MS);
    expect(sceneWarmTimeout("door")).toBe(WARM_DOOR_TIMEOUT_MS);
  });
});

describe("boot warm wiring guards", () => {
  it("does not Promise.race scene warm paths that can orphan the loading gate", () => {
    const boot = read("src/scenes/BootScene.ts");
    const warmSleep = boot.slice(boot.indexOf("private async warmAndSleepScene"), boot.indexOf("private async waitFrames"));
    expect(warmSleep).not.toContain("Promise.race");
    expect(boot).toContain("warmShopPostFx");
    expect(boot).toContain("sceneWarmTimeout");
  });

  it("Title begin awaits deferred warm before resume", () => {
    const title = read("src/scenes/TitleScene.ts");
    expect(title).toContain("deferredWarm");
    expect(title).toContain("await this.deferredWarm");
  });
});
