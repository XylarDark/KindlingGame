/**
 * Shared drive/door warm helpers — Boot and Title finish create+draw under the
 * loading gate so mid-shift only wakes scenes.
 */
export const WARM_DRIVE_TIMEOUT_MS = 6000;
export const WARM_DOOR_TIMEOUT_MS = 3500;
export const WARM_SCENE_READY_MS = 500;

/** Per-scene warm completion (survives boot abort for deferred Title finish). */
export type SceneWarmFlags = { drive: boolean; door: boolean };

let warmFlags: SceneWarmFlags = { drive: false, door: false };

export function resetSceneWarmFlags(): void {
  warmFlags = { drive: false, door: false };
}

export function markSceneWarm(key: "drive" | "door"): void {
  warmFlags = { ...warmFlags, [key]: true };
}

export function sceneWarmFlags(): Readonly<SceneWarmFlags> {
  return warmFlags;
}

export function isSceneWarm(key: "drive" | "door"): boolean {
  return warmFlags[key];
}

export function sceneWarmTimeout(key: "drive" | "door"): number {
  return key === "drive" ? WARM_DRIVE_TIMEOUT_MS : WARM_DOOR_TIMEOUT_MS;
}
