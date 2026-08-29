import Phaser from "phaser";
import { Pal } from "./art/palette";
import {
  PEOPLE_PX,
  PERSON_H,
  PERSON_HAT_H,
  PERSON_SIT_H,
  PERSON_SIT_W,
  PERSON_W,
} from "./art/peopleSize";
import { cells } from "./art/px";
import { MARK } from "./ui/copy";
import { fitTypeToWidth, makeType } from "./ui/typekit";

export { PEOPLE_PX, PERSON_H, PERSON_HAT_H, PERSON_SIT_H, PERSON_SIT_W, PERSON_W };

type G = Phaser.GameObjects.Graphics;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  const g = scene.add.graphics();
  g.setVisible(false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

export function generateTextures(scene: Phaser.Scene): void {
  roadH(scene);
  roadV(scene);
  roadCross(scene);
  grass(scene);
  shopTile(scene);
  houseTile(scene, "tex-house", Pal.kraftLite, Pal.woodDark);
  houseTile(scene, "tex-house-alt", Pal.creamSoft, Pal.dusk);
  houseTile(scene, "tex-house-3", 0xb09082, 0x5a3038);
  houseTile(scene, "tex-house-4", Pal.grassLite, Pal.leafDark);
  bag(scene);
  vehicle(scene);
  person(scene, "tex-keylead", "keylead", Pal.skin, Pal.hairBrown, Pal.leaf, Pal.hairBrownLite);
  person(scene, "tex-driver", "driver", Pal.skin, Pal.hairBlack, Pal.amber, Pal.hairBlackLite);
  person(scene, "tex-customer", "customer", Pal.skin, Pal.hairAuburn, Pal.glass, Pal.hairAuburnLite);
  personSit(scene);
  stampKindling(scene, "tex-driver", 96, 36, 13, 104);
  stampKindling(scene, "tex-driver-sit", 112, 36, 13, 120);
  stampKindling(scene, "tex-keylead", 96, 208, 26, 120);
  receipt(scene);
  jar(scene, "tex-flower", 0x4a8a52, 0x3a2a18, true);
  jar(scene, "tex-edible", 0xc48496, 0x5a3040, false);
  jar(scene, "tex-preroll", 0xc4964a, 0x5a4020, false);
  pin(scene);
  crate(scene);
  phone(scene);
  cog(scene);
  const people = new Set(["tex-keylead", "tex-driver", "tex-driver-sit", "tex-customer"]);
  for (const key of scene.textures.getTextureKeys()) {
    if (!key.startsWith("tex-")) continue;
    scene.textures.get(key).setFilter(
      people.has(key) ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST,
    );
  }
}

function roadH(scene: Phaser.Scene): void {
  bake(scene, "tex-road", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphaltDark);
    cells(g, 0, 2, 16, 12, Pal.asphalt);
    cells(g, 0, 3, 16, 10, Pal.asphaltLite);
    cells(g, 0, 0, 16, 1, Pal.curb);
    cells(g, 0, 15, 16, 1, Pal.curb);
    for (let x = 1; x < 16; x += 5) cells(g, x, 7, 3, 1, Pal.dash);
    cells(g, 4, 5, 1, 1, Pal.asphaltDark);
    cells(g, 11, 10, 1, 1, Pal.asphaltDark);
  });
}

function roadV(scene: Phaser.Scene): void {
  bake(scene, "tex-road-v", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphaltDark);
    cells(g, 2, 0, 12, 16, Pal.asphalt);
    cells(g, 3, 0, 10, 16, Pal.asphaltLite);
    cells(g, 0, 0, 1, 16, Pal.curb);
    cells(g, 15, 0, 1, 16, Pal.curb);
    for (let y = 1; y < 16; y += 5) cells(g, 7, y, 1, 3, Pal.dash);
  });
}

function roadCross(scene: Phaser.Scene): void {
  bake(scene, "tex-road-x", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphaltDark);
    cells(g, 2, 2, 12, 12, Pal.asphalt);
    cells(g, 3, 3, 10, 10, Pal.asphaltLite);
    cells(g, 0, 7, 16, 1, Pal.dash);
    cells(g, 7, 0, 1, 16, Pal.dash);
  });
}

