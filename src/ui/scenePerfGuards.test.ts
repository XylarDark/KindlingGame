import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("scene perf guards", () => {
  it("Drive skips redundant night glow when PostFX is on", () => {
    const src = read("src/scenes/DriveScene.ts");
    const glow = src.slice(src.indexOf("private paintNightGlow"), src.indexOf("private returnToShop"));
    expect(glow).toContain("if (getRenderBudget().postFx) return");
  });

  it("Drive and Door skip PRE_RENDER / paint when inactive", () => {
    const drive = read("src/scenes/DriveScene.ts");
    const door = read("src/scenes/DoorScene.ts");
    expect(drive).toContain("if (!this.sys.isActive()) return");
    expect(door).toContain("onPreRenderDayNight");
    expect(door).toContain("if (!this.sys.isActive()) return");
    const doorSync = door.slice(door.indexOf("private sync(snap"), door.indexOf("private paintDoorDayNight"));
    expect(doorSync).not.toContain("applyDayNight");
  });

  it("Hud sets render stress context for drive and door", () => {
    const hud = read("src/scenes/HudScene.ts");
    expect(hud).toContain("syncRenderStress");
    expect(hud).toContain('setRenderStressContext("drive")');
    expect(hud).toContain('setRenderStressContext("door")');
  });

  it("driveGrade avoids full lamp sort", () => {
    const grade = read("src/art/dayNightGrade.ts");
    const drive = grade.slice(grade.indexOf("export function driveGrade"), grade.indexOf("export function doorGrade"));
    expect(drive).toContain("nearestLamps");
    expect(drive).not.toContain(".sort(");
  });
});
