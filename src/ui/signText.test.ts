import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * `core.autocrlf` is true in this repo, so a checkout delivers CRLF and any
 * newline-anchored search silently misses. Normalise, and throw on a miss rather than
 * quietly scanning nothing â€” both failures have happened here before.
 */
function read(path: string): string {
  const src = readFileSync(new URL(path, import.meta.url), "utf8").replace(/\r\n/g, "\n");
  if (src.trim().length === 0) throw new Error(`${path} read as empty`);
  return src;
}

const SCENES = [
  "../scenes/ShopScene.ts",
  "../scenes/DriveScene.ts",
  "../scenes/HudScene.ts",
  "../scenes/DoorScene.ts",
  "../scenes/TitleScene.ts",
];

const helper = read("./signText.ts");

describe("text boxes are all the counter plaque", () => {
  it("leaves no flat chip anywhere in the game's screens", () => {
    // The scheme is one white field in a leaf frame, and the way it used to be lost was
    // one call site at a time choosing its own chip colour: cream here, lime there,
    // amber on the road, two different inks in the HUD. A text's own `backgroundColor`
    // is the only way to make one, so its absence is the property worth guarding.
    for (const path of SCENES) {
      // A camera's own backdrop is the sky, and shares the method name — the road paints
      // it from `skyAt` every frame. Only text objects are at issue here.
      const chips = read(path)
        .split("\n")
        .filter((line) => /backgroundColor/.test(line) && !/cameras\.main/.test(line));
      expect(chips, `${path} still colours a text chip directly`).toEqual([]);
    }
  });

  it("does not offer a chip colour to pass in the first place", () => {
    // `TypeStyle` is what every `addUiText` call site fills in. While it carried a
    // `backgroundColor`, a boxed text was always one property away.
    const typekit = read("./typekit.ts");
    expect(typekit).not.toMatch(/backgroundColor\??:/);
    expect(read("./theme.ts"), "banner chip tokens are gone from the palette").not.toMatch(/bannerInk/);
  });

  it("measures the field off the text that rendered, not the box it asked for", () => {
    // `fitTypeToBox` only ever shrinks, so a plaque sized from the authored constants
    // would stand proud of a shrunken caption. This is the same trap that has caught
    // the layout audit and the SCORE caption before it.
    expect(helper).toMatch(/text\.width \* text\.originX/);
    expect(helper).toMatch(/text\.height \* text\.originY/);
  });

  it("repaints before the frame is drawn, so a moved or rewritten box stays wrapped", () => {
    // Scenes set copy and position in `update`, every frame. PRE_RENDER is the last hook
    // before the draw, so the frame it paints is the one the text is about to render at.
    expect(helper).toContain("Phaser.Scenes.Events.PRE_RENDER");
    // A destroyed text (customer bubbles, score pops) must take its plaque and its
    // listener with it, or the frame outlives the copy and the scene leaks a handler.
    expect(helper).toContain("Phaser.GameObjects.Events.DESTROY");
    expect(helper).toContain("plaque.destroy()");
  });

  it("follows its text into a container", () => {
    // The score pop and the delivery phone both add their text to a container after it
    // is built. A scene-level plaque would be drawn under the whole container â€” behind
    // the phone chassis, in that case â€” and positioned in the wrong space.
    expect(helper).toMatch(/text\.parentContainer/);
    expect(helper).toMatch(/moveBelow/);
  });
});