function grass(scene: Phaser.Scene): void {
  bake(scene, "tex-wall", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.grass);
    for (let i = 0; i < 18; i++) {
      const x = (i * 3 + 1) % 16;
      const y = (i * 5 + 2) % 16;
      cells(g, x, y, 1, 1, i % 2 === 0 ? Pal.grassLite : Pal.grassDark);
    }
    cells(g, 2, 12, 3, 1, Pal.grassDark);
    cells(g, 11, 4, 2, 1, Pal.grassDark);
  });
}

function shopTile(scene: Phaser.Scene): void {
  bake(scene, "tex-shop", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.grass);
    cells(g, 2, 14, 12, 2, Pal.grassDark);
    cells(g, 1, 5, 14, 10, Pal.wall);
    cells(g, 1, 5, 14, 2, Pal.wood);
    cells(g, 1, 5, 14, 1, Pal.woodLight);
    cells(g, 7, 1, 2, 4, Pal.woodDark);
    cells(g, 2, 3, 12, 2, Pal.woodDark);
    cells(g, 4, 3, 8, 2, Pal.wood);
    cells(g, 3, 8, 3, 3, Pal.glass);
    cells(g, 10, 8, 3, 3, Pal.glass);
    cells(g, 3, 8, 3, 1, Pal.cream);
    cells(g, 10, 8, 3, 1, Pal.cream);
    cells(g, 7, 10, 2, 5, Pal.woodDark);
    cells(g, 8, 12, 1, 1, Pal.gold);
    cells(g, 2, 14, 12, 1, Pal.wood);
  });
}

function houseTile(scene: Phaser.Scene, key: string, wall: number, roof: number): void {
  bake(scene, key, 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.grass);
    cells(g, 1, 14, 14, 2, Pal.grassDark);
    cells(g, 7, 1, 2, 4, Pal.shadow);
    cells(g, 2, 5, 12, 2, roof);
    cells(g, 3, 4, 10, 2, roof);
    cells(g, 4, 3, 8, 2, roof);
    cells(g, 6, 2, 4, 2, roof);
    cells(g, 3, 6, 10, 8, wall);
    cells(g, 12, 7, 1, 7, Pal.shadow);
    cells(g, 4, 8, 2, 2, Pal.glass);
    cells(g, 10, 8, 2, 2, Pal.glass);
    cells(g, 4, 8, 2, 1, Pal.sun);
    cells(g, 10, 8, 2, 1, Pal.sun);
    cells(g, 7, 10, 2, 4, Pal.woodDark);
    cells(g, 8, 12, 1, 1, Pal.gold);
  });
}

function bag(scene: Phaser.Scene): void {
  bake(scene, "tex-bag", 96, 120, (g) => {
    cells(g, 4, 28, 16, 2, Pal.ink);
    cells(g, 4, 8, 16, 20, Pal.ink);
    cells(g, 5, 9, 14, 18, Pal.leaf);
    cells(g, 5, 9, 2, 18, Pal.leafDark);
    cells(g, 17, 9, 2, 18, Pal.leafDark);
    cells(g, 5, 24, 14, 3, Pal.leafDark);
    cells(g, 6, 2, 4, 7, Pal.ink);
    cells(g, 7, 3, 2, 5, Pal.leaf);
    cells(g, 14, 2, 4, 7, Pal.ink);
    cells(g, 15, 3, 2, 5, Pal.leaf);
  });
}

function vehicle(scene: Phaser.Scene): void {
  bake(scene, "tex-vehicle", 128, 80, (g) => {
    cells(g, 4, 16, 24, 3, Pal.shadow);
    cells(g, 4, 6, 24, 10, Pal.rustDark);
    cells(g, 5, 6, 22, 4, Pal.rust);
    cells(g, 5, 7, 9, 3, Pal.dusk);
    cells(g, 6, 7, 7, 1, Pal.glass);
    cells(g, 16, 8, 10, 6, Pal.woodDark);
    cells(g, 18, 9, 6, 4, Pal.shadow);
    cells(g, 4, 10, 1, 2, Pal.cream);
    cells(g, 27, 10, 1, 2, Pal.amber);
    cells(g, 6, 15, 5, 2, Pal.shoe);
    cells(g, 21, 15, 5, 2, Pal.shoe);
    cells(g, 15, 10, 2, 4, Pal.leaf);
    cells(g, 15, 11, 1, 1, Pal.lime);
  });
}

