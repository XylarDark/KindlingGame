/** Let Phaser receive taps while the title overlay is up — HTML shells sit above the canvas. */

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
