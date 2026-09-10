import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("loading gate wiring", () => {
  it("BootScene shows and hides the loading gate around warm-up", () => {
    const src = read("src/scenes/BootScene.ts");
    expect(src).toContain('showLoading({ mode: "boot"');
    expect(src).toContain("hideLoading()");
    expect(src).toContain("warmGpu");
    expect(src).toContain("WARM_BOOT_TIMEOUT_MS");
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

  it("loadingGate module exports show/hide with boot and update copy", () => {
    const src = read("src/ui/loadingGate.ts");
    expect(src).toContain("Loading Kindling");
    expect(src).toContain("Updating");
    expect(src).toContain("export function showLoading");
    expect(src).toContain("export function hideLoading");
    expect(src).toContain('aria-busy');
  });
});