type Kit = "keylead" | "driver" | "customer";

/** Cap front panel — matches stampKindling stroke so KINDLING stays readable. */
const HAT_PANEL = 0x1a301e;

function pcells(g: G, lx: number, ly: number, lw: number, lh: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(lx * PEOPLE_PX, ly * PEOPLE_PX, lw * PEOPLE_PX, lh * PEOPLE_PX);
}

function drawEyes(g: G, lx: number, ly: number, iris: number): void {
  pcells(g, lx, ly, 6, 6, Pal.eyeWhite);
  pcells(g, lx + 7, ly, 6, 6, Pal.eyeWhite);
  pcells(g, lx + 1, ly + 1, 4, 5, iris);
  pcells(g, lx + 8, ly + 1, 4, 5, iris);
  pcells(g, lx + 1, ly + 4, 4, 1, Pal.ink);
  pcells(g, lx + 8, ly + 4, 4, 1, Pal.ink);
  pcells(g, lx + 2, ly + 2, 2, 2, Pal.ink);
  pcells(g, lx + 9, ly + 2, 2, 2, Pal.ink);
  pcells(g, lx + 1, ly + 1, 2, 2, Pal.cream);
  pcells(g, lx + 8, ly + 1, 2, 2, Pal.cream);
  pcells(g, lx + 4, ly + 3, 1, 1, Pal.eyeWhite);
  pcells(g, lx + 11, ly + 3, 1, 1, Pal.eyeWhite);
  pcells(g, lx, ly, 6, 1, Pal.ink);
  pcells(g, lx + 7, ly, 6, 1, Pal.ink);
}

function drawFace(g: G, ox: number, oy: number, iris: number, hair: number): void {
  pcells(g, ox, oy, 14, 15, Pal.skin);
  pcells(g, ox, oy + 6, 2, 5, Pal.skinDark);
  pcells(g, ox + 12, oy + 6, 2, 5, Pal.skinDark);
  pcells(g, ox + 3, oy + 14, 8, 1, Pal.skinDark);
  pcells(g, ox + 1, oy + 2, 5, 1, hair);
  pcells(g, ox + 8, oy + 2, 5, 1, hair);
  drawEyes(g, ox + 1, oy + 4, iris);
  pcells(g, ox + 6, oy + 10, 2, 1, Pal.skinDark);
  pcells(g, ox + 6, oy + 12, 2, 1, Pal.skinDark);
}

function drawHands(g: G, leftX: number, rightX: number, y: number, skin: number): void {
  pcells(g, leftX, y, 3, 2, skin);
  pcells(g, leftX + 1, y + 1, 1, 1, Pal.skinDark);
  pcells(g, rightX, y, 3, 2, Pal.skinDark);
  pcells(g, rightX + 1, y + 1, 1, 1, Pal.skin);
}

function drawShoes(g: G, lx: number, rx: number, y: number, w: number): void {
  pcells(g, lx, y, w, 2, Pal.shoe);
  pcells(g, rx, y, w, 2, Pal.shoe);
  pcells(g, lx, y, w - 1, 1, Pal.hairBlackLite);
  pcells(g, rx, y, w - 1, 1, Pal.hairBlackLite);
}

function drawPants(g: G, lx: number, rx: number, y: number, w: number, h: number): void {
  pcells(g, lx, y, w, h, Pal.pant);
  pcells(g, rx, y, w, h, Pal.pantDark);
}

function drawCollar(g: G, kit: Kit, shirt: number, shirtDark: number, dy: number): void {
  pcells(g, 10, 17 + dy, 4, 3, Pal.skinDark);
  pcells(g, 11, 17 + dy, 2, 1, Pal.skin);
  if (kit === "keylead") {
    pcells(g, 7, 19 + dy, 10, 2, Pal.cream);
    pcells(g, 8, 19 + dy, 8, 1, Pal.creamSoft);
    pcells(g, 11, 20 + dy, 2, 1, shirtDark);
  } else {
    pcells(g, 8, 19 + dy, 8, 2, shirtDark);
    pcells(g, 9, 19 + dy, 6, 1, shirt);
  }
}

