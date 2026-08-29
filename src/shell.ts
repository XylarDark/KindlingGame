import type Phaser from "phaser";

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

export function tryLockLandscape(orientation: Pick<ScreenOrientation, "lock"> | null | undefined): boolean {
  if (!orientation || typeof orientation.lock !== "function") return false;
  void orientation.lock("landscape").catch(() => undefined);
  return true;
}

/** Keep the canvas in the visual viewport, clear of browser chrome and the home indicator. */
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
  const tryLandscape = (): void => {
    tryLockLandscape(screen.orientation);
  };
  if (isStandaloneDisplay(globalThis.matchMedia, nav.standalone === true)) {
    tryLandscape();
  }
  document.addEventListener("pointerdown", tryLandscape);

  sync();
}
