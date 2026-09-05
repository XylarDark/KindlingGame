import { describe, expect, it } from "vitest";
import {
  DEFAULT_MUSIC_VOLUME,
  MUSIC_ON_KEY,
  MUSIC_VOL_KEY,
  clampVolume,
  defaultMusicPrefs,
  effectiveMusicVolume,
  loadMusicPrefs,
  saveMusicPrefs,
} from "./prefs";

function memoryStore(init: Record<string, string> = {}): Storage {
  const data = { ...init };
  return {
    get length() {
      return Object.keys(data).length;
    },
    clear() {
      for (const key of Object.keys(data)) delete data[key];
    },
    getItem(key: string) {
      return key in data ? data[key]! : null;
    },
    key() {
      return null;
    },
    removeItem(key: string) {
      delete data[key];
    },
    setItem(key: string, value: string) {
      data[key] = value;
    },
  };
}

describe("music prefs", () => {
  it("defaults to music on at a moderate volume", () => {
    expect(defaultMusicPrefs()).toEqual({ enabled: true, volume: DEFAULT_MUSIC_VOLUME });
    expect(loadMusicPrefs(memoryStore())).toEqual(defaultMusicPrefs());
  });

  it("persists on/off and volume through localStorage", () => {
    const store = memoryStore();
    saveMusicPrefs({ enabled: false, volume: 0.7 }, store);
    expect(store.getItem(MUSIC_ON_KEY)).toBe("0");
    expect(store.getItem(MUSIC_VOL_KEY)).toBe("0.7");
    expect(loadMusicPrefs(store)).toEqual({ enabled: false, volume: 0.7 });
  });

  it("clamps volume and ducks at night without going silent when music is on", () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(DEFAULT_MUSIC_VOLUME);
    expect(effectiveMusicVolume(false, 1, 0)).toBe(0);
    const day = effectiveMusicVolume(true, 1, 0);
    const night = effectiveMusicVolume(true, 1, 1);
    expect(day).toBe(1);
    expect(night).toBeGreaterThan(0.5);
    expect(night).toBeLessThan(day);
  });
});
