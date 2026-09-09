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
 * Register the installability worker, check for a new deploy, and reload once if
 * this page was already controlled by an older worker. Times out so a hung Pages
 * fetch cannot block boot. Dev registers without waiting so HMR stays snappy.
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
    debug("registered", { scope: reg.scope, hadController });
    await Promise.race([reg.update(), sleep(PWA_UPDATE_WAIT_MS)]);
    const installing = reg.installing;
    if (installing && installing.state !== "installed" && installing.state !== "redundant") {
      await Promise.race([
        new Promise<void>((resolve) => {
          installing.addEventListener("statechange", () => {
            if (installing.state === "installed" || installing.state === "redundant") resolve();
          });
        }),
        sleep(PWA_UPDATE_WAIT_MS),
      ]);
    }
    if (shouldActivateWaitingWorker(Boolean(reg.waiting), hadController) && reg.waiting) {
      debug("activating waiting worker");
      activateWaiting(reg.waiting);
      await sleep(800);
      if (reloading) return "reloading";
    }
    bindResumeUpdateCheck(reg);
  } catch (err) {
    debug("register/update failed", { err: String(err) });
  }
  return "ready";
}

/** When the installed app is foregrounded, look again — Android often keeps the process alive. */
function bindResumeUpdateCheck(reg: ServiceWorkerRegistration): void {
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    void (async () => {
      try {
        await Promise.race([reg.update(), sleep(PWA_UPDATE_WAIT_MS)]);
        if (shouldActivateWaitingWorker(Boolean(reg.waiting), Boolean(navigator.serviceWorker.controller)) && reg.waiting) {
          debug("resume found waiting worker");
          activateWaiting(reg.waiting);
        }
      } catch (err) {
        debug("resume update failed", { err: String(err) });
      }
    })();
  });
}
