import { describe, expect, it } from "vitest";
import { clockHour, formatGameClock, GameClock } from "./clock";
import { GAME_END_HOUR, GAME_START_HOUR, MS_PER_GAME_HOUR, SHIFT_MS } from "./constants";

describe("GameClock", () => {
  it("maps 1 real second to 1 game minute and 1 real minute to 1 game hour", () => {
    const clock = new GameClock();
    clock.tick(1_000);
    expect(formatGameClock(clock.gameMs)).toBe("09:01");
    clock.tick(MS_PER_GAME_HOUR - 1_000);
    expect(clock.gameHours).toBe(1);
    expect(formatGameClock(clock.gameMs)).toBe("10:00");
  });

  it("formats 09:00 plus elapsed game time", () => {
    expect(formatGameClock(0)).toBe("09:00");
    expect(formatGameClock(MS_PER_GAME_HOUR)).toBe("10:00");
    expect(formatGameClock(MS_PER_GAME_HOUR / 2)).toBe("09:30");
  });

  it("runs from 9am to 11pm and stops", () => {
    expect(clockHour(0)).toBe(GAME_START_HOUR);
    expect(formatGameClock(SHIFT_MS)).toBe("23:00");
    expect(clockHour(SHIFT_MS)).toBe(GAME_END_HOUR);
    const clock = new GameClock();
    clock.tick(SHIFT_MS + 50_000);
    expect(clock.gameMs).toBe(SHIFT_MS);
    expect(formatGameClock(clock.gameMs)).toBe("23:00");
  });
});
