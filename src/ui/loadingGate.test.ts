import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("loading gate wiring", () => {
  it("BootScene shows and hides the loading gate around warm-up", () => {
    const src = read("src/scenes/BootScene.ts");
    expect(src).toContain("showBootStage");
    expect(src).toContain("hideLoading()");
    expect(src).toContain("flushTextures");
    expect(src).toContain("warmAndSleepScene");
    expect(src).toContain("WARM_BOOT_TIMEOUT_MS");
  });

  it("BootScene aborts warm on wall clock and never re-shows after abort", () => {
    const src = read("src/scenes/BootScene.ts");
    expect(src).toContain("warmAborted");
    expect(src).toContain("globalThis.setTimeout");
    expect(src).toContain("if (this.warmAborted) return");
    expect(src).toContain("showBootStage");
    // Overall cap must not rely only on Phaser game-time delayedCall.
    const bootReady = src.slice(src.indexOf("private async bootReady"));
    const raceBlock = bootReady.slice(0, bootReady.indexOf("private async runBootWarm"));
    expect(raceBlock).not.toContain("this.time.delayedCall(WARM_BOOT_TIMEOUT_MS");
    expect(raceBlock).toContain("globalThis.setTimeout");
  });

  it("BootScene pre-warms drive and door under the loading gate then sleeps them", () => {
    const src = read("src/scenes/BootScene.ts");
    expect(src).toContain('this.showBootStage("Map")');
    expect(src).toContain('this.showBootStage("Door")');
    expect(src).toContain('warmAndSleepScene("drive")');
    expect(src).toContain('warmAndSleepScene("door")');
    expect(src).toContain("this.scene.sleep(key)");
    expect(src).toContain("sceneWarmTimeout");
    expect(src).toContain("warmShopPostFx");
  });

  it("loading gate captures pointers while visible", () => {
    const html = read("index.html");
    const gateCss = html.slice(html.indexOf("#loading-gate {"), html.indexOf("#loading-gate[hidden]"));
    expect(gateCss).toContain("pointer-events: auto");
    expect(gateCss).toContain("touch-action: none");
    expect(gateCss).not.toContain("pointer-events: none");
    const src = read("src/ui/loadingGate.ts");
    expect(src).toContain("bindInputBlock");
    expect(src).toContain("swallowPointer");
    expect(src).toContain("preventDefault");
  });

  it("ShopScene pre-allocates a capped customer visual pool instead of mid-walk create", () => {
    const src = read("src/scenes/ShopScene.ts");
    expect(src).toContain("warmCustomerPool");
    expect(src).toContain("acquireCustomerVisual");
    expect(src).toContain("releaseCustomerVisual");
    expect(src).toContain("CUSTOMER_VISUAL_POOL");
    expect(src).toContain("CUSTOMER_VISUAL_MAX");
  });

  it("DoorScene dirty-guards houseLabel setText and fitTypeToWidth", () => {
    const src = read("src/scenes/DoorScene.ts");
    expect(src).toContain("lastHouseTitle");
    expect(src).toContain("if (title !== this.lastHouseTitle)");
    expect(src).toContain("fitTypeToWidth(this.houseLabel, 1200)");
  });

  it("idle activate shows Updating before skipWaiting + reload", () => {
    const src = read("src/pwaUpdate.ts");
    const activateFrom = src.indexOf("export function tryActivateWaitingWhenIdle");
    if (activateFrom < 0) throw new Error("tryActivateWaitingWhenIdle missing");
    const body = src.slice(activateFrom);
    const showAt = body.indexOf('showLoading({ mode: "update" })');
    const postAt = body.indexOf("reg.waiting.postMessage(SKIP_WAITING_MESSAGE)");
    const reloadCallAt = body.indexOf("reload();");
    // Prefer the call site after postMessage (opts.reload default also contains "reload").
    const reloadAfterPost = body.indexOf("reload();", postAt);
    if (showAt < 0) throw new Error("showLoading update missing in idle activate");
    if (postAt < 0) throw new Error("postMessage missing in idle activate");
    if (reloadAfterPost < 0) throw new Error("reload() call missing after postMessage");
    expect(showAt).toBeLessThan(postAt);
    expect(postAt).toBeLessThan(reloadAfterPost);
    expect(reloadCallAt).toBeGreaterThanOrEqual(0);
  });

  it("index.html defines #loading-gate under rotate-gate z-index", () => {
    const html = read("index.html");
    expect(html).toContain("#loading-gate");
    expect(html).toContain("z-index: 35");
    expect(html).toContain('id="loading-gate"');
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-live="polite"');
  });

  it("main shows loading gate before Phaser boots (PWA cold-open gap)", () => {
    const src = read("src/main.ts");
    const showAt = src.indexOf("showLoading({ mode: \"boot\"");
    const gameAt = src.indexOf("new Phaser.Game(config)");
    expect(showAt).toBeGreaterThan(-1);
    expect(gameAt).toBeGreaterThan(showAt);
  });

  it("loadingGate module exports show/hide with boot and update copy", () => {
    const src = read("src/ui/loadingGate.ts");
    expect(src).toContain("Loading Kindling");
    expect(src).toContain("Updating");
    expect(src).toContain("export function showLoading");
    expect(src).toContain("export function hideLoading");
    expect(src).toContain('aria-busy');
  });

  it("BootScene compiles DayNight on mid budget and Title can finish degraded warm under gate", () => {
    const boot = read("src/scenes/BootScene.ts");
    expect(boot).toContain("keepAttached");
    expect(boot).toContain("setBootWarmPending");
    const title = read("src/scenes/TitleScene.ts");
    expect(title).toContain("finishDeferredWarm");
    expect(title).toContain("hideLoading()");
  });

});
