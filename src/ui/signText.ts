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
const PUMP_REGISTRY = "kindlingSignPlaquePump";

export interface SignTextOptions extends UiTextOptions {
  /** Inner ring colour, for state the copy alone cannot carry. Defaults to leaf green. */
  accent?: number;
}

type SignPlaqueEntry = {
  text: Phaser.GameObjects.Text;
  plaque: Phaser.GameObjects.Graphics;
  scene: Phaser.Scene;
  lastPaintKey: string;
  dirty: boolean;
};

class SceneSignPlaquePump {
  private readonly scene: Phaser.Scene;
  private readonly entries = new Set<SignPlaqueEntry>();
  private hooked = false;
  private anyDirty = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  register(text: Phaser.GameObjects.Text, plaque: Phaser.GameObjects.Graphics): SignPlaqueEntry {
    const entry: SignPlaqueEntry = {
      text,
      plaque,
      scene: this.scene,
      lastPaintKey: "",
      dirty: true,
    };
    this.entries.add(entry);
    text.setData(PUMP_REGISTRY, entry);
    this.hookText(text, entry);
    this.ensureHook();
    this.anyDirty = true;
    return entry;
  }

  markDirty(entry: SignPlaqueEntry): void {
    entry.dirty = true;
    this.anyDirty = true;
  }

  unregister(entry: SignPlaqueEntry): void {
    this.entries.delete(entry);
    entry.text.data.remove(PUMP_REGISTRY);
  }

  private ensureHook(): void {
    if (this.hooked) return;
    this.hooked = true;
    this.scene.events.on(Phaser.Scenes.Events.PRE_RENDER, this.onPreRender);
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scene.events.off(Phaser.Scenes.Events.PRE_RENDER, this.onPreRender);
      this.scene.registry.remove(PUMP_REGISTRY);
    });
  }

  private onPreRender = (): void => {
    let stillDirty = false;
    for (const entry of this.entries) {
      if (!entry.dirty) continue;
      syncPlaque(entry);
      if (entry.dirty) stillDirty = true;
    }
    this.anyDirty = stillDirty;
  };

  private hookText(text: Phaser.GameObjects.Text, entry: SignPlaqueEntry): void {
    const mark = (): void => this.markDirty(entry);
    const rawSetText = text.setText.bind(text);
    text.setText = ((value: string | string[]) => {
      const out = rawSetText(value);
      mark();
      return out;
    }) as typeof text.setText;
    const rawSetPosition = text.setPosition.bind(text);
    text.setPosition = ((x?: number, y?: number, z?: number, w?: number) => {
      const out = rawSetPosition(x, y, z, w);
      mark();
      return out;
    }) as typeof text.setPosition;
    const rawSetVisible = text.setVisible.bind(text);
    text.setVisible = ((value: boolean) => {
      const wasVisible = text.visible;
      const out = rawSetVisible(value);
      if (wasVisible !== value) {
        entry.lastPaintKey = "";
        if (value) syncPlaque(entry);
      }
      mark();
      return out;
    }) as typeof text.setVisible;
    const rawSetScale = text.setScale.bind(text);
    text.setScale = ((x?: number, y?: number) => {
      const out = rawSetScale(x, y);
      mark();
      return out;
    }) as typeof text.setScale;
    const rawSetFontSize = text.setFontSize.bind(text);
    text.setFontSize = ((size: string | number) => {
      const out = rawSetFontSize(size);
      mark();
      return out;
    }) as typeof text.setFontSize;
    const rawSetFixedSize = text.setFixedSize.bind(text);
    text.setFixedSize = ((width: number, height: number) => {
      const out = rawSetFixedSize(width, height);
      mark();
      return out;
    }) as typeof text.setFixedSize;
    const rawSetAlpha = text.setAlpha.bind(text);
    text.setAlpha = ((value?: number) => {
      const out = rawSetAlpha(value);
      mark();
      return out;
    }) as typeof text.setAlpha;
    const rawSetDepth = text.setDepth.bind(text);
    text.setDepth = ((value: number) => {
      const out = rawSetDepth(value);
      mark();
      return out;
    }) as typeof text.setDepth;
    const rawSetOrigin = text.setOrigin.bind(text);
    text.setOrigin = ((x?: number, y?: number) => {
      const out = rawSetOrigin(x, y);
      mark();
      return out;
    }) as typeof text.setOrigin;
  }
}

