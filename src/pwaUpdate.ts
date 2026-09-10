/**
 * Register the installability worker without blocking game start.
 * Navigations already use cache: "no-store", so fresh HTML/JS does not need an
 * activate+reload gate on every boot. Waiting workers activate only while idle
 * (title / shift ended) — never mid-shop or mid-drive.
 */
import { SKIP_WAITING_MESSAGE } from "./pwaMessages";

export function serviceWorkerUrl(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}sw.js`;
}

/** Minimum gap between resume-triggered update() calls. */
export const PWA_RESUME_UPDATE_MIN_MS = 10 * 60 * 1000;

const IDLE_RELOAD_GUARD = "kindling-sw-idle-reload";

let pwaIdle = false;
let registration: ServiceWorkerRegistration | null = null;

function debug(message: string, data?: Record<string, unknown>): void {
  console.debug(`pwa: ${message}`, data ?? {});
}

/**
 * Title visible or shift ended — safe to activate a waiting worker + reload once.
 * Mid-shop / mid-drive must stay false.
 */
export function setPwaIdle(idle: boolean): void {
  pwaIdle = idle;
  if (idle) tryActivateWaitingWhenIdle();
}

export function isPwaIdle(): boolean {
  return pwaIdle;
}

/** Register SW in the background; always returns promptly so Phaser can start. */
export async function bootKindlingPwa(): Promise<"ready" | "skipped"> {
  if (!("serviceWorker" in navigator)) {
    debug("no serviceWorker API");
    return "skipped";
  }

  // DEV: Vite HMR / module traffic through a SW makes local play choppy. Prod only.
  if (import.meta.env.DEV) {
    debug("skipped (dev)");
    return "skipped";
  }

  const url = serviceWorkerUrl(import.meta.env.BASE_URL);

  try {
    const reg = await navigator.serviceWorker.register(url, { updateViaCache: "none" });
    registration = reg;
    // Clear one-shot reload guard from a prior idle activate.
    try {
      sessionStorage.removeItem(IDLE_RELOAD_GUARD);
    } catch {
      /* private mode */
    }
    debug("registered", { scope: reg.scope, waiting: Boolean(reg.waiting) });
    void reg.update().then(
      () => {
        debug("background update finished", { waiting: Boolean(reg.waiting) });
        tryActivateWaitingWhenIdle();
      },
      (err: unknown) => debug("background update failed", { err: String(err) }),
    );
    bindResumeUpdateCheck(reg);
    reg.addEventListener("updatefound", () => {
      const installing = reg.installing;
      if (!installing) return;
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed" && reg.waiting) tryActivateWaitingWhenIdle();
      });
    });
    tryActivateWaitingWhenIdle();
  } catch (err) {
    debug("register failed", { err: String(err) });
  }
  return "ready";
}

/** Foreground: fetch a newer worker script only, throttled. Never activate mid-shift. */
function bindResumeUpdateCheck(reg: ServiceWorkerRegistration): void {
  let lastUpdateAt = 0;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    const now = Date.now();
    if (now - lastUpdateAt < PWA_RESUME_UPDATE_MIN_MS) {
      debug("resume update skipped (throttle)");
      return;
    }
    lastUpdateAt = now;
    void reg.update().then(
      () => {
        debug("resume update finished", { waiting: Boolean(reg.waiting) });
        tryActivateWaitingWhenIdle();
      },
      (err: unknown) => debug("resume update failed", { err: String(err) }),
    );
  });
}

/**
 * One-shot: when idle and a worker is waiting, ask it to take over and reload.
 * sessionStorage guards against an activate↔reload loop (cleared on next boot).
 */
export function tryActivateWaitingWhenIdle(
  reg: ServiceWorkerRegistration | null = registration,
  opts: { idle?: boolean; session?: Storage; reload?: () => void } = {},
): boolean {
  const idle = opts.idle ?? pwaIdle;
  const session = opts.session ?? (typeof sessionStorage !== "undefined" ? sessionStorage : undefined);
  const reload = opts.reload ?? (() => globalThis.location.reload());
  if (!idle || !reg?.waiting) return false;
  if (session?.getItem(IDLE_RELOAD_GUARD) === "1") {
    debug("idle activate skipped (reload guard)");
    return false;
  }
  debug("idle activate: skipWaiting + reload");
  session?.setItem(IDLE_RELOAD_GUARD, "1");
  reg.waiting.postMessage(SKIP_WAITING_MESSAGE);
  reload();
  return true;
}