function drawCap(g: G, hx: number, hy: number, front = 16): void {
  const crown = front + 4;
  const brim = front + 6;
  pcells(g, hx - 2, hy, crown - 2, 7, Pal.leaf);
  pcells(g, hx - 3, hy + 1, crown, 6, Pal.leaf);
  pcells(g, hx - 1, hy, crown - 4, 2, Pal.leafDark);
  pcells(g, hx, hy + 2, front - 2, 4, Pal.leafDark);
  pcells(g, hx, hy + 3, front - 2, 3, HAT_PANEL);
  pcells(g, hx - 4, hy + 6, brim, 2, Pal.leafDark);
  pcells(g, hx - 3, hy + 6, brim - 2, 1, Pal.leaf);
}

function drawHair(g: G, kit: Kit, hair: number, hairLite: number, hat: boolean): void {
  if (hat) {
    pcells(g, 4, 6, 3, 8, hair);
    pcells(g, 17, 6, 4, 9, hair);
    pcells(g, 3, 8, 2, 4, hair);
    pcells(g, 20, 9, 2, 5, hairLite);
    return;
  }
  pcells(g, 4, 0, 16, 6, hair);
  pcells(g, 3, 2, 4, 11, hair);
  pcells(g, 17, 1, 5, 13, hair);
  pcells(g, 6, 0, 10, 3, hairLite);
  if (kit === "customer") {
    pcells(g, 5, 0, 7, 3, hairLite);
    pcells(g, 18, 2, 4, 13, hair);
    pcells(g, 20, 8, 2, 8, hairLite);
    pcells(g, 3, 12, 3, 5, hair);
  } else {
    pcells(g, 9, 0, 3, 2, hair);
    pcells(g, 19, 6, 3, 9, hair);
    pcells(g, 20, 8, 2, 6, Pal.shadow);
    pcells(g, 3, 12, 3, 5, hair);
  }
}

function stampKindling(scene: Phaser.Scene, key: string, cx: number, cy: number, fontSize: number, maxWidth: number): void {
  const frame = scene.textures.get(key).get();
  const w = frame.width;
  const h = frame.height;
  const stroke = Math.max(3, Math.round(fontSize * 0.18));
  const label = makeType(scene, 0, 0, MARK, {
    size: `${fontSize}px`,
    fontStyle: "700",
    color: "#fff6e0",
    stroke: "#1a301e",
    strokeThickness: stroke,
    letterSpacing: Math.max(1, Math.round(fontSize * 0.08)),
  });
  label.setOrigin(0.5, 0.5);
  fitTypeToWidth(label, Math.max(24, maxWidth - 4), 12);
  const rt = scene.add.renderTexture(0, 0, w, h);
  rt.setVisible(false);
  rt.draw(key, 0, 0);
  rt.draw(label, cx, cy);
  scene.textures.remove(key);
  rt.saveTexture(key);
  label.destroy();
  rt.destroy();
}

function person(scene: Phaser.Scene, key: string, kit: Kit, skin: number, hair: number, iris: number, hairLite: number): void {
  const hat = kit === "driver";
  const dy = hat ? 4 : 0;
  const wide = kit === "keylead";
  bake(scene, key, PERSON_W, hat ? PERSON_HAT_H : PERSON_H, (g) => {
    const shirt = kit === "keylead" ? Pal.leaf : kit === "driver" ? Pal.rust : Pal.denim;
    const shirtDark = kit === "keylead" ? Pal.leafDark : kit === "driver" ? Pal.rustDark : Pal.denimDark;

    if (wide) {
      pcells(g, 4, 42 + dy, 16, 2, Pal.shadow);
      drawPants(g, 7, 13, 33 + dy, 4, 9);
      drawShoes(g, 6, 13, 41 + dy, 5);
      pcells(g, 4, 19 + dy, 16, 14, shirt);
      pcells(g, 18, 21 + dy, 2, 12, shirtDark);
      pcells(g, 1, 20 + dy, 3, 10, shirt);
      pcells(g, 20, 20 + dy, 3, 10, shirtDark);
      drawHands(g, 1, 20, 29 + dy, skin);
    } else {
      pcells(g, 6, 42 + dy, 12, 2, Pal.shadow);
      drawPants(g, 8, 13, 33 + dy, 3, 9);
      drawShoes(g, 7, 13, 41 + dy, 4);
      pcells(g, 6, 19 + dy, 12, 14, shirt);
      pcells(g, 16, 21 + dy, 2, 12, shirtDark);
      pcells(g, 3, 20 + dy, 3, 10, shirt);
      pcells(g, 18, 20 + dy, 3, 10, shirtDark);
      drawHands(g, 3, 18, 29 + dy, skin);
    }

    drawCollar(g, kit, shirt, shirtDark, dy);
    drawHair(g, kit, hair, hairLite, hat);
    if (hat) drawCap(g, 5, 0);
    drawFace(g, 5, 3 + dy, iris, hair);
    if (!hat) {
      pcells(g, 6, 3 + dy, 12, 2, hair);
      pcells(g, 7, 4 + dy, 4, 2, hairLite);
      pcells(g, 12, 4 + dy, 3, 1, hair);
    } else {
      pcells(g, 6, 3 + dy, 12, 1, Pal.leaf);
    }
  });
}

