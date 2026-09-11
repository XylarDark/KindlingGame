import Phaser from "phaser";
import {
  PLAQUE_TEX,
  PLAQUE_TEX_DANGER,
  PLAQUE_TEX_LIME,
  SIGN_BORDER,
  SIGN_EDGE,
  SIGN_EDGE_W,
  SIGN_FIELD,
  SIGN_FRAME_W,
} from "./signPlaque";

/** Match {@link Color.lime} / {@link Color.danger}. */
const ACCENT_LIME = 0xc8c070;
const ACCENT_DANGER = 0xff8a6a;

/** Source canvas size — corners are SIGN_FRAME_W; centre stretches. */
const PLAQUE_SRC = SIGN_FRAME_W * 2 + 4;

function hex(c: number): string {
  return `#${c.toString(16).padStart(6, "0")}`;
}

function paintPlaqueCanvas(ctx: CanvasRenderingContext2D, innerBorder: number): void {
  const s = PLAQUE_SRC;
  ctx.clearRect(0, 0, s, s);
  ctx.fillStyle = hex(SIGN_EDGE);
  ctx.fillRect(0, 0, s, s);
  ctx.fillStyle = hex(innerBorder);
  ctx.fillRect(SIGN_EDGE_W, SIGN_EDGE_W, s - SIGN_EDGE_W * 2, s - SIGN_EDGE_W * 2);
  ctx.fillStyle = hex(SIGN_FIELD);
  ctx.fillRect(SIGN_FRAME_W, SIGN_FRAME_W, s - SIGN_FRAME_W * 2, s - SIGN_FRAME_W * 2);
}

/** Bake leaf / lime / danger plaque slices once at boot. */
export function registerSignPlaqueTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(PLAQUE_TEX)) return;
  const specs: Array<[string, number]> = [
    [PLAQUE_TEX, SIGN_BORDER],
    [PLAQUE_TEX_LIME, ACCENT_LIME],
    [PLAQUE_TEX_DANGER, ACCENT_DANGER],
  ];
  for (const [key, border] of specs) {
    const canvas = scene.textures.createCanvas(key, PLAQUE_SRC, PLAQUE_SRC);
    if (!canvas) continue;
    const ctx = canvas.context;
    if (!ctx) continue;
    paintPlaqueCanvas(ctx, border);
    canvas.refresh();
  }
}

export function plaqueTextureForAccent(accent: number): string {
  if (accent === ACCENT_LIME) return PLAQUE_TEX_LIME;
  if (accent === ACCENT_DANGER) return PLAQUE_TEX_DANGER;
  return PLAQUE_TEX;
}

export function makePlaqueNineSlice(
  scene: Phaser.Scene,
  width: number,
  height: number,
  accent: number = SIGN_BORDER,
): Phaser.GameObjects.NineSlice {
  const tex = plaqueTextureForAccent(accent);
  const slice = scene.add.nineslice(
    0,
    0,
    tex,
    undefined,
    Math.max(PLAQUE_SRC, width),
    Math.max(PLAQUE_SRC, height),
    SIGN_FRAME_W,
    SIGN_FRAME_W,
    SIGN_FRAME_W,
    SIGN_FRAME_W,
  );
  slice.texture.setFilter(Phaser.Textures.FilterMode.LINEAR);
  return slice;
}
