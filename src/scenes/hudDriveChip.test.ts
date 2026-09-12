import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  DRIVE_CHIP_GAP,
  DRIVE_CHIP_PAD_X,
  DRIVE_CHIP_PAD_Y,
  DRIVE_PIN_MAX_W,
  DRIVE_PIN_TEX_H,
  DRIVE_SHOP_CAP_MAX_W,
  DRIVE_VAN_MAX_W,
  DRIVE_VAN_TEX_H,
} from "./driveConstants";

const here = dirname(fileURLToPath(import.meta.url));
const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

describe("drive HUD callout sizing", () => {
  it("anchors chip Y off baked pin and van heights, not oversized guesses", () => {
    expect(DRIVE_PIN_TEX_H).toBe(80);
    expect(DRIVE_VAN_TEX_H).toBe(104);
    expect(DRIVE_CHIP_GAP).toBeGreaterThanOrEqual(12);
  });

  it("caps projected plaque width and uses compact sign pads", () => {
    expect(DRIVE_PIN_MAX_W).toBeGreaterThanOrEqual(160);
    expect(DRIVE_PIN_MAX_W).toBeLessThanOrEqual(240);
    expect(DRIVE_VAN_MAX_W).toBeGreaterThan(DRIVE_PIN_MAX_W);
    expect(DRIVE_SHOP_CAP_MAX_W).toBeGreaterThanOrEqual(180);
    expect(DRIVE_CHIP_PAD_X).toBeLessThan(12);
    expect(DRIVE_CHIP_PAD_Y).toBeLessThan(8);

    const hud = read("HudScene.ts");
    const create = hud.slice(hud.indexOf("create(): void"), hud.indexOf("update(): void"));
    const callouts = hud.slice(hud.indexOf("private paintDriveCallouts"), hud.indexOf("private tutorialFlashHint"));
    expect(callouts).toContain("drivePinLabel.setVisible(false)");
    expect(create).toContain('typeRoleBox(DRIVE_PIN_MAX_W, "hudBody")');
    expect(create).toContain('typeRoleBox(DRIVE_VAN_MAX_W, "hudBody")');
    expect(create).toContain('typeRoleBox(DRIVE_SHOP_CAP_MAX_W, "hudBody")');
    expect(create).toContain("...driveChipSignOpts");
    expect(hud).toContain('padVariant: "compact"');
  });

  it("hides drive descriptive chips — map stays clean; resolver skips drivePin/van/shop", () => {
    const hud = read("HudScene.ts");
    const callouts = hud.slice(hud.indexOf("private paintDriveCallouts"), hud.indexOf("private tutorialFlashHint"));
    expect(callouts).toContain("drivePinLabel.setVisible(false)");
    expect(callouts).toContain("driveVanBanner.setVisible(false)");
    expect(callouts).toContain("driveShopCaption.setVisible(false)");
    expect(callouts).not.toContain("worldToScreen");
    const resolve = hud.slice(hud.indexOf("private resolveHudChips"), hud.indexOf("private syncShopVisibility"));
    expect(resolve).not.toContain('placeDrive("drivePin"');
    expect(resolve).toContain("registerChipObstacle");
  });
});
