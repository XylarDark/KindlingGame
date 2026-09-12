import { GameSim } from "./sim/gameSim";
import { GAME_END_HOUR, GAME_START_HOUR, MS_PER_GAME_HOUR, SHIFT_MS } from "./sim/constants";
import { applyCaptureSeed, applyPromoShot, captureQuery, shotQuery } from "./promoShot";

let sim: GameSim | null = null;

/** Production / preview builds. Vite `npm run dev` is not live. */
export function isLiveBuild(): boolean {
  return import.meta.env.PROD;
}

/** Welcome + how-to overlays: off in `npm run dev`, on in a live build. `?howto=1` forces both; `?howto=0` skips both. */
export function shouldShowHowTo(): boolean {
  const forced = howtoQuery();
  if (forced !== null) return forced;
  return isLiveBuild();
}

function howtoQuery(): boolean | null {
  try {
    const q = new URLSearchParams(globalThis.location?.search ?? "").get("howto");
    if (q === "1") return true;
    if (q === "0") return false;
  } catch {
    /* ignore */
  }
  return null;
}

/** `?hour=20.5` starts the shift at that clock hour (clamped to 9–23). */
function hourQuery(): number | null {
  try {
    const raw = new URLSearchParams(globalThis.location?.search ?? "").get("hour");
    if (raw === null || raw === "") return null;
    const n = Number(raw);
    if (!Number.isFinite(n)) return null;
    return Math.min(GAME_END_HOUR, Math.max(GAME_START_HOUR, n));
  } catch {
    return null;
  }
}

export function startSession(seed?: number): GameSim {
  sim = GameSim.create({ seed: seed ?? (Date.now() % 1_000_000), autoSpawn: false });
  const hour = hourQuery();
  if (hour !== null) sim.clock.gameMs = (hour - GAME_START_HOUR) * MS_PER_GAME_HOUR;
  // `?hour=23` must not leave a frozen shop with no results card.
  if (sim.clock.gameMs >= SHIFT_MS) sim.endShift();
  return sim;
}

export function beginPlay(): void {
  const s = getSim();
  if (s.clock.gameMs >= SHIFT_MS || s.snapshot().shiftEnded) {
    if (!s.snapshot().shiftEnded) s.endShift();
    return;
  }
  if (shotQuery()) {
    applyPromoShot(s);
    return;
  }
  if (captureQuery()) {
    applyCaptureSeed(s);
    return;
  }
  s.enableSpawns();
}

export function getSim(): GameSim {
  if (!sim) throw new Error("Game session has not started");
  return sim;
}
