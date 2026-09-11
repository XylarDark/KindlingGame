import Phaser from "phaser";
import { notePerfPlaquePump, notePerfSetText } from "./perfProbe";
import { SIGN_BORDER, SIGN_PAD_X, SIGN_PAD_Y } from "./signPlaque";
import { makePlaqueNineSlice, plaqueTextureForAccent } from "./signPlaqueNine";
import { addUiText, type UiTextOptions } from "./text";
import { Color } from "./theme";

/**
 * Counter plaque chips: ink type on a white 9-slice field in a leaf-green frame.
 * {@link addSignText} returns the inner `Text`; the panel lives in a host
 * {@link signContainer} that callers position via {@link setSignPosition}.
 */
const ACCENT = "signAccent";
const SIGN_HOST = "signHost";
const SIGN_PLAQUE = "signPlaque";
const PUMP_REGISTRY = "kindlingSignPlaquePump";

export interface SignTextOptions extends UiTextOptions {
  /** Inner ring colour, for state the copy alone cannot carry. Defaults to leaf green. */
  accent?: number;
}

type SignPlaqueEntry = {
  text: Phaser.GameObjects.Text;
  host: Phaser.GameObjects.Container;
  plaque: Phaser.GameObjects.NineSlice;
  scene: Phaser.Scene;
  lastLayoutKey: string;
  dirty: boolean;
  /** Inner glyph offset — must bypass the host-moving setPosition patch on Text. */
  setTextLocal: (x: number, y: number) => void;
};

class SceneSignPlaquePump {
  private readonly scene: Phaser.Scene;
  private readonly entries = new Set<SignPlaqueEntry>();
  private hooked = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  register(entry: SignPlaqueEntry): SignPlaqueEntry {
    this.entries.add(entry);
    entry.text.setData(PUMP_REGISTRY, entry);
    this.hookText(entry.text, entry);
    this.ensureHook();
    entry.dirty = true;
    return entry;
  }

  markDirty(entry: SignPlaqueEntry): void {
    entry.dirty = true;
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
    if (!this.scene.sys.isActive() || this.scene.sys.isSleeping()) return;
    for (const entry of this.entries) {
      if (!entry.dirty) continue;
      notePerfPlaquePump();
      layoutPlaque(entry);
    }
  };

