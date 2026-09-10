import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import {
  START_IN_FULLSCREEN_KEY,
  defaultDisplayPrefs,
  loadDisplayPrefs,
  maybeEnterFullscreenOnStart,
  requestGameFullscreen,
  saveDisplayPrefs,
} from "./displayPrefs";

function memoryStore(init: Record<string, string> = {}): Storage {
  const data = { ...init };
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
    getItem(key: string) {
      return key in data ? data[key]! : null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      delete data[key];
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

describe("display prefs", () => {
  it("defaults Start in fullscreen to OFF", () => {
    expect(defaultDisplayPrefs()).toEqual({ startInFullscreen: false });
    expect(loadDisplayPrefs(memoryStore())).toEqual(defaultDisplayPrefs());
  });

  it("persists the Start in fullscreen toggle through localStorage", () => {
    const store = memoryStore();
    saveDisplayPrefs({ startInFullscreen: true }, store);
    expect(store.getItem(START_IN_FULLSCREEN_KEY)).toBe("1");
    expect(loadDisplayPrefs(store)).toEqual({ startInFullscreen: true });
    saveDisplayPrefs({ startInFullscreen: false }, store);
    expect(store.getItem(START_IN_FULLSCREEN_KEY)).toBe("0");
    expect(loadDisplayPrefs(store)).toEqual({ startInFullscreen: false });
  });
});

describe("fullscreen on start", () => {
  it("requests fullscreen when the pref is enabled", async () => {
    const request = vi.fn().mockResolvedValue(true);
    maybeEnterFullscreenOnStart({ startInFullscreen: true }, request);
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("skips the request when the pref is off", () => {
    const request = vi.fn().mockResolvedValue(true);
    maybeEnterFullscreenOnStart({ startInFullscreen: false }, request);
    expect(request).not.toHaveBeenCalled();
  });

  it("swallows a denied or failed fullscreen request", async () => {
    const request = vi.fn().mockRejectedValue(new Error("denied"));
    expect(() => maybeEnterFullscreenOnStart({ startInFullscreen: true }, request)).not.toThrow();
    await Promise.resolve();
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("calls documentElement.requestFullscreen and treats rejection as soft failure", async () => {
    const requestFullscreen = vi.fn().mockRejectedValue(new Error("denied"));
    const ok = await requestGameFullscreen({
      fullscreenElement: null,
      documentElement: { requestFullscreen },
    });
    expect(requestFullscreen).toHaveBeenCalledTimes(1);
    expect(ok).toBe(false);
  });

  it("no-ops when already fullscreen or the API is missing", async () => {
    expect(
      await requestGameFullscreen({
        fullscreenElement: {} as Element,
        documentElement: { requestFullscreen: vi.fn() },
      }),
    ).toBe(true);
    expect(
      await requestGameFullscreen({
        fullscreenElement: null,
        documentElement: {},
      }),
    ).toBe(false);
  });
});

describe("title start wiring", () => {
  it("TitleScene calls maybeEnterFullscreenOnStart from begin()", () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../scenes/TitleScene.ts"), "utf8").replace(/\r\n/g, "\n");
    expect(src).toContain('from "../ui/displayPrefs"');
    const beginAt = src.indexOf("private async begin(");
    expect(beginAt).toBeGreaterThan(-1);
    const beginEnd = src.indexOf("\n  private advance", beginAt);
    const begin = src.slice(beginAt, beginEnd > beginAt ? beginEnd : beginAt + 800);
    expect(begin).toContain("maybeEnterFullscreenOnStart()");
    expect(begin.indexOf("maybeEnterFullscreenOnStart()")).toBeLessThan(begin.indexOf("beginPlay()"));
  });
});
