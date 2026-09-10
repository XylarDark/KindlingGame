import type Phaser from "phaser";

/** Packed grass/road/parking (and shop pad) tiles — one GPU texture, many frames. */
export const CITY_TILE_ATLAS_KEY = "atlas-city-tiles";

export const CITY_TILE_ATLAS_FRAMES = [
  "tex-wall",
  "tex-wall-2",
  "tex-wall-3",
  "tex-parking",
  "tex-road",
  "tex-road-hn",
  "tex-road-hs",
  "tex-road-v",
  "tex-road-vw",
  "tex-road-ve",
  "tex-road-x",
  "tex-road-x-nw",
  "tex-road-x-ne",
  "tex-road-x-sw",
  "tex-road-x-se",
  "tex-shop",
] as const;

const TILE_PX = 64;
const COLS = 4;

let atlasReady = false;

export function isCityTileAtlasReady(): boolean {
  return atlasReady;
}

/**
 * Pack already-generated 64x64 city tile textures into one atlas sheet.
 * Call once after `generateTextures`. Drive then draws with (atlasKey, frame).
 */
export function registerCityTileAtlas(scene: Phaser.Scene): boolean {
  const textures = scene.textures;
  if (textures.exists(CITY_TILE_ATLAS_KEY)) {
    atlasReady = true;
    return true;
  }
  const missing = CITY_TILE_ATLAS_FRAMES.filter((k) => !textures.exists(k));
  if (missing.length > 0) return false;

  const rows = Math.ceil(CITY_TILE_ATLAS_FRAMES.length / COLS);
  const sheetW = COLS * TILE_PX;
  const sheetH = rows * TILE_PX;
  const canvasTex = textures.createCanvas(CITY_TILE_ATLAS_KEY, sheetW, sheetH);
  if (!canvasTex) return false;
  const ctx = canvasTex.getContext();

  CITY_TILE_ATLAS_FRAMES.forEach((key, i) => {
    const col = i % COLS;
    const row = Math.floor(i / COLS);
    const x = col * TILE_PX;
    const y = row * TILE_PX;
    const src = textures.get(key).getSourceImage() as CanvasImageSource;
    ctx.drawImage(src, x, y, TILE_PX, TILE_PX);
    canvasTex.add(key, 0, x, y, TILE_PX, TILE_PX);
  });
  canvasTex.refresh();
  atlasReady = textures.exists(CITY_TILE_ATLAS_KEY);
  return atlasReady;
}

/** Image args for a city ground/road tile — atlas frame when packed, else legacy key. */
export function cityTileImageKey(frame: string): { key: string; frame?: string } {
  if (atlasReady) return { key: CITY_TILE_ATLAS_KEY, frame };
  return { key: frame };
}

export function resetCityTileAtlasForTests(): void {
  atlasReady = false;
}
