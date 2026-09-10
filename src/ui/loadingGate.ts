/** HTML overlay for boot warm-up and idle PWA update reload. */

export type LoadingMode = "boot" | "update";

export type ShowLoadingOpts = {
  mode?: LoadingMode;
  /** Optional stage label under the title (Fonts / Art / Shaders). */
  stage?: string;
};

const BOOT_COPY = "Loading Kindling…";
const UPDATE_COPY = "Updating…";

let gateEl: HTMLElement | null = null;
let titleEl: HTMLElement | null = null;
let stageEl: HTMLElement | null = null;

function ensureGate(): HTMLElement | null {
  if (typeof document === "undefined") return null;
  let el = gateEl ?? document.getElementById("loading-gate");
  if (!el) {
    el = document.createElement("div");
    el.id = "loading-gate";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    el.innerHTML =
      `<div class="loading-gate__card">` +
      `<strong class="loading-gate__title" data-loading-title></strong>` +
      `<p class="loading-gate__stage" data-loading-stage hidden></p>` +
      `<div class="loading-gate__pulse" aria-hidden="true"></div>` +
      `</div>`;
    document.body.appendChild(el);
  }
  gateEl = el;
  titleEl = el.querySelector("[data-loading-title]");
  stageEl = el.querySelector("[data-loading-stage]");
  return el;
}

export function showLoading(opts: ShowLoadingOpts = {}): void {
  const el = ensureGate();
  if (!el) return;
  const mode = opts.mode ?? "boot";
  if (titleEl) titleEl.textContent = mode === "update" ? UPDATE_COPY : BOOT_COPY;
  if (stageEl) {
    const stage = opts.stage?.trim() ?? "";
    if (stage) {
      stageEl.textContent = stage;
      stageEl.hidden = false;
    } else {
      stageEl.textContent = "";
      stageEl.hidden = true;
    }
  }
  el.hidden = false;
  el.setAttribute("aria-busy", "true");
  el.setAttribute("aria-hidden", "false");
  el.dataset.mode = mode;
}

export function hideLoading(): void {
  const el = gateEl ?? (typeof document !== "undefined" ? document.getElementById("loading-gate") : null);
  if (!el) return;
  el.hidden = true;
  el.setAttribute("aria-busy", "false");
  el.setAttribute("aria-hidden", "true");
  delete el.dataset.mode;
}

export function isLoadingVisible(): boolean {
  const el = gateEl ?? (typeof document !== "undefined" ? document.getElementById("loading-gate") : null);
  return Boolean(el && !el.hidden);
}
