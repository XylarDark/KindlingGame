import { isStandaloneDisplay } from "../shell";

/** sessionStorage key — dismiss for this tab/session only ("Not now"). */
export const INSTALL_COACH_DISMISSED_KEY = "kindling.installCoachDismissed";

/**
 * Within-session TTL for a dismiss timestamp. Cross-visit bans are impossible
 * because dismiss lives in sessionStorage (cleared when the tab closes).
 * Legacy localStorage values are cleared on boot — see
 * {@link clearLegacyInstallCoachLocalDismiss}.
 */
export const INSTALL_COACH_DISMISS_TTL_MS = 7 * 24 * 60 * 60 * 1000;

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
  /** Settings / BIP: show even after dismiss. */
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

/**
 * Phones that should see the install coach. Prefer pointer media queries, then
 * touch points, then UA — some Android Chrome builds report a fine primary pointer.
 * Callers may also treat a deferred install prompt (`canPrompt`) as audience.
 */
export function isInstallCoachAudience(opts: {
  coarsePointer?: boolean;
  anyCoarsePointer?: boolean;
  maxTouchPoints?: number;
  platform?: InstallPlatform;
  canPrompt?: boolean;
} = {}): boolean {
  if (opts.canPrompt) return true;
  if (opts.coarsePointer) return true;
  if (opts.anyCoarsePointer) return true;
  if ((opts.maxTouchPoints ?? 0) > 1) return true;
  const platform = opts.platform ?? detectInstallPlatform();
  return platform === "ios" || platform === "android";
}

/**
 * True while dismiss is still within the TTL (sessionStorage by default).
 * Legacy `"1"` (pre-timestamp) is treated as expired so older builds recover.
 */
export function isInstallCoachDismissed(
  storage: StorageLike = defaultSessionStorage(),
  nowMs = Date.now(),
): boolean {
  try {
    const raw = storage?.getItem(INSTALL_COACH_DISMISSED_KEY);
    if (raw == null || raw === "") return false;
    if (raw === "1") {
      storage?.removeItem(INSTALL_COACH_DISMISSED_KEY);
      return false;
    }
    const at = Number(raw);
    if (!Number.isFinite(at)) return false;
    return nowMs - at < INSTALL_COACH_DISMISS_TTL_MS;
  } catch {
    return false;
  }
}

export function dismissInstallCoach(
  storage: StorageLike = defaultSessionStorage(),
  nowMs = Date.now(),
): void {
  try {
    storage?.setItem(INSTALL_COACH_DISMISSED_KEY, String(nowMs));
  } catch {
    /* quota / private mode */
  }
}

export function clearInstallCoachDismissed(storage: StorageLike = defaultSessionStorage()): void {
  try {
    storage?.removeItem(INSTALL_COACH_DISMISSED_KEY);
  } catch {
    /* quota / private mode */
  }
}

/**
 * Remove the old localStorage dismiss key so a prior 7-day ban cannot suppress
 * the coach after PWA uninstall (same origin keeps localStorage).
 */
export function clearLegacyInstallCoachLocalDismiss(
  local: StorageLike = defaultLocalStorage(),
): void {
  try {
    local?.removeItem(INSTALL_COACH_DISMISSED_KEY);
  } catch {
    /* quota / private mode */
  }
}

/**
 * Auto-show on title for touch / phone browsers that are not installed.
 * Settings and beforeinstallprompt can force (BIP must not be swallowed after dismiss).
 */