function pumpFor(scene: Phaser.Scene): SceneSignPlaquePump {
  let pump = scene.registry.get(PUMP_REGISTRY) as SceneSignPlaquePump | undefined;
  if (!pump) {
    pump = new SceneSignPlaquePump(scene);
    scene.registry.set(PUMP_REGISTRY, pump);
  }
  return pump;
}

function entryFor(text: Phaser.GameObjects.Text): SignPlaqueEntry | undefined {
  return text.getData(PUMP_REGISTRY) as SignPlaqueEntry | undefined;
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
  // Remeasure before painting — fitTypeToBox/setFontSize can land between PRE_RENDER passes.
  text.updateText();
  const sx = text.parentContainer?.scaleX ?? 1;
  const sy = text.parentContainer?.scaleY ?? 1;
  const w = text.width * sx;
  const h = text.height * sy;
  return {
    x: text.x - text.width * text.originX * sx,
    y: text.y - text.height * text.originY * sy,
    w,
    h,
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
  const field = fieldOf(text);
  // Position the Graphics at the field origin and draw rings locally. World-space fillRect
  // on a scene-root plaque drifts from scrolled/zoomed text — Drive's camera follow showed
  // the chip floating beside the copy.
  plaque.setPosition(field.x, field.y);
  const [edge, border, fieldRing] = signPlaqueRings({ x: 0, y: 0, w: field.w, h: field.h });
  for (const ring of [edge!, { ...border!, color: accentOf(text) }, fieldRing!]) {
    plaque.fillStyle(ring.color, 1);
    plaque.fillRect(ring.x, ring.y, ring.w, ring.h);
  }
}

function syncPlaque(entry: SignPlaqueEntry): void {
  const { text, plaque, scene } = entry;
  if (!text.visible) {
    const hiddenKey = ["h", text.visible, text.alpha, accentOf(text), text.depth].join(":");
    if (hiddenKey === entry.lastPaintKey) {
      entry.dirty = false;
      return;
    }
    entry.lastPaintKey = hiddenKey;
    reparent(plaque, text, scene);
    paint(plaque, text);
    entry.dirty = false;
    return;
  }
  const field = fieldOf(text);
  const key = [
    text.visible,
    text.alpha,
    accentOf(text),
    field.x,
    field.y,
    field.w,
    field.h,
    text.depth,
    text.scaleX,
    text.scaleY,
  ].join(":");
  if (key === entry.lastPaintKey) {
    entry.dirty = false;
    return;
  }
  entry.lastPaintKey = key;
  reparent(plaque, text, scene);
  paint(plaque, text);
  entry.dirty = false;
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
  const pump = pumpFor(scene);
  const entry = pump.register(text, plaque);
  text.once(Phaser.GameObjects.Events.DESTROY, () => {
    pump.unregister(entry);
    plaque.destroy();
  });
  syncPlaque(entry);
  return text;
}

/**
 * Recolour one plaque's inner ring. This is how a text box carries urgency or "act on
 * me now" under a scheme where every field is the same white: the frame changes, the
 * copy stays ink, and the box never becomes a different box.
 */
export function setSignAccent(text: Phaser.GameObjects.Text, accent: number = SIGN_BORDER): void {
  text.setData(ACCENT, accent);
  const entry = entryFor(text);
  if (entry) pumpFor(text.scene).markDirty(entry);
}

/** Paint one sign plaque now — for camera-scrolled labels that move every frame. */
export function syncSignPlaque(text: Phaser.GameObjects.Text): void {
  const entry = entryFor(text);
  if (!entry) return;
  entry.dirty = true;
  syncPlaque(entry);
}
