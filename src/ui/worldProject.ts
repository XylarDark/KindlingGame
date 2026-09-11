import Phaser from "phaser";

const scratch = new Phaser.Math.Vector2();

/**
 * Project a world-space point through a scrolling scene camera into canvas /
 * HUD coordinates. Both Drive and Hud share the full 1920×1080 viewport.
 */
export function worldToScreen(
  cam: Phaser.Cameras.Scene2D.Camera,
  worldX: number,
  worldY: number,
): Phaser.Math.Vector2 {
  const view = cam.worldView;
  scratch.set((worldX - view.x) * cam.zoom, (worldY - view.y) * cam.zoom);
  return scratch;
}
