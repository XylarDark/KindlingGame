import type Phaser from "phaser";

let loadPromise: Promise<void> | null = null;

export function worldScenesRegistered(game: Phaser.Game): boolean {
  return game.scene.getScene("drive") !== null && game.scene.getScene("door") !== null;
}

/** Dynamic-import drive/door after the boot graph (Boot, Shop, Hud, Title) is warm. */
export function loadWorldScenes(game: Phaser.Game): Promise<void> {
  if (worldScenesRegistered(game)) return Promise.resolve();
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const [{ DriveScene }, { DoorScene }] = await Promise.all([
      import("./DriveScene"),
      import("./DoorScene"),
    ]);
    if (!game.scene.getScene("drive")) {
      game.scene.add("drive", DriveScene, false);
    }
    if (!game.scene.getScene("door")) {
      game.scene.add("door", DoorScene, false);
    }
  })();
  return loadPromise;
}
