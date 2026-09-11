import Phaser from "phaser";
import { notePerfPlaquePump, notePerfSetText } from "./perfProbe";
import { SIGN_BORDER, SIGN_PAD_X, SIGN_PAD_Y } from "./signPlaque";
import { glyphLocalBounds as glyphLocalBoundsInk, inkInsidePlaque as inkFitsPlaque } from "./signTextInk";
import { makePlaqueNineSlice, plaqueTextureForAccent } from "./signPlaqueNine";
import { makeType, type TypeStyle } from "./typekit";
import type { UiTextOptions } from "./text";
import { Color } from "./theme";

/**
 * Sign text contract — standard UI: ink stays inside its panel.
 *
 * - {@link addSignText} returns inner `Text`; callers move the {@link signContainer} host only.
 * - Patched `Text.setPosition` never zeroes glyph locals (#53).
 * - {@link layoutPlaque} sizes the nine-slice from glyph bounds + {@link SIGN_PAD_X}/{@link SIGN_PAD_Y}.
 * - {@link inkInsidePlaque} fails on empty boxes or top-clipped ink.
 * - {@link syncChildScrollFactors} copies scroll from the host only.
 */
const ACCENT = "signAccent";
const SIGN_HOST = "signHost";
const SIGN_PLAQUE = "signPlaque";
const PUMP_REGISTRY = "kindlingSignPlaquePump";

export interface SignTextOptions extends UiTextOptions {
  /** Inner ring colour, for state the copy alone cannot carry. Defaults to leaf green. */
  accent?: number;
  /** Override default {@link SIGN_PAD_X} for compact chips (drive callouts). */
  padX?: number;
  /** Override default {@link SIGN_PAD_Y} for compact chips (drive callouts). */
  padY?: number;
}

const SIGN_PAD = "signPad";

function signPads(text: Phaser.GameObjects.Text): { x: number; y: number } {
  const custom = text.getData(SIGN_PAD) as { x: number; y: number } | undefined;
  return custom ?? { x: SIGN_PAD_X, y: SIGN_PAD_Y };
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

/** Keep plaque + glyph scroll matched to the host — mismatched factors split the chip. */
function syncChildScrollFactors(host: Phaser.GameObjects.Container): void {
  const sx = host.scrollFactorX;
  const sy = host.scrollFactorY;
  for (const child of host.list) {
    if ("setScrollFactor" in child && typeof child.setScrollFactor === "function") {
      child.setScrollFactor(sx, sy);
    }
  }
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

/** Plaque panel size and local Y edges relative to the sign host origin. */
export interface SignPlaqueExtents {
  panelW: number;
  panelH: number;
  topLocal: number;
  bottomLocal: number;
}

function glyphLocalBounds(text: Phaser.GameObjects.Text, w: number, h: number): { left: number; top: number } {
  return glyphLocalBoundsInk({ width: w, height: h, originX: text.originX, originY: text.originY });
}

export { glyphAabb, inkInsidePlaque } from "./signTextInk";

function plaqueCenterFromGlyphs(
  text: Phaser.GameObjects.Text,
  w: number,
  h: number,
  panelW: number,
  panelH: number,
): { x: number; y: number } {
  const pad = signPads(text);
  const { left, top } = glyphLocalBounds(text, w, h);
  return { x: left - pad.x + panelW / 2, y: top - pad.y + panelH / 2 };
}

/** Laid-out plaque bounds — pads and 9-slice included, not bare Text.displayHeight. */
export function signPlaqueExtents(text: Phaser.GameObjects.Text): SignPlaqueExtents {
  syncSignPlaque(text);
  const plaque = text.getData(SIGN_PLAQUE) as Phaser.GameObjects.NineSlice | undefined;
  const w = text.width;
  const h = text.height;
  if (!plaque) {
    const { top } = glyphLocalBounds(text, w, h);
    return { panelW: w, panelH: h, topLocal: top, bottomLocal: top + h };
  }
  const panelH = plaque.height;
  const panelW = plaque.width;
  const center = plaqueCenterFromGlyphs(text, w, h, panelW, panelH);
  return {
    panelW,
    panelH,
    topLocal: center.y - panelH / 2,
    bottomLocal: center.y + panelH / 2,
  };
}

/** Host Y so the plaque's lowest pixel sits `gap` px above `ceilingY` (smaller y = higher). */
export function signYAbove(text: Phaser.GameObjects.Text, ceilingY: number, gap: number): number {
  return ceilingY - gap - signPlaqueExtents(text).bottomLocal;
}

/** Host Y so the plaque's top pixel sits at least `gap` px below `floorY`. */
export function signYFloor(text: Phaser.GameObjects.Text, floorY: number, gap: number): number {
  return floorY + gap - signPlaqueExtents(text).topLocal;
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
  const pad = signPads(text);
  const panelW = Math.max(8, w + pad.x * 2);
  const panelH = Math.max(8, h + pad.y * 2);
  const accent = accentOf(text);
  const tex = plaqueTextureForAccent(accent);
  if (plaque.texture.key !== tex) plaque.setTexture(tex);

  const textX = -w * text.originX;
  const textY = -h * text.originY;
  const plaqueCenter = plaqueCenterFromGlyphs(text, w, h, panelW, panelH);
  // Always repair inner layout — patched setPosition must not leave glyphs orphaned at (0,0).
  entry.setTextLocal(textX, textY);
  plaque.setPosition(plaqueCenter.x, plaqueCenter.y);
  syncChildScrollFactors(host);

  const ink = inkFitsPlaque(
    { width: w, height: h, originX: text.originX, originY: text.originY },
    { x: plaque.x, y: plaque.y, width: plaque.width, height: plaque.height, originX: plaque.originX, originY: plaque.originY },
  );
  if (!ink.ok) {
    throw new Error(`sign plaque layout: ${ink.reason} for "${copy.slice(0, 32)}"`);
  }

  const key = [copy, w, h, text.originX, text.originY, accent, text.depth, tex, pad.x, pad.y].join(":");
  if (key === entry.lastLayoutKey) {
    entry.dirty = false;
    return;
  }
  entry.lastLayoutKey = key;

  plaque.setSize(panelW, panelH);
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
  const { accent, padX, padY, padding: _pad, ...style } = options;
  const host = scene.add.container(x, y);
  const text = makeType(scene, 0, 0, content, {
    ...(style as TypeStyle),
    color: style.color ?? Color.inkHex,
    strokeThickness: style.strokeThickness ?? 0,
    growBox: false,
    padding: undefined,
  });
  if (accent !== undefined) text.setData(ACCENT, accent);
  if (padX !== undefined || padY !== undefined) {
    text.setData(SIGN_PAD, { x: padX ?? SIGN_PAD_X, y: padY ?? SIGN_PAD_Y });
  }

  const plaque = makePlaqueNineSlice(scene, SIGN_PAD_X * 2 + 8, SIGN_PAD_Y * 2 + 8, accent ?? SIGN_BORDER);
  host.add([plaque, text]);
  host.setScrollFactor(0);
  syncChildScrollFactors(host);
  text.setData(SIGN_HOST, host);
  text.setData(SIGN_PLAQUE, plaque);

  const rawSetPosition = text.setPosition.bind(text);
  const setTextLocal = (x: number, y: number): void => {
    rawSetPosition(x, y);
  };
  text.setPosition = ((x?: number, y?: number, _z?: number, _w?: number) => {
    if (x !== undefined && y !== undefined) host.setPosition(x, y);
    return text;
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
