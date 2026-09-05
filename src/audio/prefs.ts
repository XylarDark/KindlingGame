export type MusicPrefs = {
  enabled: boolean;
  volume: number;
};

export const MUSIC_ON_KEY = "kindling.musicOn";
export const MUSIC_VOL_KEY = "kindling.musicVolume";
export const DEFAULT_MUSIC_VOLUME = 0.45;
export const NIGHT_MUSIC_DUCK = 0.38;

export function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}

export function clampVolume(n: number): number {
  if (!Number.isFinite(n)) return DEFAULT_MUSIC_VOLUME;
  return clamp01(n);
}

export function defaultMusicPrefs(): MusicPrefs {
  return { enabled: false, volume: DEFAULT_MUSIC_VOLUME };
}

export function effectiveMusicVolume(enabled: boolean, volume: number, nightAmount: number): number {
  if (!enabled) return 0;
  return clampVolume(volume) * (1 - NIGHT_MUSIC_DUCK * clamp01(nightAmount));
}

export function loadMusicPrefs(storage: Pick<Storage, "getItem"> | null = globalThis.localStorage): MusicPrefs {
  const prefs = defaultMusicPrefs();
  try {
    const rawOn = storage?.getItem(MUSIC_ON_KEY);
    if (rawOn === "0") prefs.enabled = false;
    if (rawOn === "1") prefs.enabled = true;
    const rawVol = storage?.getItem(MUSIC_VOL_KEY);
    if (rawVol !== null && rawVol !== undefined && rawVol !== "") {
      prefs.volume = clampVolume(Number(rawVol));
    }
  } catch {
    /* quota / private mode */
  }
  return prefs;
}

export function saveMusicPrefs(
  prefs: MusicPrefs,
  storage: Pick<Storage, "setItem"> | null = globalThis.localStorage,
): void {
  try {
    storage?.setItem(MUSIC_ON_KEY, prefs.enabled ? "1" : "0");
    storage?.setItem(MUSIC_VOL_KEY, String(clampVolume(prefs.volume)));
  } catch {
    /* quota / private mode */
  }
}
