import type Phaser from "phaser";
import { GAME_HEIGHT, GAME_WIDTH } from "./sim/constants";
import {
  containStage,
  notifyViewfit,
  phaserDisplayScale,
  RAIL_MIN_CSS_PX,
  readCssSafeArea,
} from "./ui/viewFit";

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

/** Keep Phaser pointer mapping in 1920×1080 after CSS sizes the canvas. */
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

function layoutRails(
  leftRail: HTMLElement | null,
  rightRail: HTMLElement | null,
  railLeft: number,
  railRight: number,
  viewH: number,
): void {
  const showLeft = railLeft >= RAIL_MIN_CSS_PX;
  const showRight = railRight >= RAIL_MIN_CSS_PX;
  if (leftRail) {
    leftRail.hidden = !showLeft;
    leftRail.style.width = `${Math.max(0, Math.round(railLeft))}px`;
    leftRail.style.height = `${Math.round(viewH)}px`;
    leftRail.style.top = "0px";
    leftRail.style.left = "0px";
  }
  if (rightRail) {
    rightRail.hidden = !showRight;
    rightRail.style.width = `${Math.max(0, Math.round(railRight))}px`;
    rightRail.style.height = `${Math.round(viewH)}px`;
    rightRail.style.top = "0px";
    rightRail.style.right = "0px";
  }
}

/**
 * Keep a uniform 16:9 playfield in the visual viewport; leftover width becomes
 * Kindling side rails (pillarbox). Letterbox top/bottom when the viewport is taller.
 */
export function installMobileShell(game: Phaser.Game): void {
  const shell = document.getElementById("kindling-shell");
  const root = document.getElementById("game-root");
  const gate = document.getElementById("rotate-gate");
  const leftRail = document.getElementById("rail-left");
  const rightRail = document.getElementById("rail-right");
  if (!root) return;

  const coarse = () => globalThis.matchMedia?.("(pointer: coarse)")?.matches ?? false;

  const sync = (): void => {
    const { width, height } = viewportSize();
    const view = globalThis.visualViewport;
    const ox = Math.round(view?.offsetLeft ?? 0);
    const oy = Math.round(view?.offsetTop ?? 0);
    if (shell) {
      shell.style.width = `${width}px`;
      shell.style.height = `${height}px`;
      shell.style.transform = `translate(${ox}px, ${oy}px)`;
    }

    const packed = containStage({ width, height });
    const sw = Math.round(packed.stage.width);
    const sh = Math.round(packed.stage.height);
    const sl = Math.round(packed.stage.left);
    const st = Math.round(packed.stage.top);
    root.style.width = `${sw}px`;
    root.style.height = `${sh}px`;
    root.style.left = `${sl}px`;
    root.style.top = `${st}px`;
    root.style.transform = "";

    layoutRails(leftRail, rightRail, packed.railLeft, packed.railRight, height);

    if (gate) {
      const portrait = isPortraitPhone(width, height, coarse());
      gate.hidden = !portrait;
      gate.setAttribute("aria-hidden", portrait ? "false" : "true");
    }
    game.scale.refresh();
    applyCanvasDisplayScale(game);
    // Viewfit follows the stage (canvas), not the full phone chrome.
    notifyViewfit(game, { width: sw, height: sh }, readCssSafeArea(shell ?? root));
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
