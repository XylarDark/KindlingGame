import { describe, expect, it, beforeEach } from "vitest";
import {
  PWA_RESUME_UPDATE_MIN_MS,
  serviceWorkerUrl,
  setPwaIdle,
  isPwaIdle,
  tryActivateWaitingWhenIdle,
} from "./pwaUpdate";
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

describe("idle waiting-SW activate", () => {
  beforeEach(() => setPwaIdle(false));

  it("posts skipWaiting and reloads only while idle", () => {
    const posts: unknown[] = [];
    const session = new Map<string, string>();
    const store = {
      getItem: (k: string) => session.get(k) ?? null,
      setItem: (k: string, v: string) => {
        session.set(k, v);
      },
      removeItem: (k: string) => {
        session.delete(k);
      },
    } as Storage;
    let reloads = 0;
    const waiting = { postMessage: (m: unknown) => posts.push(m) };
    const reg = { waiting } as ServiceWorkerRegistration;

    expect(tryActivateWaitingWhenIdle(reg, { idle: false, session: store, reload: () => reloads++ })).toBe(false);
    expect(posts).toEqual([]);
    expect(reloads).toBe(0);

    expect(tryActivateWaitingWhenIdle(reg, { idle: true, session: store, reload: () => reloads++ })).toBe(true);
    expect(posts).toEqual([SKIP_WAITING_MESSAGE]);
    expect(reloads).toBe(1);

    // Guard blocks a second activate before the next boot clears it.
    expect(tryActivateWaitingWhenIdle(reg, { idle: true, session: store, reload: () => reloads++ })).toBe(false);
    expect(reloads).toBe(1);
  });

  it("tracks idle from setPwaIdle", () => {
    setPwaIdle(true);
    expect(isPwaIdle()).toBe(true);
    setPwaIdle(false);
    expect(isPwaIdle()).toBe(false);
  });
});

describe("update wiring", () => {
  it("registers without HTTP-caching the worker script", () => {
    const src = read("src/pwaUpdate.ts");
    expect(src).toContain('updateViaCache: "none"');
    expect(src).toContain("void reg.update()");
    expect(src).toContain("visibilitychange");
  });

  it("skips service-worker registration in DEV so HMR is not on the SW hop", () => {
    const src = read("src/pwaUpdate.ts");
    expect(src).toContain("import.meta.env.DEV");
    expect(src).toContain('return "skipped"');
    expect(src).not.toContain("registered (dev)");
  });

  it("throttles resume update checks to at least ten minutes", () => {
    expect(PWA_RESUME_UPDATE_MIN_MS).toBe(10 * 60 * 1000);
    const src = read("src/pwaUpdate.ts");
    expect(src).toContain("PWA_RESUME_UPDATE_MIN_MS");
    const resumeFrom = src.indexOf("function bindResumeUpdateCheck");
    if (resumeFrom < 0) throw new Error("bindResumeUpdateCheck missing");
    expect(src.slice(resumeFrom)).toContain("PWA_RESUME_UPDATE_MIN_MS");
  });

  it("does not await network update before returning ready", () => {
    const src = read("src/pwaUpdate.ts");
    expect(src).not.toContain("await Promise.race([reg.update()");
    expect(src).toContain("void reg.update()");
  });

  it("activates a waiting worker only via idle path — never on resume alone", () => {
    const src = read("src/pwaUpdate.ts");
    expect(src).toContain("tryActivateWaitingWhenIdle");
    expect(src).toContain("SKIP_WAITING_MESSAGE");
    expect(src).toContain("setPwaIdle");
    const resumeFrom = src.indexOf("function bindResumeUpdateCheck");
    if (resumeFrom < 0) throw new Error("bindResumeUpdateCheck missing");
    const resume = src.slice(resumeFrom, src.indexOf("export function tryActivateWaitingWhenIdle"));
    expect(resume).toContain("reg.update()");
    expect(resume).not.toContain("postMessage(SKIP_WAITING_MESSAGE)");
    expect(resume).not.toContain("location.reload()");
  });

  it("intercepts navigations only — asset GETs must not hit respondWith", () => {
    const sw = read("public/sw.js");
    expect(sw).toContain(`event.data === "${SKIP_WAITING_MESSAGE}"`);
    expect(sw).toContain('cache: "no-store"');
    expect(sw).toContain('req.mode === "navigate"');
    expect(sw).toContain("if (!navigate) return");
    expect(sw).toContain("only while idle");
    const fetchFrom = sw.indexOf('self.addEventListener("fetch"');
    if (fetchFrom < 0) throw new Error("fetch listener missing");
    const fetchBody = sw.slice(fetchFrom);
    expect(fetchBody).not.toMatch(/respondWith\(fetch\(req, init\)/);
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

  it("wires setPwaIdle from title and shift-ended HUD", () => {
    const title = read("src/scenes/TitleScene.ts");
    const hud = read("src/scenes/HudScene.ts");
    expect(title).toContain("setPwaIdle(true)");
    expect(title).toContain("setPwaIdle(false)");
    expect(hud).toContain("setPwaIdle(snap.shiftEnded)");
  });
});
