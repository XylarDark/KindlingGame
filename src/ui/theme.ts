/** Kindling visual tokens — dusk dispensary, chunky wood, muted leaf. */
export const Color = {
  ink: 0x140e0a,
  inkHex: "#140e0a",
  cream: 0xf4e8c1,
  creamHex: "#f4e8c1",
  creamSoftHex: "#e8d8b0",
  leaf: 0x3d6a44,
  /** Kindling sign leaf — shell / side-rail chrome. */
  leafHex: "#3d6a44",
  leafBright: 0x5a9a62,
  lime: 0xc8c070,
  limeHex: "#c8c070",
  neon: 0x8fce9a,
  neonHex: "#8fce9a",
  amber: 0xc86a38,
  amberHex: "#c86a38",
  gold: 0xc4a060,
  panel: 0x221c16,
  panelHex: "#221c16",
  panelStroke: 0x6a5640,
  skyTop: 0x1b2238,
  skyMid: 0x3d3a5c,
  skyLow: 0x8a5a62,
  brick: 0x4a3028,
  brickDeep: 0x2e1c16,
  wood: 0x7a4a2c,
  woodDark: 0x5a341c,
  woodLight: 0xc4a070,
  wall: 0xf7f1e8,
  wallHex: "#f7f1e8",
  wainscot: 0xe9dcc8,
  woodTrim: 0x8b5a32,
  woodTrimHex: "#8b5a32",
  counterTop: 0x6a4124,
  floor: 0x3a281c,
  floorLine: 0x4a3424,
  screen: 0x0c1612,
  screenHex: "#0c1612",
  danger: 0xff8a6a,
  dangerHex: "#ff8a6a",
  muteHex: "#a89880",
  /** Soft lime tint on the next tap target. */
  flash: 0xb8ffb0,
  /**
   * No banner-chip tokens live here any more. Text boxes are the counter plaque —
   * ink on a white field in a leaf frame — built with `addSignText`, so a chip colour
   * is not a decision a call site gets to make. See `ui/signPlaque.ts`.
   */
  /** Title / settings / results cream cards. */
  card: 0xfffaf3,
  cardHex: "#fffaf3",
} as const;

/**
 * Design-space type ramp for the 1920×1080 layout.
 * Sized to fit chrome; `fitTypeToBox` shrinks further when a container is tighter.
 * Aspirational on-screen CSS floors (mobile HUD) are documented in docs/qa-typography.md —
 * fill-stretch makes true CSS floors conflict with fixed containers.
 */
export const Type = {
  display: "36px",
  title: "27px",
  heading: "20px",
  body: "16px",
  caption: "13px",
  micro: "11px",
} as const;

/** Absolute shrink floor — below this, prefer wrapping/ellipsis over unreadable glyphs. */
export const TYPE_MIN_FIT_PX = 10;

/**
 * Shared bump for chip / speech / toast message UI (~+25% type, padding, and box).
 * Applied on top of each scene's authored message sizes rather than raising the Type
 * ramp, so chrome readouts (SCORE, clock, ORDERS label, settings) stay put.
 */
export const MSG_SCALE = 1.25;

/** Scale a design-space px size and return a CSS fontSize string. */
export function scaleMsgPx(px: number): string {
  const scaled = px * MSG_SCALE;
  // Trim float noise while keeping quarters (31.25, 42.1875).
  const rounded = Math.round(scaled * 10000) / 10000;
  return `${rounded}px`;
}

/** Scale chip padding. */
export function scaleMsgPad(pad: { x: number; y: number }): { x: number; y: number } {
  return { x: Math.round(pad.x * MSG_SCALE), y: Math.round(pad.y * MSG_SCALE) };
}

/** Scale a maxWidth / maxHeight box edge. */
export function scaleMsgBox(n: number): number {
  return Math.round(n * MSG_SCALE);
}

