import Phaser from "phaser";
import { Color } from "./theme";

export interface ArrowSpot {
  id: string;
  x: number;
  y: number;
}

/** Bobbing chevron that sits above the next thing the player should tap. */
export class TutorialArrows {
  private arrows = new Map<string, Phaser.GameObjects.Container>();

  constructor(
    private scene: Phaser.Scene,
    private depth: number,
  ) {}

  sync(spots: ArrowSpot[]): void {
    const keep = new Set(spots.map((s) => s.id));
    for (const [id, arrow] of this.arrows) {
      if (!keep.has(id)) {
    this.scene.tweens.killTweensOf(arrow.list);
    arrow.destroy();
        this.arrows.delete(id);
      }
    }
    for (const spot of spots) {
      let arrow = this.arrows.get(spot.id);
      if (!arrow) {
        arrow = this.makeArrow();
        this.arrows.set(spot.id, arrow);
      }
      arrow.setPosition(spot.x, spot.y);
      arrow.setVisible(true);
    }
  }

  clear(): void {
    this.sync([]);
  }

  private makeArrow(): Phaser.GameObjects.Container {
    const g = this.scene.add.graphics();
    g.fillStyle(0x120c08, 0.35);
    g.fillTriangle(-18, 6, 18, 6, 0, 34);
    g.fillStyle(Color.gold, 1);
    g.fillTriangle(-16, 0, 16, 0, 0, 28);
    g.fillStyle(Color.cream, 1);
    g.fillTriangle(-8, 2, 8, 2, 0, 16);
    g.lineStyle(3, 0x5a341c, 1);
    g.strokeTriangle(-16, 0, 16, 0, 0, 28);
    const arrow = this.scene.add.container(0, 0, [g]);
    arrow.setDepth(this.depth);
    arrow.setSize(36, 36);
    this.scene.tweens.add({
      targets: g,
      y: 14,
      duration: 420,
      yoyo: true,
      repeat: -1,
      ease: "Sine.inOut",
    });
    return arrow;
  }
}
