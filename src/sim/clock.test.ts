import { describe, expect, it } from "vitest";
import { formatGameClock, GameClock } from "./clock";
import { MS_PER_GAME_HOUR } from "./constants";

describe("GameClock", () => {
  it("maps 60 real seconds to 1 game hour", () => {
    const clock = new GameClock();
    clock.tick(MS_PER_GAME_HOUR);
    expect(clock.gameHours).toBe(1);
    expect(clock.gameMs).toBe(MS_PER_GAME_HOUR);
  });

  it("formats 10:00 plus elapsed game time", () => {
    expect(formatGameClock(0)).toBe("10:00");
    expect(formatGameClock(MS_PER_GAME_HOUR)).toBe("11:00");
    expect(formatGameClock(MS_PER_GAME_HOUR / 2)).toBe("10:30");
  });
});
