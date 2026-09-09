import { describe, expect, it } from "vitest";
import { serviceWorkerUrl } from "./pwaUpdate";
import { SKIP_WAITING_MESSAGE } from "./pwaMessages";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n/g, "\n");

describe("serviceWorkerUrl", () => {
  it("joins sw.js onto the Vite base, with or without a trailing slash", () => {
    expect(serviceWorkerUrl("./")).toBe("./sw.js");
    expect(serviceWorkerUrl("/KindlingGame/")).toBe("/KindlingGame/sw.js");
    expect(serviceWorkerUrl("/KindlingGame")).toBe("/KindlingGame/sw.js");
  });
});

describe("update wiring", () => {
  it("registers without HTTP-caching the worker script", () => {
    const src = read("src/pwaUpdate.ts");
    expect(src).toContain('updateViaCache: "none"');
    expect(src).toContain("void reg.update()");
    expect(src).toContain("visibilitychange");
  });

  it("does not await network update before returning ready", () => {
    const src = read("src/pwaUpdate.ts");
    expect(src).not.toContain("await Promise.race([reg.update()");
    expect(src).toContain("void reg.update()");
  });

  it("does not activate a waiting worker on boot or resume", () => {
    const src = read("src/pwaUpdate.ts");
    expect(src).not.toContain("activateWaiting");
    expect(src).not.toContain("skipWaiting");
    expect(src).not.toContain("location.reload()");
    expect(src).not.toContain("SKIP_WAITING_MESSAGE");
    const resumeFrom = src.indexOf("function bindResumeUpdateCheck");
    if (resumeFrom < 0) throw new Error("bindResumeUpdateCheck missing");
    const resume = src.slice(resumeFrom);
    expect(resume).toContain("reg.update()");
  });

  it("keeps the worker handshake string in lockstep with sw.js", () => {
    const sw = read("public/sw.js");
    expect(sw).toContain(`event.data === "${SKIP_WAITING_MESSAGE}"`);
    expect(sw).toContain('cache: "no-store"');
    expect(sw).toContain('req.mode === "navigate"');
  });

  it("does not skipWaiting on install — that would swap the worker mid-shift", () => {
    const sw = read("public/sw.js");
    const installFrom = sw.indexOf('self.addEventListener("install"');
    if (installFrom < 0) throw new Error("install listener missing");
    const installTo = sw.indexOf("self.addEventListener", installFrom + 10);
    if (installTo < 0) throw new Error("listener after install missing");
    expect(sw.slice(installFrom, installTo)).not.toContain("skipWaiting");
    expect(sw).toContain("self.skipWaiting()");
  });

  it("stamps sw.js from the Vite production build so deploys change worker bytes", () => {
    const vite = read("vite.config.ts");
    expect(vite).toContain("kindling-stamp-sw");
    expect(vite).toContain("stampServiceWorkerSource");
    expect(vite).toContain("serviceWorkerBuildId");
  });

  it("starts the game immediately and registers the PWA in the background", () => {
    const main = read("src/main.ts");
    expect(main).toContain("bootKindlingPwa");
    expect(main).toContain("startGame()");
    expect(main).toContain("void bootKindlingPwa()");
    expect(main).not.toContain("void bootKindlingPwa().then");
    expect(main).not.toContain('if (outcome === "reloading") return');
    const startAt = main.indexOf("startGame();");
    const pwaAt = main.indexOf("void bootKindlingPwa()");
    if (startAt < 0 || pwaAt < 0) throw new Error("startGame / bootKindlingPwa missing");
    expect(startAt).toBeLessThan(pwaAt);
  });
});
