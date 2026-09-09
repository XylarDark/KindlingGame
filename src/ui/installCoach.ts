import { isStandaloneDisplay } from "../shell";

/** localStorage flag — dismiss survives reloads; Settings can force-show anyway. */
export const INSTALL_COACH_DISMISSED_KEY = "kindling.installCoachDismissed";

export type InstallPlatform = "ios" | "android" | "other";

/** Minimal shape of Chrome's beforeinstallprompt event. */
export type BeforeInstallPromptLike = {
  preventDefault?: () => void;
  prompt: () => Promise<void>;
  userChoice?: Promise<{ outcome: string }>;
};

export type InstallCoachCopy = {
  title: string;
  body: string;
  primary: string;
  secondary: string;
};

export type InstallCoachShowOpts = {
  /** Settings re-open: show even after dismiss. */
  force?: boolean;
  standalone?: boolean;
  dismissed?: boolean;
  coarsePointer?: boolean;
  platform?: InstallPlatform;
  canPrompt?: boolean;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;

let deferredPrompt: BeforeInstallPromptLike | null = null;
let coachEl: HTMLElement | null = null;
let installed = false;

export function detectInstallPlatform(
  ua = typeof navigator !== "undefined" ? navigator.userAgent : "",
  maxTouchPoints = typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
  platform = typeof navigator !== "undefined" ? navigator.platform : "",
): InstallPlatform {
  if (/iPhone|iPad|iPod/i.test(ua)) return "ios";
  // iPadOS 13+ may report as MacIntel with touch.
  if (platform === "MacIntel" && maxTouchPoints > 1) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "other";
}

export function isInstallCoachDismissed(storage: StorageLike = defaultStorage()): boolean {
  try {
    return storage?.getItem(INSTALL_COACH_DISMISSED_KEY) === "1";
  } catch {
    return false;
  }
}

export function dismissInstallCoach(storage: StorageLike = defaultStorage()): void {
  try {
    storage?.setItem(INSTALL_COACH_DISMISSED_KEY, "1");
  } catch {
    /* quota / private mode */
  }
}

export function clearInstallCoachDismissed(storage: StorageLike = defaultStorage()): void {
  try {
    storage?.removeItem(INSTALL_COACH_DISMISSED_KEY);
  } catch {
    /* quota / private mode */
  }
}

/**
 * Auto-show on title for touch browsers that are not installed; Settings can force.
 * Never show when already standalone / display-mode fullscreen.
 */
export function shouldShowInstallCoach(opts: {
  standalone: boolean;
  dismissed: boolean;
  force?: boolean;
  coarsePointer: boolean;
}): boolean {
  if (opts.standalone) return false;
  if (opts.force) return true;
  if (opts.dismissed) return false;
  return opts.coarsePointer;
}

export function installCoachCopy(opts: {
  platform: InstallPlatform;
  canPrompt: boolean;
}): InstallCoachCopy {
  const title = "Install for full screen";
  const secondary = "Not now";
  if (opts.platform === "ios") {
    return {
      title,
      body: "Safari keeps the address bar in a normal tab. Tap Share → Add to Home Screen for a chrome-free Kindling session.",
      primary: "Got it",
      secondary,
    };
  }
  if (opts.canPrompt) {
    return {
      title,
      body: "Install Kindling to play without the browser bar — the reliable way to get a full-screen session on your phone.",
      primary: "Install",
      secondary,
    };
  }
  if (opts.platform === "android") {
    return {
      title,
      body: "Add Kindling to your Home Screen (browser menu → Install app / Add to Home screen) for a chrome-free session. Settings also has Start fullscreen for this tab.",
      primary: "Got it",
      secondary,
    };
  }
  return {
    title,
    body: "Add Kindling to your Home Screen for a chrome-free session. Or turn on Start fullscreen in Settings for this tab.",
    primary: "Got it",
    secondary,
  };
}

export function noteDeferredInstallPrompt(event: BeforeInstallPromptLike | null): void {
  deferredPrompt = event;
}

export function getDeferredInstallPrompt(): BeforeInstallPromptLike | null {
  return deferredPrompt;
}

function defaultStorage(): StorageLike {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
}

function readStandalone(): boolean {
  const nav = typeof navigator !== "undefined" ? (navigator as Navigator & { standalone?: boolean }) : undefined;
  return isStandaloneDisplay(globalThis.matchMedia, nav?.standalone === true);
}

function readCoarse(): boolean {
  return globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;
}

function ensureCoachDom(): HTMLElement {
  if (coachEl && coachEl.isConnected) return coachEl;
  let el = document.getElementById("install-coach");
  if (!el) {
    el = document.createElement("div");
    el.id = "install-coach";
    el.hidden = true;
    el.setAttribute("aria-hidden", "true");
    el.innerHTML = `
      <div class="install-coach__card" role="dialog" aria-labelledby="install-coach-title">
        <strong id="install-coach-title" data-coach-title></strong>
        <p data-coach-body></p>
        <div class="install-coach__row">
          <button type="button" data-coach-action></button>
          <button type="button" data-coach-dismiss class="install-coach__ghost">Not now</button>
        </div>
      </div>
    `;
    document.body.appendChild(el);
  }
  coachEl = el;
  return el;
}

function hideCoach(): void {
  const el = coachEl ?? document.getElementById("install-coach");
  if (!el) return;
  el.hidden = true;
  el.setAttribute("aria-hidden", "true");
}

async function runPrimaryAction(): Promise<void> {
  const prompt = deferredPrompt;
  if (prompt) {
    try {
      await prompt.prompt();
    } catch {
      /* user dismissed / unavailable */
    }
    deferredPrompt = null;
  }
  dismissInstallCoach();
  hideCoach();
}

/**
 * Wire DOM + beforeinstallprompt once. Safe to call repeatedly.
 * Does not auto-present — TitleScene / Settings call {@link presentInstallCoach}.
 */
export function installInstallCoach(): void {
  if (typeof document === "undefined") return;
  if (installed) return;
  installed = true;
  ensureCoachDom();

  globalThis.addEventListener("beforeinstallprompt", ((event: Event) => {
    const bip = event as unknown as BeforeInstallPromptLike;
    bip.preventDefault?.();
    noteDeferredInstallPrompt(bip);
  }) as EventListener);

  const el = ensureCoachDom();
  el.querySelector("[data-coach-action]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    void runPrimaryAction();
  });
  el.querySelector("[data-coach-dismiss]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    dismissInstallCoach();
    hideCoach();
  });
}

