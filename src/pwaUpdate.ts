import { SKIP_WAITING_MESSAGE } from "./pwaMessages";

export const PWA_UPDATE_WAIT_MS = 4000;

export function serviceWorkerUrl(baseUrl: string): string {
  const base = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
  return `${base}sw.js`;
}

/** A waiting worker is an update only when an older worker already controls this page. */
export function shouldActivateWaitingWorker(waiting: boolean, hasController: boolean): boolean {
  return waiting && hasController;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function debug(message: string, data?: Record<string, unknown>): void {
  console.debug(`pwa: ${message}`, data ?? {});
}

function activateWaiting(worker: ServiceWorker): void {
  worker.postMessage(SKIP_WAITING_MESSAGE);
}

/**
 * Register the installability worker. Activates a *already-waiting* update before
 * the game starts (previous visit downloaded it). Does not await network update or
 * activate mid-shift — that would blank-boot for seconds or reload under the player.
 */
export async function bootKindlingPwa(): Promise<"ready" | "reloading" | "skipped"> {
  if (!("serviceWorker" in navigator)) {
    debug("no serviceWorker API");
    return "skipped";
  }

  const url = serviceWorkerUrl(import.meta.env.BASE_URL);
  if (import.meta.env.DEV) {
    void navigator.serviceWorker.register(url, { updateViaCache: "none" }).then(
      (reg) => debug("registered (dev)", { scope: reg.scope }),
      (err: unknown) => debug("register failed (dev)", { err: String(err) }),
    );
    return "ready";
  }

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;
  const onControllerChange = (): void => {
    if (!hadController || reloading) return;
    reloading = true;
    debug("controllerchange, reloading for new deploy");
    location.reload();
  };
  navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

  try {
    const reg = await navigator.serviceWorker.register(url, { updateViaCache: "none" });
    debug("registered", { scope: reg.scope, hadController, waiting: Boolean(reg.waiting) });

    if (shouldActivateWaitingWorker(Boolean(reg.waiting), hadController) && reg.waiting) {
      debug("activating waiting worker before game start");
      activateWaiting(reg.waiting);
      await sleep(800);
      if (reloading) return "reloading";
      // controllerchange may still be in flight — do not start the old build.
      return "reloading";
    }

    // Download updates in the background for the *next* cold open. Never skipWaiting
    // here or on resume — that would reload mid-shift.
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

/** Foreground: fetch a newer worker script only. Activation waits for the next cold boot. */
function bindResumeUpdateCheck(reg: ServiceWorkerRegistration): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void reg.update().then(
      () => debug("resume update finished", { waiting: Boolean(reg.waiting) }),
      (err: unknown) => debug("resume update failed", { err: String(err) }),
    );
  });
}
