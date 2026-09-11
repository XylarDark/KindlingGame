import Phaser from "phaser";
import { attachDayNight, detachDayNight } from "../art/dayNightPipeline";
import { getRenderBudget } from "./renderBudget";

/** Detach PostFX when the scene sleeps or postFx is off; reattach on wake when active. */
export function wireSceneDayNightLifecycle(
  scene: Phaser.Scene,
  camera: Phaser.Cameras.Scene2D.Camera,
): void {
  const sync = (): void => {
    if (getRenderBudget().postFx && scene.sys.isActive()) {
      attachDayNight(camera);
    } else {
      detachDayNight(camera);
    }
  };

  scene.events.on(Phaser.Scenes.Events.WAKE, sync);
  scene.events.on(Phaser.Scenes.Events.SLEEP, () => detachDayNight(camera));
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
    scene.events.off(Phaser.Scenes.Events.WAKE, sync);
    detachDayNight(camera);
  });
}