/**
 * Show the install coach when policy allows. Returns whether it is visible.
 */
export function presentInstallCoach(opts: InstallCoachShowOpts = {}): boolean {
  if (typeof document === "undefined") return false;
  installInstallCoach();

  const standalone = opts.standalone ?? readStandalone();
  const dismissed = opts.dismissed ?? isInstallCoachDismissed();
  const coarsePointer = opts.coarsePointer ?? readCoarse();
  const show = shouldShowInstallCoach({
    standalone,
    dismissed,
    force: opts.force === true,
    coarsePointer,
  });

  const el = ensureCoachDom();
  if (!show) {
    hideCoach();
    return false;
  }

  const platform = opts.platform ?? detectInstallPlatform();
  const canPrompt = opts.canPrompt ?? deferredPrompt !== null;
  const copy = installCoachCopy({ platform, canPrompt });
  el.querySelector("[data-coach-title]")!.textContent = copy.title;
  el.querySelector("[data-coach-body]")!.textContent = copy.body;
  el.querySelector("[data-coach-action]")!.textContent = copy.primary;
  const dismissBtn = el.querySelector("[data-coach-dismiss]");
  if (dismissBtn) dismissBtn.textContent = copy.secondary;

  el.hidden = false;
  el.setAttribute("aria-hidden", "false");
  return true;
}

/** Settings hook: always attempt to show (unless already standalone). */
export function openInstallCoachFromSettings(): boolean {
  return presentInstallCoach({ force: true });
}

/** Test helper — reset module singletons between cases. */
export function resetInstallCoachForTests(): void {
  deferredPrompt = null;
  installed = false;
  if (coachEl?.parentElement) coachEl.parentElement.removeChild(coachEl);
  coachEl = null;
  const stray = typeof document !== "undefined" ? document.getElementById("install-coach") : null;
  stray?.parentElement?.removeChild(stray);
}
