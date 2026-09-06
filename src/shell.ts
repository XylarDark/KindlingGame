import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./sim/constants";
import { notifyViewfit, phaserDisplayScale, readCssSafeArea } from "./ui/viewFit";

/** Phone-sized portrait: shop is 16:9 landscape, so ask them to turn. */
export function isPortraitPhone(
  width: number,
  height: number,
  coarsePointer: boolean,
): boolean {
  if (!coarsePointer) return false;
  return height > width + 24;
}

export function viewportSize(): { width: number; height: number } {
  const view = globalThis.visualViewport;
  return {
    width: Math.round(view?.width ?? globalThis.innerWidth ?? 0),
    height: Math.round(view?.height ?? globalThis.innerHeight ?? 0),
  };
}

export function isStandaloneDisplay(
  matchMedia: ((query: string) => { matches: boolean }) | undefined = globalThis.matchMedia,
  standaloneFlag = false,
): boolean {
  if (matchMedia?.("(display-mode: standalone)")?.matches) return true;
  if (matchMedia?.("(display-mode: fullscreen)")?.matches) return true;
  return standaloneFlag;
}

/** True when the JS Fullscreen API can hide browser chrome (Android/desktop; not iOS Safari). */
export function canRequestFullscreen(
  doc: Pick<Document, "fullscreenEnabled"> & { documentElement?: { requestFullscreen?: unknown } } = document,
): boolean {
  if (doc.fullscreenEnabled === false) return false;
  const el = doc.documentElement as { requestFullscreen?: unknown; webkitRequestFullscreen?: unknown } | undefined;
  return typeof el?.requestFullscreen === "function" || typeof el?.webkitRequestFullscreen === "function";
}

