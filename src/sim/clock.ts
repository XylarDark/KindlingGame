import { GAME_START_HOUR, MS_PER_GAME_HOUR } from "./constants";

export class GameClock {
  gameMs = 0;

  tick(realDeltaMs: number): void {
    this.gameMs += Math.max(0, realDeltaMs);
  }

  get gameHours(): number {
    return this.gameMs / MS_PER_GAME_HOUR;
  }
}

export function formatGameClock(gameMs: number): string {
  const totalMinutes = Math.floor((gameMs / MS_PER_GAME_HOUR) * 60);
  const clockMinutes = GAME_START_HOUR * 60 + totalMinutes;
  const hour = Math.floor(clockMinutes / 60) % 24;
  const minute = clockMinutes % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
