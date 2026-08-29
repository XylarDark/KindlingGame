import { GAME_END_HOUR, GAME_START_HOUR, MS_PER_GAME_HOUR, SHIFT_MS } from "./constants";

export class GameClock {
  gameMs = 0;

  tick(realDeltaMs: number): void {
    this.gameMs = Math.min(SHIFT_MS, this.gameMs + Math.max(0, realDeltaMs));
  }

  get gameHours(): number {
    return this.gameMs / MS_PER_GAME_HOUR;
  }
}

/** Clock hour in [GAME_START_HOUR, GAME_END_HOUR], including fractions. */
export function clockHour(gameMs: number): number {
  return GAME_START_HOUR + Math.min(Math.max(0, gameMs), SHIFT_MS) / MS_PER_GAME_HOUR;
}

export function formatGameClock(gameMs: number): string {
  const hourFloat = clockHour(gameMs);
  const hour = Math.min(GAME_END_HOUR, Math.floor(hourFloat));
  const minute = hour >= GAME_END_HOUR ? 0 : Math.floor((hourFloat - hour) * 60);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
