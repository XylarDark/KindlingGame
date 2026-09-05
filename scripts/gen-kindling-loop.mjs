/**
 * Original Kindling ambient loop — warm dusk pad + pentatonic bells.
 * Writes public/assets/kindling-loop.wav (PCM 22.05 kHz mono 16-bit).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 22_050;
const DURATION = 8;
const FADE = Math.floor(SAMPLE_RATE * 0.18);
const N = SAMPLE_RATE * DURATION;
const TWO_PI = Math.PI * 2;

function midi(n) {
  return 440 * 2 ** ((n - 69) / 12);
}

function frac(x) {
  return x - Math.floor(x);
}

function sine(t, f, phase = 0) {
  return Math.sin(TWO_PI * f * t + phase);
}

function tri(t, f) {
  const p = frac(t * f);
  return 1 - 4 * Math.abs(p - 0.5);
}

function softNoise(i) {
  const x = Math.sin(i * 12.9898) * 43758.5453;
  return (x - Math.floor(x)) * 2 - 1;
}

function env(t, a, d, s, r, dur) {
  if (t < a) return t / Math.max(0.001, a);
  if (t < a + d) return 1 - (1 - s) * ((t - a) / Math.max(0.001, d));
  if (t > dur - r) return s * Math.max(0, (dur - t) / Math.max(0.001, r));
  return s;
}

function tanh(x) {
  const e = Math.exp(2 * Math.min(8, Math.max(-8, x)));
  return (e - 1) / (e + 1);
}

const total = N + FADE;
const raw = new Float64Array(total);

for (let i = 0; i < total; i++) {
  const t = i / SAMPLE_RATE;
  const bar = frac(t / 4);

  const drone =
    0.16 * sine(t, midi(38), 0.2) +
    0.11 * sine(t, midi(45), 1.1) +
    0.07 * tri(t, midi(50) * 0.5);

  const padA = 0.09 * sine(t, midi(62), 0.4) + 0.07 * sine(t, midi(65), 0.9) + 0.05 * sine(t, midi(69), 0.15);
  const padB = 0.09 * sine(t, midi(60), 0.2) + 0.07 * sine(t, midi(64), 0.6) + 0.05 * sine(t, midi(67), 1.4);
  const pad = (bar < 0.5 ? padA : padB) * (0.72 + 0.28 * sine(t, 0.125));

  const motif = [62, 69, 65, 64, 62, 60, 57, 62];
  const noteDur = 1;
  const ni = Math.floor(t / noteDur) % motif.length;
  const nt = t - Math.floor(t / noteDur) * noteDur;
  const bell = 0.11 * sine(t, midi(motif[ni]), 0.3) * env(nt, 0.02, 0.18, 0.22, 0.45, noteDur);
  const sparkle = 0.035 * sine(t, midi(motif[ni] + 12), 1.7) * env(nt, 0.01, 0.08, 0.05, 0.3, noteDur);

  const wind = 0.035 * softNoise(i) * (0.45 + 0.55 * sine(t, 0.07, 2.2));
  const pulse = 0.028 * Math.max(0, sine(t, 1, -Math.PI / 2)) ** 8 * sine(t, midi(38));

  raw[i] = tanh((drone + pad + bell + sparkle + wind + pulse) * 1.35);
}

const out = new Float64Array(N);
for (let i = 0; i < N; i++) out[i] = raw[i];
for (let i = 0; i < FADE; i++) {
  const t = i / FADE;
  const a = Math.sin((t * Math.PI) / 2);
  const b = Math.cos((t * Math.PI) / 2);
  out[i] = out[i] * a + raw[N + i] * b;
}

const bytes = Buffer.alloc(44 + N * 2);
bytes.write("RIFF", 0);
bytes.writeUInt32LE(36 + N * 2, 4);
bytes.write("WAVE", 8);
bytes.write("fmt ", 12);
bytes.writeUInt32LE(16, 16);
bytes.writeUInt16LE(1, 20);
bytes.writeUInt16LE(1, 22);
bytes.writeUInt32LE(SAMPLE_RATE, 24);
bytes.writeUInt32LE(SAMPLE_RATE * 2, 28);
bytes.writeUInt16LE(2, 32);
bytes.writeUInt16LE(16, 34);
bytes.write("data", 36);
bytes.writeUInt32LE(N * 2, 40);

for (let i = 0; i < N; i++) {
  const s = Math.max(-1, Math.min(1, out[i]));
  bytes.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
}

const dest = join(dirname(fileURLToPath(import.meta.url)), "../public/assets/kindling-loop.wav");
mkdirSync(dirname(dest), { recursive: true });
writeFileSync(dest, bytes);
console.log(`wrote ${dest} (${bytes.length} bytes)`);
