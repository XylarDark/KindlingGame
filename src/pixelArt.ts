import Phaser from "phaser";
import { Pal } from "./art/palette";
import { cells } from "./art/px";
import { UI_FONT } from "./ui/textResolution";

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
  stampKindling(scene, "tex-driver", 96, 36, 28, 136);
  stampKindling(scene, "tex-driver-sit", 112, 36, 28, 144);
  stampKindling(scene, "tex-keylead", 96, 184, 30, 126);
  receipt(scene);
  jar(scene, "tex-flower", 0x4a8a52, 0x3a2a18, true);
  jar(scene, "tex-edible", 0xc48496, 0x5a3040, false);
  jar(scene, "tex-preroll", 0xc4964a, 0x5a4020, false);
  pin(scene);
  crate(scene);
  phone(scene);
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
    cells(g, 6, 28, 12, 2, Pal.shadow);
    cells(g, 5, 8, 14, 20, Pal.cream);
    cells(g, 5, 8, 14, 4, 0xffffff);
    cells(g, 6, 10, 4, 14, Pal.wall);
    cells(g, 18, 10, 1, 16, Pal.creamSoft);
    cells(g, 5, 26, 14, 2, Pal.creamSoft);
    cells(g, 8, 2, 3, 7, Pal.creamSoft);
    cells(g, 13, 2, 3, 7, Pal.creamSoft);
    cells(g, 9, 1, 6, 3, Pal.wainscot);
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

/** People use 8px cells (2× world PX) so KINDLING can stamp as crisp Inter, not chunky NEAREST. */
const PEOPLE_PX = 8;
export const PERSON_W = 192;
export const PERSON_H = 352;
export const PERSON_HAT_H = 384;
export const PERSON_SIT_W = 224;
export const PERSON_SIT_H = 288;

function pcells(g: G, lx: number, ly: number, lw: number, lh: number, color: number, alpha = 1): void {
  g.fillStyle(color, alpha);
  g.fillRect(lx * PEOPLE_PX, ly * PEOPLE_PX, lw * PEOPLE_PX, lh * PEOPLE_PX);
}

function drawEyes(g: G, lx: number, ly: number, iris: number): void {
  pcells(g, lx, ly, 5, 5, Pal.eyeWhite);
  pcells(g, lx + 1, ly + 1, 4, 4, iris);
  pcells(g, lx + 2, ly + 2, 2, 3, Pal.ink);
  pcells(g, lx + 1, ly + 1, 1, 1, 0xffffff);
  pcells(g, lx + 6, ly, 5, 5, Pal.eyeWhite);
  pcells(g, lx + 7, ly + 1, 4, 4, iris);
  pcells(g, lx + 8, ly + 2, 2, 3, Pal.ink);
  pcells(g, lx + 7, ly + 1, 1, 1, 0xffffff);
}

function drawCap(g: G, hx: number, hy: number): void {
  pcells(g, hx - 3, hy, 18, 7, Pal.leaf);
  pcells(g, hx - 2, hy, 16, 2, Pal.leafDark);
  pcells(g, hx - 1, hy + 1, 14, 4, Pal.leafDark);
  pcells(g, hx, hy + 2, 12, 3, 0x1a301e);
  pcells(g, hx - 4, hy + 6, 20, 2, Pal.leafDark);
  pcells(g, hx - 4, hy + 6, 18, 1, Pal.leaf);
}