export function tryEnterFullscreen(
  target: {
    requestFullscreen?: (options?: FullscreenOptions) => Promise<void>;
    webkitRequestFullscreen?: () => void;
  } | null | undefined = typeof document !== "undefined" ? document.documentElement : undefined,
): boolean {
  if (!target) return false;
  if (typeof target.requestFullscreen === "function") {
    void target.requestFullscreen().catch(() => undefined);
    return true;
  }
  if (typeof target.webkitRequestFullscreen === "function") {
    try {
      target.webkitRequestFullscreen();
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

/** Whether to show the "install / fullscreen" coach for more screen space. */
export function shouldShowChromeCoach(opts: {
  standalone: boolean;
  fullscreenElement: Element | null;
  dismissed: boolean;
  coarsePointer: boolean;
}): boolean {
  if (opts.standalone || opts.fullscreenElement || opts.dismissed) return false;
  return opts.coarsePointer;
}

export function chromeCoachCopy(canFullscreen: boolean): { title: string; body: string; action: string } {
  if (canFullscreen) {
    return {
      title: "More screen space",
      body: "Tap for fullscreen so Kindling fills the display.",
      action: "Go fullscreen",
    };
  }
  return {
    title: "Install for fullscreen",
    body: "Browsers keep a search bar in a normal tab. Add Kindling to your Home Screen for a chrome-free play.",
    action: "Got it",
  };
}

export function tryLockLandscape(orientation: Pick<ScreenOrientation, "lock"> | null | undefined): boolean {
  if (!orientation || typeof orientation.lock !== "function") return false;
  void orientation.lock("landscape").catch(() => undefined);
  return true;
}

/** Keep Phaser pointer mapping in 1920×1080 after CSS stretches the canvas. */
export function applyCanvasDisplayScale(game: Phaser.Game): void {
  const canvas = game.canvas;
  if (!canvas) return;
  game.scale.updateBounds();
  const w = game.scale.canvasBounds?.width || canvas.clientWidth;
  const h = game.scale.canvasBounds?.height || canvas.clientHeight;
  if (w <= 0 || h <= 0) return;
  const scale = phaserDisplayScale({ width: w, height: h }, GAME_WIDTH, GAME_HEIGHT);
  game.scale.displayScale.set(scale.x, scale.y);
}

/** Keep the canvas in the visual viewport so CSS can stretch 1920×1080 to the whole screen. */
export function installMobileShell(game: Phaser.Game): void {
  const root = document.getElementById("game-root");
  const gate = document.getElementById("rotate-gate");
  if (!root) return;

  const coarse = () => globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;

  const sync = (): void => {
    const { width, height } = viewportSize();
    const view = globalThis.visualViewport;
    root.style.width = `${width}px`;
    root.style.height = `${height}px`;
    root.style.transform = `translate(${Math.round(view?.offsetLeft ?? 0)}px, ${Math.round(view?.offsetTop ?? 0)}px)`;
    if (gate) {
      const portrait = isPortraitPhone(width, height, coarse());
      gate.hidden = !portrait;
      gate.setAttribute("aria-hidden", portrait ? "false" : "true");
    }
    game.scale.refresh();
    applyCanvasDisplayScale(game);
    notifyViewfit(game, { width, height }, readCssSafeArea(root));
  };

  const blockScroll = (event: Event): void => {
    event.preventDefault();
  };

  const blockPinch = (event: TouchEvent): void => {
    if (event.touches.length > 1) event.preventDefault();
  };

  document.addEventListener("touchstart", blockPinch, { passive: false });
  document.addEventListener("touchmove", blockScroll, { passive: false });
  document.addEventListener("gesturestart", blockScroll, { passive: false });
  document.addEventListener("gesturechange", blockScroll, { passive: false });

  globalThis.addEventListener("resize", sync);
  globalThis.addEventListener("scroll", sync, { passive: true });
  globalThis.visualViewport?.addEventListener("resize", sync);
  globalThis.visualViewport?.addEventListener("scroll", sync);
  globalThis.addEventListener("orientationchange", () => {
    globalThis.setTimeout(sync, 50);
    globalThis.setTimeout(sync, 300);
    globalThis.setTimeout(sync, 600);
  });

  const nav = navigator as Navigator & { standalone?: boolean };
  const standalone = () => isStandaloneDisplay(globalThis.matchMedia, nav.standalone === true);
  const tryLandscape = (): void => {
    tryLockLandscape(screen.orientation);
  };
  if (standalone()) {
    tryLandscape();
  }

  const coach = ensureChromeCoach();
  const syncCoach = (): void => {
    const dismissed = globalThis.sessionStorage?.getItem("kindling-chrome-coach") === "1";
    const show = shouldShowChromeCoach({
      standalone: standalone(),
      fullscreenElement: document.fullscreenElement,
      dismissed,
      coarsePointer: coarse(),
    });
    coach.hidden = !show;
    coach.setAttribute("aria-hidden", show ? "false" : "true");
    if (show) {
      const copy = chromeCoachCopy(canRequestFullscreen());
      coach.querySelector("[data-coach-title]")!.textContent = copy.title;
      coach.querySelector("[data-coach-body]")!.textContent = copy.body;
      coach.querySelector("[data-coach-action]")!.textContent = copy.action;
    }
  };

  const onFirstGesture = (): void => {
    tryLandscape();
    if (!standalone() && canRequestFullscreen() && !document.fullscreenElement) {
      tryEnterFullscreen(document.documentElement);
    }
    syncCoach();
  };
  document.addEventListener("pointerdown", onFirstGesture);
  document.addEventListener("fullscreenchange", () => {
    sync();
    syncCoach();
  });

  coach.querySelector("[data-coach-action]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    if (canRequestFullscreen()) {
      tryEnterFullscreen(document.documentElement);
    } else {
      globalThis.sessionStorage?.setItem("kindling-chrome-coach", "1");
    }
    syncCoach();
  });
  coach.querySelector("[data-coach-dismiss]")?.addEventListener("click", (event) => {
    event.stopPropagation();
    globalThis.sessionStorage?.setItem("kindling-chrome-coach", "1");
    syncCoach();
  });

  sync();
  syncCoach();
}

function ensureChromeCoach(): HTMLElement {
  let coach = document.getElementById("chrome-coach");
  if (coach) return coach;
  coach = document.createElement("div");
  coach.id = "chrome-coach";
  coach.hidden = true;
  coach.setAttribute("aria-hidden", "true");
  coach.innerHTML = `
    <div class="chrome-coach__card">
      <strong data-coach-title></strong>
      <p data-coach-body></p>
      <div class="chrome-coach__row">
        <button type="button" data-coach-action></button>
        <button type="button" data-coach-dismiss class="chrome-coach__ghost">Not now</button>
      </div>
    </div>
  `;
  document.body.appendChild(coach);
  return coach;
}
