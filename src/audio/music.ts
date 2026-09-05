import Phaser from "phaser";
import { skyAt } from "../sim/dayNight";
import {
  clamp01,
  effectiveMusicVolume,
  loadMusicPrefs,
  saveMusicPrefs,
  type MusicPrefs,
} from "./prefs";

export const BGM_KEY = "kindling-bgm";
export const BGM_PATH = "assets/kindling-loop.wav";

type PlayableSound = Phaser.Sound.WebAudioSound | Phaser.Sound.HTML5AudioSound;

let prefs: MusicPrefs = loadMusicPrefs();
let music: PlayableSound | null = null;
let unlockBound = false;
let nightAmount = 0;

export function getMusicPrefs(): MusicPrefs {
  return { ...prefs };
}

export function preloadMusic(scene: Phaser.Scene): void {
  if (!scene.cache.audio.exists(BGM_KEY)) {
    scene.load.audio(BGM_KEY, BGM_PATH);
  }
}

export function unlockAudio(game: Phaser.Game): void {
  game.sound.unlock();
  const ctx = audioContext(game);
  if (ctx && ctx.state === "suspended") void ctx.resume();
}

export function installMusicUnlock(game: Phaser.Game): void {
  if (unlockBound) return;
  unlockBound = true;
  const unlock = (): void => unlockAudio(game);
  game.events.once(Phaser.Core.Events.READY, () => {
    game.canvas?.addEventListener("pointerdown", unlock);
    game.canvas?.addEventListener("touchstart", unlock);
  });
  globalThis.addEventListener("pointerdown", unlock);
  globalThis.addEventListener("keydown", unlock);
  unlockAudio(game);
}

export function startSessionMusic(game: Phaser.Game): void {
  installMusicUnlock(game);
  unlockAudio(game);
  const play = (): void => {
    ensureSound(game);
    applyMusic();
  };
  if (game.sound.locked) {
    game.sound.once(Phaser.Sound.Events.UNLOCKED, play);
  }
  play();
}

export function setMusicEnabled(on: boolean, game?: Phaser.Game): void {
  prefs = { ...prefs, enabled: on };
  saveMusicPrefs(prefs);
  if (game) ensureSound(game);
  applyMusic();
}

export function setMusicVolume(volume: number, game?: Phaser.Game): void {
  prefs = { ...prefs, volume: clamp01(volume) };
  saveMusicPrefs(prefs);
  if (game) ensureSound(game);
  applyMusic();
}

export function syncMusicToClock(gameMs: number): void {
  nightAmount = clamp01(skyAt(gameMs).lampAlpha);
  applyMusic();
}

function ensureSound(game: Phaser.Game): void {
  if (music) return;
  if (!game.cache.audio.exists(BGM_KEY)) return;
  music = game.sound.add(BGM_KEY, { loop: true, volume: 0 }) as PlayableSound;
}

function applyMusic(): void {
  if (!music) return;
  const vol = effectiveMusicVolume(prefs.enabled, prefs.volume, nightAmount);
  music.volume = vol;
  if (prefs.enabled) {
    if (music.isPaused) music.resume();
    else if (!music.isPlaying) music.play();
  } else if (music.isPlaying) {
    music.pause();
  }
}

function audioContext(game: Phaser.Game): AudioContext | undefined {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  return mgr.context;
}
