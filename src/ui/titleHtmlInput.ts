/** Let Phaser receive taps while the title overlay is up — HTML shells sit above the canvas. */

let titleOverlayActive = false;

/** TitleScene sets this for the whole welcome / how-to / pause overlay. */
export function setTitleOverlayActive(active: boolean): void {
  titleOverlayActive = active;
  syncTitleHtmlInput();
}

export function isTitleOverlayActive(): boolean {
  return titleOverlayActive;
}

/** Re-apply pointer pass-through from {@link titleOverlayActive} — call after HTML overlays show. */
export function syncTitleHtmlInput(): void {
  setTitleHtmlInputPassThrough(titleOverlayActive);
}

export function setTitleHtmlInputPassThrough(passThrough: boolean): void {
  if (typeof document === "undefined") return;
  const gate = document.getElementById("loading-gate");
  if (gate) {
    if (passThrough || gate.hidden) {
      gate.style.pointerEvents = "none";
    } else {
      gate.style.removeProperty("pointer-events");
    }
  }
  const coach = document.getElementById("install-coach");
  if (coach) {
    coach.style.pointerEvents = "none";
    const card = coach.querySelector(".install-coach__card");
    if (card instanceof HTMLElement) {
      card.style.pointerEvents = passThrough || coach.hidden ? "none" : "auto";
    }
  }
}