export function shouldShowInstallCoach(opts: {
  standalone: boolean;
  dismissed: boolean;
  force?: boolean;
  coarsePointer: boolean;
  audience?: boolean;
}): boolean {
  if (opts.standalone) return false;
  if (opts.force) return true;
  if (opts.dismissed) return false;
  return opts.audience ?? opts.coarsePointer;
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

function defaultSessionStorage(): StorageLike {
  try {
    return globalThis.sessionStorage ?? null;
  } catch {
    return null;
  }
}

function defaultLocalStorage(): StorageLike {
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

function readAnyCoarse(): boolean {
  return globalThis.matchMedia?.("(any-pointer: coarse)")?.matches ?? false;
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

/**
 * Decide what the primary button should do. Exported for tests.
 * - deferred BIP → native prompt (caller must invoke prompt() synchronously)
 * - label still "Install" but no deferred event → show manual Home Screen steps
 * - otherwise ("Got it") → acknowledge / dismiss
 */
export function planInstallPrimaryAction(opts: {
  deferred: BeforeInstallPromptLike | null;
  primaryLabel: string;
}): "prompt" | "manual" | "acknowledge" {
  if (opts.deferred) return "prompt";
  if (opts.primaryLabel.trim() === "Install") return "manual";
  return "acknowledge";
}

/** Hide/dismiss the coach only after the user accepts the native install sheet. */
export function shouldDismissAfterInstallChoice(outcome: string | undefined): boolean {
  return outcome === "accepted";
}

function applyCoachCopy(platform: InstallPlatform, canPrompt: boolean): void {
  const el = ensureCoachDom();
  const copy = installCoachCopy({ platform, canPrompt });
  el.querySelector("[data-coach-title]")!.textContent = copy.title;
  el.querySelector("[data-coach-body]")!.textContent = copy.body;
  el.querySelector("[data-coach-action]")!.textContent = copy.primary;
  const dismissBtn = el.querySelector("[data-coach-dismiss]");
  if (dismissBtn) dismissBtn.textContent = copy.secondary;
}

/** Keep the coach visible with browser-menu / Add to Home Screen steps. */
function showManualInstallInstructions(): void {
  deferredPrompt = null;
  const platform = detectInstallPlatform();
  applyCoachCopy(platform, false);
  const el = ensureCoachDom();
  el.hidden = false;
  el.setAttribute("aria-hidden", "false");
}

/**
 * Primary click path. When a deferred BIP exists, `prompt()` must run in the
 * same synchronous turn as the user gesture (Chrome requirement).
 */
function onPrimaryClick(actionBtn: Element): void {
  const primaryLabel = actionBtn.textContent ?? "";
  const bip = deferredPrompt;
  const plan = planInstallPrimaryAction({ deferred: bip, primaryLabel });

  if (plan === "acknowledge") {
    dismissInstallCoach();
    hideCoach();
    return;
  }

  if (plan === "manual" || !bip) {
    showManualInstallInstructions();
    return;
  }

  // Synchronous prompt() — do not await before calling (user-gesture requirement).
  let promptSettled: Promise<void>;
  try {
    promptSettled = bip.prompt();
  } catch (err) {
    console.debug("[install-coach] prompt() threw", err);
    showManualInstallInstructions();
    return;
  }
  deferredPrompt = null;

  void (async () => {
    try {
      await promptSettled;
      const choice = bip.userChoice ? await bip.userChoice : undefined;
      if (shouldDismissAfterInstallChoice(choice?.outcome)) {
        dismissInstallCoach();
        hideCoach();
        return;
      }
      showManualInstallInstructions();
    } catch (err) {
      console.debug("[install-coach] install prompt/userChoice failed", err);
      showManualInstallInstructions();
    }
  })();
}

/**
 * Wire DOM + beforeinstallprompt once. Safe to call repeatedly.
 * Does not auto-present — TitleScene / Settings call {@link presentInstallCoach}.
 * When BIP arrives later, force-present so Install is not lost after an early dismiss.
 * Clears legacy localStorage dismiss so uninstall → revisit can show the coach again.
 */
export function installInstallCoach(): void {
  if (typeof document === "undefined") return;
  clearLegacyInstallCoachLocalDismiss();
  if (installed) return;
  installed = true;
  ensureCoachDom();

  globalThis.addEventListener("beforeinstallprompt", ((event: Event) => {
    const bip = event as unknown as BeforeInstallPromptLike;
    bip.preventDefault?.();
    noteDeferredInstallPrompt(bip);
    // Chrome may fire BIP only after ~30s engagement — after the title coach was
    // dismissed. Force so preventDefault does not silently kill installability.
    presentInstallCoach({ force: true });
  }) as EventListener);

  const el = ensureCoachDom();
  el.querySelector("[data-coach-action]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    const actionBtn = event.currentTarget as Element;
    onPrimaryClick(actionBtn);
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
  const platform = opts.platform ?? detectInstallPlatform();
  const canPrompt = opts.canPrompt ?? deferredPrompt !== null;
  const audience = isInstallCoachAudience({
    coarsePointer,
    anyCoarsePointer: readAnyCoarse(),
    maxTouchPoints: typeof navigator !== "undefined" ? navigator.maxTouchPoints : 0,
    platform,
    canPrompt,
  });
  const show = shouldShowInstallCoach({
    standalone,
    dismissed,
    force: opts.force === true,
    coarsePointer,
    audience,
  });

  const el = ensureCoachDom();
  if (!show) {
    hideCoach();
    return false;
  }

  applyCoachCopy(platform, canPrompt);

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
