import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INSTALL_COACH_DISMISSED_KEY,
  clearInstallCoachDismissed,
  detectInstallPlatform,
  dismissInstallCoach,
  getDeferredInstallPrompt,
  installCoachCopy,
  isInstallCoachDismissed,
  noteDeferredInstallPrompt,
  shouldShowInstallCoach,
} from "./installCoach";

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

describe("install coach dismiss persistence", () => {
  it("persists dismiss in localStorage under kindling.installCoachDismissed", () => {
    const store = memoryStore();
    expect(isInstallCoachDismissed(store)).toBe(false);
    dismissInstallCoach(store);
    expect(store.getItem(INSTALL_COACH_DISMISSED_KEY)).toBe("1");
    expect(isInstallCoachDismissed(store)).toBe(true);
    clearInstallCoachDismissed(store);
    expect(isInstallCoachDismissed(store)).toBe(false);
  });
});

describe("shouldShowInstallCoach", () => {
  it("skips when already standalone", () => {
    expect(
      shouldShowInstallCoach({
        standalone: true,
        dismissed: false,
        coarsePointer: true,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallCoach({
        standalone: true,
        dismissed: false,
        force: true,
        coarsePointer: true,
      }),
    ).toBe(false);
  });

  it("skips after dismiss unless forced from Settings", () => {
    expect(
      shouldShowInstallCoach({
        standalone: false,
        dismissed: true,
        coarsePointer: true,
      }),
    ).toBe(false);
    expect(
      shouldShowInstallCoach({
        standalone: false,
        dismissed: true,
        force: true,
        coarsePointer: false,
      }),
    ).toBe(true);
  });

  it("auto-shows only on coarse (touch) pointers", () => {
    expect(
      shouldShowInstallCoach({
        standalone: false,
        dismissed: false,
        coarsePointer: true,
      }),
    ).toBe(true);
    expect(
      shouldShowInstallCoach({
        standalone: false,
        dismissed: false,
        coarsePointer: false,
      }),
    ).toBe(false);
  });
});

describe("installCoachCopy", () => {
  it("teaches Share → Add to Home Screen on iOS", () => {
    const copy = installCoachCopy({ platform: "ios", canPrompt: false });
    expect(copy.title).toMatch(/Install for full screen/i);
    expect(copy.body).toMatch(/Share/i);
    expect(copy.body).toMatch(/Add to Home Screen/i);
    expect(copy.primary).toBe("Got it");
  });

  it("offers Install when a deferred beforeinstallprompt is available", () => {
    const copy = installCoachCopy({ platform: "android", canPrompt: true });
    expect(copy.primary).toBe("Install");
    expect(copy.body).toMatch(/browser bar|full-screen/i);
  });

  it("falls back to manual Home Screen steps without a prompt", () => {
    const copy = installCoachCopy({ platform: "android", canPrompt: false });
    expect(copy.primary).toBe("Got it");
    expect(copy.body).toMatch(/Home Screen|Install app/i);
  });
});

describe("detectInstallPlatform", () => {
  it("detects iOS and iPadOS", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", 5, "iPhone")).toBe("ios");
    expect(detectInstallPlatform("Mozilla/5.0", 5, "MacIntel")).toBe("ios");
  });

  it("detects Android vs other", () => {
    expect(detectInstallPlatform("Mozilla/5.0 (Linux; Android 14)", 2, "Linux armv8l")).toBe("android");
    expect(detectInstallPlatform("Mozilla/5.0 (Windows NT 10.0)", 0, "Win32")).toBe("other");
  });
});

describe("deferred install prompt", () => {
  it("stores and clears the beforeinstallprompt handle", () => {
    const prompt = { prompt: async () => undefined };
    noteDeferredInstallPrompt(prompt);
    expect(getDeferredInstallPrompt()).toBe(prompt);
    noteDeferredInstallPrompt(null);
    expect(getDeferredInstallPrompt()).toBeNull();
  });
});

describe("wiring", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel: string): string => readFileSync(join(here, rel), "utf8").replace(/\r\n/g, "\n");

  it("TitleScene presents the install coach on create", () => {
    const src = read("../scenes/TitleScene.ts");
    expect(src).toContain('from "../ui/installCoach"');
    expect(src).toContain("presentInstallCoach(");
  });

  it("HudScene Settings re-opens the install coach", () => {
    const src = read("../scenes/HudScene.ts");
    expect(src).toContain("Install for full screen");
    expect(src).toContain("openInstallCoachFromSettings");
  });

  it("main boots the PWA update check before the game", () => {
    const src = read("../main.ts");
    expect(src).toContain("bootKindlingPwa");
    expect(src).toContain("installInstallCoach");
  });
});
