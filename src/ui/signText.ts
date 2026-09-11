import Phaser from "phaser";
import { SIGN_BORDER, signPlaqueRings } from "./signPlaque";
import { addUiText, type UiTextOptions } from "./text";
import { Color } from "./theme";

/**
 * Every text box in the game wears the counter plaque: ink type on a white field inside
 * a leaf-green frame. The scheme itself lives in `signPlaque.ts` — this is the part that
 * puts it behind a live `Text` whose copy, size and position all move at runtime.
 *
 * A Phaser text's own `backgroundColor` cannot carry a border, which is why the boxes
 * were previously a scatter of flat chips: cream, lime, amber and two different inks,
 * each one a decision made where it was written. A plaque is a Graphics behind the text
 * instead, repainted from the text's measured bounds every frame the scene renders, so
 * it fits copy that rewraps or shrinks to fit without anyone having to remember to
 * resize it.
 *
 * Padding passed to the text becomes the white margin around the glyphs, since Phaser
 * folds padding into the measured box the frame is grown from.
 */
const ACCENT = "signAccent";

export interface SignTextOptions extends UiTextOptions {
  /** Inner ring colour, for state the copy alone cannot carry. Defaults to leaf green. */
  accent?: number;
}

/**
 * Paint state for one plaque. Held on the text so an accent survives the text being
 * repositioned, re-wrapped or re-coloured by its scene.
 */
function accentOf(text: Phaser.GameObjects.Text): number {
  const accent = text.getData(ACCENT) as number | undefined;
  return accent ?? SIGN_BORDER;
}

/**
 * The plaque's field: the text's measured box, placed against its own origin. Read off
 * the object rather than the constants it was built from — a clamp-fit text is
 * routinely smaller than the box it was authored with, and the frame has to sit on the
 * glyphs that actually rendered.
 */
function fieldOf(text: Phaser.GameObjects.Text): { x: number; y: number; w: number; h: number } {
  return {
    x: text.x - text.width * text.originX,
    y: text.y - text.height * text.originY,
    w: text.width,
    h: text.height,
  };
}

/**
 * Keep the plaque in whatever container its text ended up in — the score pop and the
 * delivery phone both add their text to one after construction. Sharing the parent is
 * what lets the field be measured in the text's own coordinates below; a scene-level
 * plaque behind a container's text would be drawn under the entire container, which for
 * the phone means behind the chassis.
 */
function reparent(
  plaque: Phaser.GameObjects.Graphics,
  text: Phaser.GameObjects.Text,
  scene: Phaser.Scene,
): void {
  const parent = text.parentContainer;
  // Explicit type argument: `moveBelow` infers both children from the first, and a
  // Graphics and a Text are only siblings at the GameObject level.
  const below = (): void => {
    parent?.moveBelow<Phaser.GameObjects.GameObject>(plaque, text);
  };
  if (plaque.parentContainer === parent) {
    below();
    return;
  }
  plaque.parentContainer?.remove(plaque);
  if (!parent) {
    scene.add.existing(plaque);
    return;
  }
  parent.add(plaque);
  below();
}

function paint(plaque: Phaser.GameObjects.Graphics, text: Phaser.GameObjects.Text): void {
  plaque.clear();
  // A hidden text still reports bounds, so visibility has to be mirrored explicitly or
  // the frame outlives the copy it belongs to.
  plaque.setVisible(text.visible);
  plaque.setAlpha(text.alpha);
  // Depth is chained on after construction at most call sites, so it is read here rather
  // than captured: the plaque only ever needs to be immediately under its own text.
  plaque.setDepth(text.depth - 0.5);
  if (!text.visible) return;
  // Outermost first, each covering the middle of the last. Only the inner ring takes an
  // accent: the dark outer edge is what holds the box together against both the bright
  // shop wall and the night street, so it stays put in every state.
  const [edge, border, field] = signPlaqueRings(fieldOf(text));
  for (const ring of [edge!, { ...border!, color: accentOf(text) }, field!]) {
    plaque.fillStyle(ring.color, 1);
    plaque.fillRect(ring.x, ring.y, ring.w, ring.h);
  }
}

/**
 * A text box on a sign plaque. Returns the `Text` itself, so call sites keep chaining
 * `setOrigin` / `setDepth` / `setVisible` and keep calling `setText` as they did with a
 * background-coloured chip.
 */
export function addSignText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: SignTextOptions = {},
): Phaser.GameObjects.Text {
  const { accent, ...style } = options;
  const text = addUiText(scene, x, y, content, {
    ...style,
    color: style.color ?? Color.inkHex,
    // Ink on white needs no outline, and a stroke would print inside the field.
    strokeThickness: style.strokeThickness ?? 0,
    growBox: style.growBox ?? true,
  });
  if (accent !== undefined) text.setData(ACCENT, accent);

  const plaque = scene.add.graphics();
  let lastPaintKey = "";
  const sync = (): void => {
    if (!text.visible) {
      const hiddenKey = ["h", text.visible, text.alpha, accentOf(text), text.depth].join(":");
      if (hiddenKey === lastPaintKey) return;
      lastPaintKey = hiddenKey;
      reparent(plaque, text, scene);
      paint(plaque, text);
      return;
    }
    const key = [
      text.visible,
      text.alpha,
      accentOf(text),
      text.x,
      text.y,
      text.width,
      text.height,
      text.originX,
      text.originY,
      text.depth,
    ].join(":");
    if (key === lastPaintKey) return;
    lastPaintKey = key;
    reparent(plaque, text, scene);
    paint(plaque, text);
  };
  // PRE_RENDER, not the scene's update: it is the last hook before the frame is drawn,
  // so it sees the position and copy the scene just set rather than last frame's.
  scene.events.on(Phaser.Scenes.Events.PRE_RENDER, sync);
  text.once(Phaser.GameObjects.Events.DESTROY, () => {
    scene.events.off(Phaser.Scenes.Events.PRE_RENDER, sync);
    plaque.destroy();
  });
  sync();
  return text;
}

/**
 * Recolour one plaque's inner ring. This is how a text box carries urgency or "act on
 * me now" under a scheme where every field is the same white: the frame changes, the
 * copy stays ink, and the box never becomes a different box.
 */
export function setSignAccent(text: Phaser.GameObjects.Text, accent: number = SIGN_BORDER): void {
  text.setData(ACCENT, accent);
}