  private hookText(text: Phaser.GameObjects.Text, entry: SignPlaqueEntry): void {
    const mark = (): void => this.markDirty(entry);
    const rawSetText = text.setText.bind(text);
    text.setText = ((value: string | string[]) => {
      const out = rawSetText(value);
      notePerfSetText();
      mark();
      return out;
    }) as typeof text.setText;
    const rawSetVisible = text.setVisible.bind(text);
    text.setVisible = ((value: boolean) => {
      const wasVisible = text.visible;
      const out = rawSetVisible(value);
      if (wasVisible !== value) {
        entry.lastLayoutKey = "";
        entry.host.setVisible(value);
        entry.plaque.setVisible(value);
        if (value) layoutPlaque(entry);
      }
      mark();
      return out;
    }) as typeof text.setVisible;
    const rawSetFontSize = text.setFontSize.bind(text);
    text.setFontSize = ((size: string | number) => {
      const out = rawSetFontSize(size);
      mark();
      return out;
    }) as typeof text.setFontSize;
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

function accentOf(text: Phaser.GameObjects.Text): number {
  const accent = text.getData(ACCENT) as number | undefined;
  return accent ?? SIGN_BORDER;
}

/** Host container for a sign chip — position this, not the inner Text alone. */
export function signContainer(text: Phaser.GameObjects.Text): Phaser.GameObjects.Container {
  return (text.getData(SIGN_HOST) as Phaser.GameObjects.Container | undefined) ?? text.parentContainer ?? text.scene.add.container(text.x, text.y);
}

/** World position of a sign chip's host — inner Text x/y are local to the plaque. */
export function signHostPosition(text: Phaser.GameObjects.Text): { x: number; y: number } {
  const host = text.getData(SIGN_HOST) as Phaser.GameObjects.Container | undefined;
  return host ? { x: host.x, y: host.y } : { x: text.x, y: text.y };
}

/** Move a sign chip — updates the host container when present. */
export function setSignPosition(text: Phaser.GameObjects.Text, x: number, y: number): void {
  const host = text.getData(SIGN_HOST) as Phaser.GameObjects.Container | undefined;
  if (host) host.setPosition(x, y);
  else text.setPosition(x, y);
}

/** Hit-test the plaque host, not inner Text at local glyph offsets. */
export function syncSignHit(text: Phaser.GameObjects.Text): void {
  const host = text.getData(SIGN_HOST) as Phaser.GameObjects.Container | undefined;
  const plaque = text.getData(SIGN_PLAQUE) as Phaser.GameObjects.NineSlice | undefined;
  if (!host || !plaque) return;
  const w = plaque.width;
  const h = plaque.height;
  const left = plaque.x - w * plaque.originX;
  const top = plaque.y - h * plaque.originY;
  if (!host.input) {
    host.setInteractive({
      useHandCursor: true,
      hitArea: new Phaser.Geom.Rectangle(left, top, w, h),
      hitAreaCallback: Phaser.Geom.Rectangle.Contains,
    });
    return;
  }
  const area = host.input.hitArea;
  if (area && typeof (area as Phaser.Geom.Rectangle).setTo === "function") {
    (area as Phaser.Geom.Rectangle).setTo(left, top, w, h);
  }
}

function layoutPlaque(entry: SignPlaqueEntry): void {
  const { text, host, plaque } = entry;
  const copy = String(text.text ?? "");
  const show = text.visible && copy.trim().length > 0;
  host.setVisible(show);
  plaque.setVisible(show);
  if (!show) {
    entry.lastLayoutKey = `h:${accentOf(text)}`;
    entry.dirty = false;
    return;
  }

  text.updateText();
  const w = text.width;
  const h = text.height;
  const panelW = Math.max(8, w + SIGN_PAD_X * 2);
  const panelH = Math.max(8, h + SIGN_PAD_Y * 2);
  const accent = accentOf(text);
  const tex = plaqueTextureForAccent(accent);
  if (plaque.texture.key !== tex) plaque.setTexture(tex);

  const key = [copy, w, h, text.originX, text.originY, accent, text.depth, tex].join(":");
  if (key === entry.lastLayoutKey) {
    entry.dirty = false;
    return;
  }
  entry.lastLayoutKey = key;

  const textX = -w * text.originX;
  const textY = -h * text.originY;
  entry.setTextLocal(textX, textY);
  plaque.setSize(panelW, panelH);
  plaque.setPosition(textX - SIGN_PAD_X + panelW / 2, textY - SIGN_PAD_Y + panelH / 2);
  plaque.setOrigin(0.5, 0.5);
  plaque.setDepth(text.depth - 0.5);
  host.setDepth(text.depth);
  entry.dirty = false;
}

/**
 * A text box on a sign plaque. Returns the `Text` for copy/accent APIs; position
 * the chip with {@link setSignPosition} / {@link signContainer}.
 */
export function addSignText(
  scene: Phaser.Scene,
  x: number,
  y: number,
  content: string,
  options: SignTextOptions = {},
): Phaser.GameObjects.Text {
  const { accent, padding: _pad, ...style } = options;
  const host = scene.add.container(x, y);
  const text = addUiText(scene, 0, 0, content, {
    ...style,
    color: style.color ?? Color.inkHex,
    strokeThickness: style.strokeThickness ?? 0,
    growBox: false,
    padding: undefined,
  });
  text.setScrollFactor(0);
  if (accent !== undefined) text.setData(ACCENT, accent);

  const plaque = makePlaqueNineSlice(scene, SIGN_PAD_X * 2 + 8, SIGN_PAD_Y * 2 + 8, accent ?? SIGN_BORDER);
  plaque.setScrollFactor(0);
  host.add([plaque, text]);
  host.setScrollFactor(0);
  text.setData(SIGN_HOST, host);
  text.setData(SIGN_PLAQUE, plaque);

  const rawSetPosition = text.setPosition.bind(text);
  const setTextLocal = (x: number, y: number): void => {
    rawSetPosition(x, y);
  };
  text.setPosition = ((x?: number, y?: number, z?: number, w?: number) => {
    if (x !== undefined && y !== undefined) host.setPosition(x, y);
    return rawSetPosition(0, 0, z, w);
  }) as typeof text.setPosition;

  const pump = pumpFor(scene);
  const entry = pump.register({ text, host, plaque, scene, lastLayoutKey: "", dirty: true, setTextLocal });
  text.once(Phaser.GameObjects.Events.DESTROY, () => {
    pump.unregister(entry);
    host.destroy();
  });
  layoutPlaque(entry);
  return text;
}

export function setSignAccent(text: Phaser.GameObjects.Text, accent: number = SIGN_BORDER): void {
  text.setData(ACCENT, accent);
  const entry = entryFor(text);
  if (entry) {
    entry.lastLayoutKey = "";
    pumpFor(text.scene).markDirty(entry);
  }
}

export function syncSignPlaque(text: Phaser.GameObjects.Text): void {
  const entry = entryFor(text);
  if (!entry) return;
  entry.dirty = true;
  layoutPlaque(entry);
}

export function setSignCopy(text: Phaser.GameObjects.Text, copy: string): void {
  text.setText(copy);
  const show = copy.trim().length > 0;
  text.setVisible(show);
  const entry = entryFor(text);
  if (entry) {
    entry.dirty = true;
    if (show) layoutPlaque(entry);
    else {
      entry.host.setVisible(false);
      entry.plaque.setVisible(false);
    }
  }
}