function personSit(scene: Phaser.Scene): void {
  bake(scene, "tex-driver-sit", PERSON_SIT_W, PERSON_SIT_H, (g) => {
    pcells(g, 8, 34, 12, 2, Pal.shadow);
    drawPants(g, 11, 16, 27, 5, 6);
    pcells(g, 11, 32, 4, 2, Pal.pant);
    pcells(g, 17, 32, 4, 2, Pal.pantDark);
    drawShoes(g, 10, 17, 33, 4);

    pcells(g, 10, 19, 12, 9, Pal.rust);
    pcells(g, 20, 20, 2, 8, Pal.rustDark);
    pcells(g, 11, 19, 8, 2, Pal.rustDark);
    pcells(g, 12, 19, 6, 1, Pal.rust);

    pcells(g, 7, 21, 3, 8, Pal.rust);
    pcells(g, 7, 28, 3, 2, Pal.skin);
    pcells(g, 8, 29, 1, 1, Pal.skinDark);
    pcells(g, 21, 21, 3, 8, Pal.rustDark);
    pcells(g, 21, 28, 3, 2, Pal.skin);
    pcells(g, 22, 29, 1, 1, Pal.skinDark);

    pcells(g, 13, 17, 4, 3, Pal.skinDark);
    pcells(g, 14, 17, 2, 1, Pal.skin);

    pcells(g, 6, 6, 3, 8, Pal.hairBlack);
    pcells(g, 21, 6, 4, 9, Pal.hairBlack);
    pcells(g, 22, 9, 2, 5, Pal.hairBlackLite);
    drawCap(g, 7, 0, 18);
    drawFace(g, 7, 5, Pal.amber, Pal.hairBlack);
    pcells(g, 8, 5, 12, 1, Pal.leaf);
  });
}

function jar(scene: Phaser.Scene, key: string, fillCol: number, lid: number, buds: boolean): void {
  bake(scene, key, 80, 112, (g) => {
    cells(g, 4, 25, 12, 2, Pal.shadow);
    cells(g, 5, 8, 10, 17, Pal.creamSoft);
    cells(g, 6, 10, 8, 14, fillCol);
    cells(g, 6, 10, 2, 12, 0xffffff);
    if (buds) {
      cells(g, 8, 14, 3, 3, Pal.leafDark);
      cells(g, 11, 17, 2, 2, fillCol);
    }
    cells(g, 4, 6, 12, 4, lid);
    cells(g, 6, 3, 8, 4, lid);
    cells(g, 7, 3, 6, 1, 0xffffff);
  });
}

function pin(scene: Phaser.Scene): void {
  bake(scene, "tex-pin", 64, 80, (g) => {
    cells(g, 6, 18, 4, 2, Pal.shadow);
    cells(g, 7, 10, 2, 9, Pal.leaf);
    cells(g, 5, 3, 6, 8, Pal.leaf);
    cells(g, 6, 4, 4, 6, Pal.leafDark);
    cells(g, 7, 5, 2, 3, Pal.cream);
    cells(g, 6, 4, 1, 1, 0xffffff);
  });
}