function stampKindling(scene: Phaser.Scene, key: string, cx: number, cy: number, fontSize: number, maxWidth: number): void {
  const frame = scene.textures.get(key).get();
  const w = frame.width;
  const h = frame.height;
  const label = scene.make.text({
    add: false,
    text: "KINDLING",
    style: {
      fontFamily: UI_FONT,
      fontSize: `${fontSize}px`,
      fontStyle: "700",
      color: "#fff6e0",
      stroke: "#0a1810",
      strokeThickness: 4,
    },
  });
  label.setResolution(4);
  label.setOrigin(0.5, 0.5);
  if (label.width > maxWidth) label.setScale(maxWidth / label.width);
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
      pcells(g, 7, 33 + dy, 4, 9, Pal.pant);
      pcells(g, 13, 33 + dy, 4, 9, Pal.pantDark);
      pcells(g, 6, 41 + dy, 5, 2, Pal.shoe);
      pcells(g, 13, 41 + dy, 5, 2, Pal.shoe);

      pcells(g, 4, 18 + dy, 16, 15, shirt);
      pcells(g, 18, 20 + dy, 2, 13, shirtDark);
      pcells(g, 1, 19 + dy, 3, 11, shirt);
      pcells(g, 20, 19 + dy, 3, 11, shirtDark);
      pcells(g, 1, 29 + dy, 3, 2, skin);
      pcells(g, 20, 29 + dy, 3, 2, Pal.skinDark);
      pcells(g, 7, 18 + dy, 10, 1, Pal.cream);
    } else {
      pcells(g, 6, 42 + dy, 12, 2, Pal.shadow);
      pcells(g, 8, 33 + dy, 3, 9, Pal.pant);
      pcells(g, 13, 33 + dy, 3, 9, Pal.pantDark);
      pcells(g, 7, 41 + dy, 4, 2, Pal.shoe);
      pcells(g, 13, 41 + dy, 4, 2, Pal.shoe);

      pcells(g, 6, 18 + dy, 12, 15, shirt);
      pcells(g, 17, 20 + dy, 2, 13, shirtDark);
      pcells(g, 3, 19 + dy, 3, 11, shirt);
      pcells(g, 18, 19 + dy, 3, 11, shirtDark);
      pcells(g, 3, 29 + dy, 3, 2, skin);
      pcells(g, 18, 29 + dy, 3, 2, Pal.skinDark);
    }

    pcells(g, 10, 16 + dy, 4, 3, Pal.skinDark);

    if (hat) {
      drawCap(g, 6, 0);
      pcells(g, 4, 6, 3, 6, hair);
      pcells(g, 17, 6, 3, 7, hair);
    } else {
      pcells(g, 4, 0, 16, 6, hair);
      pcells(g, 3, 2, 4, 10, hair);
      pcells(g, 17, 2, 4, 11, hair);
      pcells(g, 7, 0, 10, 3, hairLite);
      pcells(g, 10, 0, 3, 2, hair);
      pcells(g, 19, 6, 2, 8, hair);
      pcells(g, 20, 8, 1, 7, Pal.shadow);
      pcells(g, 4, 12, 3, 4, hair);
      pcells(g, 7, 4, 10, 3, hair);
    }

    pcells(g, 6, 4 + dy, 12, 13, skin);
    pcells(g, 5, 8 + dy, 2, 4, Pal.skinDark);
    pcells(g, 17, 8 + dy, 2, 4, Pal.skinDark);
    pcells(g, 6, 15 + dy, 12, 1, Pal.skinDark);
    if (!hat) pcells(g, 7, 4 + dy, 10, 3, hair);
    else pcells(g, 7, 4 + dy, 10, 2, Pal.leaf);

    drawEyes(g, 7, 7 + dy, iris);
    pcells(g, 11, 13 + dy, 2, 1, Pal.blush);
  });
}

function personSit(scene: Phaser.Scene): void {
  bake(scene, "tex-driver-sit", PERSON_SIT_W, PERSON_SIT_H, (g) => {
    pcells(g, 7, 34, 12, 2, Pal.shadow);
    pcells(g, 10, 28, 4, 7, Pal.pant);
    pcells(g, 15, 28, 4, 7, Pal.pantDark);
    pcells(g, 9, 33, 5, 2, Pal.shoe);
    pcells(g, 15, 33, 5, 2, Pal.shoe);

    pcells(g, 9, 18, 12, 11, Pal.rust);
    pcells(g, 2, 20, 8, 4, Pal.pant);
    pcells(g, 1, 21, 3, 3, Pal.shoe);
    pcells(g, 20, 19, 3, 8, Pal.rust);
    pcells(g, 21, 19, 2, 10, Pal.rustDark);
    pcells(g, 20, 26, 3, 2, Pal.skin);

    pcells(g, 13, 16, 4, 3, Pal.skinDark);

    drawCap(g, 8, 0);
    pcells(g, 6, 6, 3, 6, Pal.hairBlack);
    pcells(g, 21, 6, 3, 7, Pal.hairBlack);

    pcells(g, 8, 7, 12, 11, Pal.skin);
    pcells(g, 7, 11, 2, 4, Pal.skinDark);
    pcells(g, 19, 11, 2, 4, Pal.skinDark);
    pcells(g, 9, 7, 10, 2, Pal.leaf);

    drawEyes(g, 9, 10, Pal.amber);
    pcells(g, 13, 15, 2, 1, Pal.blush);
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
