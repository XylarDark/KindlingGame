/**
 * Register the installability worker without blocking game start.
 * Navigations already use cache: "no-store", so fresh HTML/JS does not need an
 * activate+reload gate. Never tell a waiting worker to take over here or on
 * resume — that would reload under the player.
 */
export function serviceWorkerUrl(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}sw.js`;
}

/** Minimum gap between resume-triggered update() calls. */
export const PWA_RESUME_UPDATE_MIN_MS = 10 * 60 * 1000;

function debug(message: string, data?: Record<string, unknown>): void {
  console.debug(`pwa: ${message}`, data ?? {});
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
    debug("registered", { scope: reg.scope, waiting: Boolean(reg.waiting) });
    void reg.update().then(
      () => debug("background update finished", { waiting: Boolean(reg.waiting) }),
      (err: unknown) => debug("background update failed", { err: String(err) }),
    );
    bindResumeUpdateCheck(reg);
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
      () => debug("resume update finished", { waiting: Boolean(reg.waiting) }),
      (err: unknown) => debug("resume update failed", { err: String(err) }),
    );
  });
}
