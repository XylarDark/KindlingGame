import Phaser from "phaser";

export type SfxKind = "pack" | "sell" | "deny" | "ticket" | "wrong";

function audioCtx(game: Phaser.Game): AudioContext | undefined {
  const mgr = game.sound as Phaser.Sound.WebAudioSoundManager;
  const ctx = mgr?.context as AudioContext | undefined;
  if (!ctx) return undefined;
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function blip(
  ctx: AudioContext,
  opts: { freq: number; endFreq?: number; dur?: number; gain?: number; type?: OscillatorType },
): void {
  const now = ctx.currentTime;
  const dur = opts.dur ?? 0.08;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(opts.gain ?? 0.22, now + 0.01);
  master.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  master.connect(ctx.destination);
  const osc = ctx.createOscillator();
  osc.type = opts.type ?? "sine";
  osc.frequency.setValueAtTime(opts.freq, now);
  if (opts.endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(opts.endFreq, now + dur * 0.85);
  osc.connect(master);
  osc.start(now);
  osc.stop(now + dur + 0.02);
}

/** Short shutter click for the delivery photo. */
export function playCameraClick(game: Phaser.Game): void {
  const ctx = audioCtx(game);
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = ctx.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(0.35, now + 0.008);
  master.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  master.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(980, now);
  osc.frequency.exponentialRampToValueAtTime(220, now + 0.06);
  osc.connect(master);
  osc.start(now);
  osc.stop(now + 0.1);

  const noiseDur = 0.05;
  const buffer = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * noiseDur)), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = ctx.createBufferSource();
  noise.buffer = buffer;
  const noiseGain = ctx.createGain();
  noiseGain.gain.setValueAtTime(0.22, now);
  noiseGain.gain.exponentialRampToValueAtTime(0.0001, now + noiseDur);
  noise.connect(noiseGain);
  noiseGain.connect(ctx.destination);
  noise.start(now);
  noise.stop(now + noiseDur);
}

/** Soft UI blips for pack / sell / deny / ticket / wrong-TV. */
export function playUiSfx(game: Phaser.Game, kind: SfxKind): void {
  const ctx = audioCtx(game);
  if (!ctx) return;
  switch (kind) {
    case "pack":
      blip(ctx, { freq: 420, endFreq: 620, dur: 0.09, gain: 0.18, type: "triangle" });
      break;
    case "sell":
      blip(ctx, { freq: 520, endFreq: 880, dur: 0.11, gain: 0.2, type: "sine" });
      break;
    case "deny":
      blip(ctx, { freq: 280, endFreq: 140, dur: 0.14, gain: 0.2, type: "square" });
      break;
    case "ticket":
      blip(ctx, { freq: 660, endFreq: 740, dur: 0.06, gain: 0.14, type: "sine" });
      break;
    case "wrong":
      blip(ctx, { freq: 220, endFreq: 160, dur: 0.1, gain: 0.16, type: "triangle" });
      break;
  }
}
