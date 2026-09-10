import type Phaser from "phaser";
import { PERSON_H, PERSON_HAT_H, PERSON_SIT_H, PERSON_SIT_W, PERSON_W, PORTRAIT_H, PORTRAIT_W } from "./peopleSize";
import {
  customerPortraitKey,
  customerPortraitKeys,
  customerTextureKey,
  customerTextureKeys,
} from "./people";

/** Standing crew + customer sprites — one GPU texture, many frames. */
export const PEOPLE_STANDING_ATLAS_KEY = "atlas-people-standing";

/** ID-card portraits — separate sheet (different cell height). */
export const PEOPLE_PORTRAIT_ATLAS_KEY = "atlas-people-faces";

const CREW_STANDING_FRAMES = ["tex-keylead", "tex-driver", "tex-driver-sit"] as const;

export const PEOPLE_STANDING_ATLAS_FRAMES = [...customerTextureKeys(), ...CREW_STANDING_FRAMES] as const;

export const PEOPLE_PORTRAIT_ATLAS_FRAMES = customerPortraitKeys();

const STANDING_FRAME_SIZE: Record<string, { w: number; h: number }> = {
  "tex-driver": { w: PERSON_W, h: PERSON_HAT_H },
  "tex-driver-sit": { w: PERSON_SIT_W, h: PERSON_SIT_H },
  "tex-keylead": { w: PERSON_W, h: PERSON_H },
};
for (let i = 0; i < customerTextureKeys().length; i++) {
  STANDING_FRAME_SIZE[customerTextureKey(i)] = { w: PERSON_W, h: PERSON_H };
}

const STANDING_FRAME_SET = new Set<string>(PEOPLE_STANDING_ATLAS_FRAMES);

const SHEET_MAX_W = 2048;

let standingReady = false;
let portraitReady = false;

export function isPeopleStandingAtlasReady(): boolean {
  return standingReady;
}

export function isPeoplePortraitAtlasReady(): boolean {
  return portraitReady;
}

type PackRect = { key: string; x: number; y: number; w: number; h: number };

function frameSize(key: string, portrait = false): { w: number; h: number } {
  if (portrait || key.startsWith("tex-face-")) return { w: PORTRAIT_W, h: PORTRAIT_H };
  return STANDING_FRAME_SIZE[key] ?? { w: PERSON_W, h: PERSON_H };
}

/** Shelf-pack variable-size frames into one canvas sheet. */
function packFrames(keys: readonly string[], portrait = false): { rects: PackRect[]; sheetW: number; sheetH: number } {
  const rects: PackRect[] = [];
  let x = 0;
  let y = 0;
  let rowH = 0;
  let sheetW = 0;
  for (const key of keys) {
    const { w, h } = frameSize(key, portrait);
    if (x > 0 && x + w > SHEET_MAX_W) {
      y += rowH;
      x = 0;
      rowH = 0;
    }
    rects.push({ key, x, y, w, h });
    x += w;
    rowH = Math.max(rowH, h);
    sheetW = Math.max(sheetW, x);
  }
  return { rects, sheetW, sheetH: y + rowH };
}

function buildAtlas(
  scene: Phaser.Scene,
  atlasKey: string,
  frames: readonly string[],
  portrait = false,
): boolean {
  const textures = scene.textures;
  if (textures.exists(atlasKey)) return true;
  const missing = frames.filter((k) => !textures.exists(k));
  if (missing.length > 0) return false;

  const { rects, sheetW, sheetH } = packFrames(frames, portrait);
  const canvasTex = textures.createCanvas(atlasKey, sheetW, sheetH);
  if (!canvasTex) return false;
  const ctx = canvasTex.getContext();

  for (const rect of rects) {
    const src = textures.get(rect.key).getSourceImage() as CanvasImageSource;
    ctx.drawImage(src, rect.x, rect.y, rect.w, rect.h);
    canvasTex.add(rect.key, 0, rect.x, rect.y, rect.w, rect.h);
  }
  canvasTex.refresh();
  return textures.exists(atlasKey);
}

/**
 * Pack standing customer + crew textures into one atlas. Call once after `generateTextures`.
 */
export function registerPeopleStandingAtlas(scene: Phaser.Scene): boolean {
  if (scene.textures.exists(PEOPLE_STANDING_ATLAS_KEY)) {
    standingReady = true;
    return true;
  }
  const ok = buildAtlas(scene, PEOPLE_STANDING_ATLAS_KEY, PEOPLE_STANDING_ATLAS_FRAMES);
  standingReady = ok && scene.textures.exists(PEOPLE_STANDING_ATLAS_KEY);
  return standingReady;
}

export function registerPeoplePortraitAtlas(scene: Phaser.Scene): boolean {
  if (scene.textures.exists(PEOPLE_PORTRAIT_ATLAS_KEY)) {
    portraitReady = true;
    return true;
  }
  const ok = buildAtlas(scene, PEOPLE_PORTRAIT_ATLAS_KEY, PEOPLE_PORTRAIT_ATLAS_FRAMES, true);
  portraitReady = ok && scene.textures.exists(PEOPLE_PORTRAIT_ATLAS_KEY);
  return portraitReady;
}

/** Register both people atlases after boot bake. */
export function registerPeopleAtlases(scene: Phaser.Scene): boolean {
  return registerPeopleStandingAtlas(scene) && registerPeoplePortraitAtlas(scene);
}

/** Image args for a standing person frame — atlas when packed, else legacy key. */
export function personImageKey(frame: string): { key: string; frame?: string } {
  if (standingReady && STANDING_FRAME_SET.has(frame)) {
    return { key: PEOPLE_STANDING_ATLAS_KEY, frame };
  }
  return { key: frame };
}

/** Image args for an ID portrait frame. */
export function portraitImageKey(frame: string): { key: string; frame?: string } {
  if (portraitReady && frame.startsWith("tex-face-")) {
    return { key: PEOPLE_PORTRAIT_ATLAS_KEY, frame };
  }
  return { key: frame };
}

/** Set standing sprite texture only when key/frame changed. */
export function applyPersonTexture(img: Phaser.GameObjects.Image, lookIndex: number): void {
  const { key, frame } = personImageKey(customerTextureKey(lookIndex));
  if (frame) {
    if (img.texture.key !== key || img.frame.name !== frame) img.setTexture(key, frame);
  } else if (img.texture.key !== key) {
    img.setTexture(key);
  }
}

/** Set portrait texture only when key/frame changed. */
export function applyPortraitTexture(img: Phaser.GameObjects.Image, lookIndex: number): void {
  const { key, frame } = portraitImageKey(customerPortraitKey(lookIndex));
  if (frame) {
    if (img.texture.key !== key || img.frame.name !== frame) img.setTexture(key, frame);
  } else if (img.texture.key !== key) {
    img.setTexture(key);
  }
}

/** Crew / static keys (driver, keylead, driver-sit). */
export function applyCrewTexture(img: Phaser.GameObjects.Image, legacyKey: string): void {
  const { key, frame } = personImageKey(legacyKey);
  if (frame) {
    if (img.texture.key !== key || img.frame.name !== frame) img.setTexture(key, frame);
  } else if (img.texture.key !== key) {
    img.setTexture(key);
  }
}

export function resetPeopleAtlasForTests(): void {
  standingReady = false;
  portraitReady = false;
}
