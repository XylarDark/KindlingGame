import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  INSTALL_COACH_DISMISS_TTL_MS,
  INSTALL_COACH_DISMISSED_KEY,
  clearInstallCoachDismissed,
  clearLegacyInstallCoachLocalDismiss,
  detectInstallPlatform,
  dismissInstallCoach,
  getDeferredInstallPrompt,
  installCoachCopy,
  isInstallCoachAudience,
  isInstallCoachDismissed,
  noteDeferredInstallPrompt,
  planInstallPrimaryAction,
  shouldDismissAfterInstallChoice,
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

describe("install coach session dismiss", () => {
  it("persists a dismiss timestamp in the provided store and expires after the TTL", () => {
    const store = memoryStore();
    const now = 1_700_000_000_000;
    expect(isInstallCoachDismissed(store, now)).toBe(false);
    dismissInstallCoach(store, now);
    expect(store.getItem(INSTALL_COACH_DISMISSED_KEY)).toBe(String(now));
    expect(isInstallCoachDismissed(store, now + 1000)).toBe(true);
    expect(isInstallCoachDismissed(store, now + INSTALL_COACH_DISMISS_TTL_MS)).toBe(false);
    clearInstallCoachDismissed(store);
    expect(isInstallCoachDismissed(store, now)).toBe(false);
  });

  it("clears legacy pre-timestamp dismiss flag so the coach can auto-show again", () => {
    const store = memoryStore({ [INSTALL_COACH_DISMISSED_KEY]: "1" });
    expect(isInstallCoachDismissed(store)).toBe(false);
    expect(store.getItem(INSTALL_COACH_DISMISSED_KEY)).toBeNull();
  });

  it("clears legacy localStorage dismiss without touching session dismiss", () => {
    const local = memoryStore({ [INSTALL_COACH_DISMISSED_KEY]: String(Date.now()) });
    const session = memoryStore({ [INSTALL_COACH_DISMISSED_KEY]: String(Date.now()) });
    clearLegacyInstallCoachLocalDismiss(local);
    expect(local.getItem(INSTALL_COACH_DISMISSED_KEY)).toBeNull();
    expect(session.getItem(INSTALL_COACH_DISMISSED_KEY)).not.toBeNull();
    expect(isInstallCoachDismissed(session)).toBe(true);
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

  it("skips after session dismiss unless forced from Settings / BIP", () => {
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

  it("auto-shows on coarse pointers or phone audiences", () => {
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
        audience: true,
      }),
    ).toBe(true);
    expect(
      shouldShowInstallCoach({
        standalone: false,
        dismissed: false,
        coarsePointer: false,
        audience: false,
      }),
    ).toBe(false);
  });
});

describe("isInstallCoachAudience", () => {
  it("treats Android / iOS UA as an install audience without coarse pointer", () => {
    expect(isInstallCoachAudience({ coarsePointer: false, platform: "android" })).toBe(true);
    expect(isInstallCoachAudience({ coarsePointer: false, platform: "ios" })).toBe(true);
    expect(isInstallCoachAudience({ coarsePointer: false, platform: "other", maxTouchPoints: 0 })).toBe(
      false,
    );
    expect(isInstallCoachAudience({ coarsePointer: false, maxTouchPoints: 2, platform: "other" })).toBe(
      true,
    );
  });

  it("treats a deferred install prompt as audience (desktop Chrome BIP)", () => {
    expect(
      isInstallCoachAudience({
        coarsePointer: false,
        platform: "other",
        maxTouchPoints: 0,
        canPrompt: true,
      }),
    ).toBe(true);
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

describe("install primary action plans", () => {
  it("accepted hides — only outcome accepted dismisses the coach", () => {
    expect(shouldDismissAfterInstallChoice("accepted")).toBe(true);
    expect(shouldDismissAfterInstallChoice("dismissed")).toBe(false);
    expect(shouldDismissAfterInstallChoice(undefined)).toBe(false);
  });

  it("dismissed keeps/reprompts — cancel keeps coach and falls back to manual", () => {
    const bip = { prompt: async () => undefined };
    expect(planInstallPrimaryAction({ deferred: bip, primaryLabel: "Install" })).toBe("prompt");
    // After native sheet cancel we clear deferred and refresh to manual instructions.
    expect(planInstallPrimaryAction({ deferred: null, primaryLabel: "Install" })).toBe("manual");
    expect(shouldDismissAfterInstallChoice("dismissed")).toBe(false);
  });

  it("no prompt → manual copy when Install is shown without a deferred BIP", () => {
    expect(planInstallPrimaryAction({ deferred: null, primaryLabel: "Install" })).toBe("manual");
    const copy = installCoachCopy({ platform: "android", canPrompt: false });
    expect(copy.primary).toBe("Got it");
    expect(copy.body).toMatch(/Home Screen|Install app/i);
  });

  it("Got it acknowledges and dismisses when already on manual copy", () => {
    expect(planInstallPrimaryAction({ deferred: null, primaryLabel: "Got it" })).toBe("acknowledge");
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

  it("main starts the game then registers PWA in the background", () => {
    const src = read("../main.ts");
    expect(src).toContain("bootKindlingPwa");
    expect(src).toContain("installInstallCoach");
    expect(src).toContain("void bootKindlingPwa()");
    expect(src).not.toContain("void bootKindlingPwa().then");
    const showAt = src.indexOf("showLoading({ mode: \"boot\"");
    const gameAt = src.indexOf("new Phaser.Game(config)");
    expect(showAt).toBeGreaterThan(-1);
    expect(gameAt).toBeGreaterThan(showAt);
  });

  it("force-presents the coach when beforeinstallprompt arrives", () => {
    const src = read("./installCoach.ts");
    expect(src).toContain('addEventListener("beforeinstallprompt"');
    expect(src).toContain("presentInstallCoach({ force: true })");
  });

  it("dismisses via sessionStorage and clears legacy localStorage on install", () => {
    const src = read("./installCoach.ts");
    expect(src).toContain("sessionStorage");
    expect(src).toContain("clearLegacyInstallCoachLocalDismiss");
    expect(src).toMatch(/defaultSessionStorage/);
  });

  it("calls bip.prompt() synchronously inside the click path (user gesture)", () => {
    const src = read("./installCoach.ts");
    // Must not defer prompt() behind an async helper invoked with void.
    expect(src).not.toMatch(/void\s+runPrimaryAction\s*\(/);
    expect(src).toContain("onPrimaryClick(actionBtn)");
    const fnStart = src.indexOf("function onPrimaryClick");
    expect(fnStart).toBeGreaterThanOrEqual(0);
    const clickPath = src.slice(fnStart, src.indexOf("export function presentInstallCoach"));
    // Sync turn: assign bip.prompt() before entering the async IIFE that awaits.
    const promptAt = clickPath.indexOf("promptSettled = bip.prompt()");
    const asyncIifeAt = clickPath.indexOf("void (async () =>");
    expect(promptAt).toBeGreaterThanOrEqual(0);
    expect(asyncIifeAt).toBeGreaterThan(promptAt);
    expect(clickPath.slice(asyncIifeAt)).toContain("await promptSettled");
    expect(clickPath).toContain("shouldDismissAfterInstallChoice");
    expect(clickPath).toContain("showManualInstallInstructions");
  });

  it("keeps #install-coach above the Phaser canvas", () => {
    const html = read("../../index.html");
    const block = html.slice(html.indexOf("#install-coach {"), html.indexOf("#install-coach[hidden]"));
    expect(block).toMatch(/z-index:\s*10000/);
  });
});
