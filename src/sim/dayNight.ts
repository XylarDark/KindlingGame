import { clockHour } from "./clock";

export type SkySample = {
  zenith: number;
  haze: number;
  glow: number;
  earth: number;
  roof: number;
  sunAlpha: number;
  sunColor: number;
  sunX: number;
  sunY: number;
  moonAlpha: number;
  moonX: number;
  moonY: number;
  starAlpha: number;
  lampAlpha: number;
  windowGlow: number;
  spillAlpha: number;
  mapGrass: number;
  mapOverlay: number;
  mapOverlayAlpha: number;
};

type Key = { h: number; c: Omit<SkySample, "sunX" | "sunY" | "moonX" | "moonY"> };

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpRgb(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255;
  const ag = (a >> 8) & 255;
  const ab = a & 255;
  const br = (b >> 16) & 255;
  const bg = (b >> 8) & 255;
  const bb = b & 255;
  const r = Math.round(lerp(ar, br, t));
  const g = Math.round(lerp(ag, bg, t));
  const bl = Math.round(lerp(ab, bb, t));
  return (r << 16) | (g << 8) | bl;
}

const KEYS: Key[] = [
  {
    h: 9,
    c: {
      zenith: 0x6aa8dc,
      haze: 0x9eccec,
      glow: 0xd0e4f0,
      earth: 0x8a7a68,
      roof: 0x5a4a42,
      sunAlpha: 0.95,
      sunColor: 0xfff0b8,
      moonAlpha: 0,
      starAlpha: 0,
      lampAlpha: 0,
      windowGlow: 0.08,
      spillAlpha: 0,
      mapGrass: 0x4a6a3a,
      mapOverlay: 0xfff4d0,
      mapOverlayAlpha: 0.06,
    },
  },
  {
    h: 12,
    c: {
      zenith: 0x3a88d0,
      haze: 0x7eb8e8,
      glow: 0xb8d8f0,
      earth: 0x7a6e5a,
      roof: 0x4a3e38,
      sunAlpha: 1,
      sunColor: 0xfff6d0,
      moonAlpha: 0,
      starAlpha: 0,
      lampAlpha: 0,
      windowGlow: 0.05,
      spillAlpha: 0,
      mapGrass: 0x3f6234,
      mapOverlay: 0xfff8e8,
      mapOverlayAlpha: 0.04,
    },
  },
  {
    h: 16,
    c: {
      zenith: 0x4a90c8,
      haze: 0xc8b090,
      glow: 0xe8c8a0,
      earth: 0x8a6a52,
      roof: 0x4a382e,
      sunAlpha: 0.9,
      sunColor: 0xffd080,
      moonAlpha: 0,
      starAlpha: 0,
      lampAlpha: 0,
      windowGlow: 0.12,
      spillAlpha: 0,
      mapGrass: 0x3a5832,
      mapOverlay: 0xf0c070,
      mapOverlayAlpha: 0.1,
    },
  },
  {
    h: 18.5,
    c: {
      zenith: 0x3a3a68,
      haze: 0x8a4a58,
      glow: 0xc86a48,
      earth: 0x7a4a42,
      roof: 0x2a1820,
      sunAlpha: 0.55,
      sunColor: 0xff9040,
      moonAlpha: 0.15,
      starAlpha: 0.2,
      lampAlpha: 0.35,
      windowGlow: 0.45,
      spillAlpha: 0.04,
      mapGrass: 0x2a3828,
      mapOverlay: 0xc46840,
      mapOverlayAlpha: 0.22,
    },
  },
  {
    h: 20.5,
    c: {
      zenith: 0x12182c,
      haze: 0x1e243c,
      glow: 0x32283e,
      earth: 0x6a4450,
      roof: 0x2a1824,
      sunAlpha: 0,
      sunColor: 0xff9040,
      moonAlpha: 0.85,
      starAlpha: 0.7,
      lampAlpha: 0.85,
      windowGlow: 0.8,
      spillAlpha: 0.1,
      mapGrass: 0x1a2420,
      mapOverlay: 0x0c1428,
      mapOverlayAlpha: 0.38,
    },
  },
  {
    h: 23,
    c: {
      zenith: 0x0c101c,
      haze: 0x12182c,
      glow: 0x1a1e32,
      earth: 0x4a3038,
      roof: 0x1a1018,
      sunAlpha: 0,
      sunColor: 0xff9040,
      moonAlpha: 1,
      starAlpha: 1,
      lampAlpha: 1,
      windowGlow: 0.9,
      spillAlpha: 0.12,
      mapGrass: 0x12181c,
      mapOverlay: 0x080e1c,
      mapOverlayAlpha: 0.48,
    },
  },
];

function sunPos(hour: number): { x: number; y: number } {
  const t = Math.max(0, Math.min(1, (hour - 9) / 10.5));
  return {
    x: 0.14 + 0.72 * t,
    y: 0.38 - 0.22 * Math.sin(Math.PI * t),
  };
}

function moonPos(hour: number): { x: number; y: number } {
  const t = Math.max(0, Math.min(1, (hour - 18) / 5));
  return {
    x: 0.22 + 0.55 * t,
    y: 0.16 + 0.08 * Math.sin(Math.PI * t),
  };
}

export function skyAt(gameMs: number): SkySample {
  const hour = clockHour(gameMs);
  let i = 0;
  while (i < KEYS.length - 1 && hour > KEYS[i + 1]!.h) i += 1;
  const a = KEYS[i]!;
  const b = KEYS[Math.min(i + 1, KEYS.length - 1)]!;
  const span = Math.max(0.001, b.h - a.h);
  const t = hour <= a.h ? 0 : Math.min(1, (hour - a.h) / span);
  const sun = sunPos(hour);
  const moon = moonPos(hour);
  return {
    zenith: lerpRgb(a.c.zenith, b.c.zenith, t),
    haze: lerpRgb(a.c.haze, b.c.haze, t),
    glow: lerpRgb(a.c.glow, b.c.glow, t),
    earth: lerpRgb(a.c.earth, b.c.earth, t),
    roof: lerpRgb(a.c.roof, b.c.roof, t),
    sunAlpha: lerp(a.c.sunAlpha, b.c.sunAlpha, t),
    sunColor: lerpRgb(a.c.sunColor, b.c.sunColor, t),
    sunX: sun.x,
    sunY: sun.y,
    moonAlpha: lerp(a.c.moonAlpha, b.c.moonAlpha, t),
    moonX: moon.x,
    moonY: moon.y,
    starAlpha: lerp(a.c.starAlpha, b.c.starAlpha, t),
    lampAlpha: lerp(a.c.lampAlpha, b.c.lampAlpha, t),
    windowGlow: lerp(a.c.windowGlow, b.c.windowGlow, t),
    spillAlpha: lerp(a.c.spillAlpha, b.c.spillAlpha, t),
    mapGrass: lerpRgb(a.c.mapGrass, b.c.mapGrass, t),
    mapOverlay: lerpRgb(a.c.mapOverlay, b.c.mapOverlay, t),
    mapOverlayAlpha: lerp(a.c.mapOverlayAlpha, b.c.mapOverlayAlpha, t),
  };
}

export function nightFactor(gameMs: number): number {
  return skyAt(gameMs).moonAlpha;
}