function receipt(scene: Phaser.Scene): void {
  bake(scene, "tex-receipt", 72, 96, (g) => {
    cells(g, 3, 22, 12, 2, Pal.shadow);
    cells(g, 3, 1, 12, 21, Pal.cream);
    cells(g, 3, 1, 12, 2, Pal.creamSoft);
    cells(g, 5, 4, 8, 1, Pal.ink);
    cells(g, 5, 7, 6, 1, Pal.woodTrim);
    cells(g, 5, 9, 7, 1, Pal.woodTrim);
    cells(g, 5, 11, 5, 1, Pal.woodTrim);
    cells(g, 5, 15, 7, 1, Pal.leaf);
  });
}

function crate(scene: Phaser.Scene): void {
  bake(scene, "tex-crate", 112, 72, (g) => {
    cells(g, 2, 16, 24, 2, Pal.shadow);
    cells(g, 2, 6, 24, 11, Pal.wood);
    cells(g, 3, 7, 22, 3, Pal.woodLight);
    cells(g, 2, 6, 24, 1, Pal.woodDark);
    cells(g, 4, 12, 20, 1, Pal.woodDark);
    cells(g, 2, 15, 24, 2, Pal.shadow);
    cells(g, 6, 2, 3, 5, Pal.woodTrim);
    cells(g, 19, 2, 3, 5, Pal.woodTrim);
  });
}

function cog(scene: Phaser.Scene): void {
  const metalHi = 0xe8eef2;
  const metalMid = 0xb4b8bc;
  const metalDark = 0x6e7070;
  const outline = 0x16181c;
  const shadow = 0x08090a;
  const sil = (g: G, ox: number, oy: number, color: number, expand = 0): void => {
    const e = expand;
    cells(g, 7 + ox - e, 1 + oy - e, 2 + e * 2, 3 + e * 2, color);
    cells(g, 7 + ox - e, 12 + oy - e, 2 + e * 2, 3 + e * 2, color);
    cells(g, 1 + ox - e, 7 + oy - e, 3 + e * 2, 2 + e * 2, color);
    cells(g, 12 + ox - e, 7 + oy - e, 3 + e * 2, 2 + e * 2, color);
    cells(g, 3 + ox - e, 3 + oy - e, 2 + e * 2, 2 + e * 2, color);
    cells(g, 11 + ox - e, 3 + oy - e, 2 + e * 2, 2 + e * 2, color);
    cells(g, 3 + ox - e, 11 + oy - e, 2 + e * 2, 2 + e * 2, color);
    cells(g, 11 + ox - e, 11 + oy - e, 2 + e * 2, 2 + e * 2, color);
    cells(g, 4 + ox - e, 4 + oy - e, 8 + e * 2, 8 + e * 2, color);
  };
  bake(scene, "tex-cog", 64, 64, (g) => {
    sil(g, 0, 0, outline, 1);
    sil(g, 1, 1, shadow, 0);
    cells(g, 7, 1, 2, 3, metalHi);
    cells(g, 7, 12, 2, 3, metalDark);
    cells(g, 1, 7, 3, 2, metalMid);
    cells(g, 12, 7, 3, 2, metalMid);
    cells(g, 3, 3, 2, 2, metalHi);
    cells(g, 11, 3, 2, 2, metalHi);
    cells(g, 3, 11, 2, 2, metalDark);
    cells(g, 11, 11, 2, 2, metalDark);
    cells(g, 4, 4, 8, 8, metalMid);
    cells(g, 5, 4, 6, 2, metalHi);
    cells(g, 4, 10, 8, 2, metalDark);
    cells(g, 5, 5, 6, 6, metalDark);
    cells(g, 6, 6, 4, 4, metalMid);
    cells(g, 7, 7, 2, 2, metalHi);
  });
}

function phone(scene: Phaser.Scene): void {
  bake(scene, "tex-phone", 56, 96, (g) => {
    cells(g, 2, 2, 10, 22, Pal.ink);
    cells(g, 3, 3, 8, 20, Pal.screen);
    cells(g, 4, 5, 6, 14, Pal.screen);
    cells(g, 5, 7, 4, 9, Pal.leaf);
    cells(g, 6, 10, 2, 2, Pal.lime);
    cells(g, 6, 3, 2, 1, Pal.dusk);
    cells(g, 6, 20, 2, 1, Pal.cream);
  });
}
