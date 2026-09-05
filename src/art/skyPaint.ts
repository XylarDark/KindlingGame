import type { SkySample } from "../sim/dayNight";
import { Color } from "../ui/theme";
import { PX, fill } from "./px";

const MOON_HALO = 0x6a88b0;

export type SkyPaintOpts = {
  showSun?: boolean;
  showMoon?: boolean;
  showStars?: boolean;
  sunRadius?: number;
  moonRadius?: number;
};

/** Shared sky bands + bodies used by the shop window and door/hand-off. */
export function paintSky(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  w: number,
  h: number,
  sky: SkySample,
  opts: SkyPaintOpts = {},
): void {
  const showSun = opts.showSun ?? true;
  const showMoon = opts.showMoon ?? true;
  const showStars = opts.showStars ?? true;
  const sunR = opts.sunRadius ?? Math.max(10, Math.floor(Math.min(w, h) * 0.055));
  const moonR = opts.moonRadius ?? Math.max(6, Math.floor(sunR * 0.55));

  fill(g, x, y, w, Math.floor(h * 0.34), sky.zenith);
  fill(g, x, y + Math.floor(h * 0.28), w, Math.floor(h * 0.18), sky.haze);
  fill(g, x, y + Math.floor(h * 0.44), w, Math.floor(h * 0.18), sky.glow);
  fill(g, x, y + Math.floor(h * 0.6), w, Math.floor(h * 0.16), sky.earth);
  fill(g, x, y + Math.floor(h * 0.74), w, h - Math.floor(h * 0.74), sky.earth);

  if (showStars && sky.starAlpha > 0.04) {
    const stars = [
      [0.08, 0.1],
      [0.22, 0.22],
      [0.4, 0.08],
      [0.62, 0.18],
      [0.82, 0.12],
      [0.3, 0.3],
      [0.51, 0.14],
      [0.73, 0.26],
    ];
    for (const [sx, sy] of stars) {
      fill(g, x + Math.floor(w * sx!), y + Math.floor(h * sy!), PX, PX, Color.cream, sky.starAlpha * 0.7);
    }
  }

  if (showSun && sky.sunAlpha > 0.05) {
    const sunX = x + Math.floor(w * sky.sunX);
    const sunY = y + Math.floor(h * sky.sunY);
    fill(g, sunX - sunR - 8, sunY - sunR - 6, sunR * 2 + 16, sunR * 2 + 12, sky.sunColor, 0.18 * sky.sunAlpha);
    fill(g, sunX - sunR, sunY - sunR, sunR * 2, sunR * 2, sky.sunColor, sky.sunAlpha);
    fill(
      g,
      sunX - Math.floor(sunR * 0.45),
      sunY - Math.floor(sunR * 0.45),
      Math.floor(sunR * 0.9),
      Math.floor(sunR * 0.9),
      0xfff6d8,
      sky.sunAlpha,
    );
  }

  if (showMoon && sky.moonAlpha > 0.05) {
    const moonX = x + Math.floor(w * sky.moonX);
    const moonY = y + Math.floor(h * sky.moonY);
    fill(g, moonX - moonR - 8, moonY - moonR - 8, moonR * 2 + 16, moonR * 2 + 16, MOON_HALO, 0.16 * sky.moonAlpha);
    fill(g, moonX - moonR, moonY - moonR, moonR * 2, moonR * 2, 0xd8c898, sky.moonAlpha);
    fill(
      g,
      moonX - Math.floor(moonR * 0.35),
      moonY - Math.floor(moonR * 0.35),
      Math.floor(moonR * 0.7),
      Math.floor(moonR * 0.7),
      0xf0e8c8,
      sky.moonAlpha,
    );
  }
}
