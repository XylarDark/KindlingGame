import Phaser from "phaser";
import { Pal } from "./art/palette";
import {
  PEOPLE_PX,
  PERSON_H,
  PERSON_HAT_H,
  PERSON_SIT_H,
  PERSON_SIT_W,
  PERSON_W,
  PORTRAIT_H,
  PORTRAIT_W,
} from "./art/peopleSize";
import {
  crewFace,
  CUSTOMER_LOOKS,
  customerPortraitKey,
  customerPortraitKeys,
  customerTextureKey,
  customerTextureKeys,
  OUTFITS,
  type HairStyle,
  type Look,
} from "./art/people";
import {
  PHONE_CHASSIS_CELLS,
  PHONE_GLASS_CELLS,
  PHONE_HOME_CELLS,
  PHONE_ISLAND_CELLS,
  PHONE_PX,
  PHONE_STATUS_CELLS,
  PHONE_TEX,
} from "./art/phoneArt";
import { cells, PX } from "./art/px";
import { MARK } from "./ui/copy";
import { Color } from "./ui/theme";
import { fitTypeToWidth, makeType } from "./ui/typekit";

export { PEOPLE_PX, PERSON_H, PERSON_HAT_H, PERSON_SIT_H, PERSON_SIT_W, PERSON_W, PORTRAIT_H, PORTRAIT_W };

/** KINDLING on the driver's cap — 10% over the old 13.2 so it reads at arm's length. */
const DRIVER_MARK_PX = 14.52;

type G = Phaser.GameObjects.Graphics;

function bake(scene: Phaser.Scene, key: string, w: number, h: number, draw: (g: G) => void): void {
  const g = scene.add.graphics();
  g.setVisible(false);
  draw(g);
  g.generateTexture(key, w, h);
  g.destroy();
}

/**
 * @param crewSeed casts the driver and the key lead. Fixed for the whole page
 *   session — the seated driver has to be the same person as the standing one.
 */
export function generateTextures(scene: Phaser.Scene, crewSeed: number = Date.now()): void {
  roadH(scene);
  roadV(scene);
  roadCross(scene);
  parkingStall(scene);
  grass(scene);
  shopTile(scene);
  shopBuilding(scene);
  houseLot(scene, "tex-house", Pal.kraftLite, Pal.woodDark, Pal.wood, "gable");
  houseLot(scene, "tex-house-alt", Pal.creamSoft, Pal.dusk, 0x8a6a48, "ranch");
  houseLot(scene, "tex-house-3", 0xb09082, 0x5a3038, Pal.woodTrim, "town");
  houseLot(scene, "tex-house-4", Pal.grassLite, Pal.leafDark, Pal.leaf, "cottage");
  houseLot(scene, "tex-house-5", Pal.wall, Pal.rustDark, Pal.kraft, "twoStory");
  houseLot(scene, "tex-house-6", Pal.cream, 0x3a3858, Pal.denim, "modern");
  treeTile(scene);
  treeTileAlt(scene, "tex-tree-2", Pal.leaf, Pal.leafDark);
  treeTileAlt(scene, "tex-tree-3", Pal.grassLite, Pal.leaf);
  garageTile(scene);
  streetLamp(scene);
  parkedCar(scene, "tex-car", Pal.rustDark, Pal.rust);
  parkedCar(scene, "tex-car-2", Pal.denimDark, Pal.denim);
  hydrant(scene);
  mailbox(scene);
  bench(scene);
  bag(scene);
  counterBags(scene);
  vehicle(scene);
  // Crew wear Kindling colours, so only the face is cast; customers vary head to shirt.
  const driverLook: Look = { ...crewFace(crewSeed, "driver"), ...OUTFITS.rust };
  const keyLeadLook: Look = { ...crewFace(crewSeed, "keylead"), ...OUTFITS.leaf };
  person(scene, "tex-keylead", "keylead", keyLeadLook);
  person(scene, "tex-driver", "driver", driverLook);
  CUSTOMER_LOOKS.forEach((look, i) => {
    person(scene, customerTextureKey(i), "customer", look);
    personPortrait(scene, customerPortraitKey(i), look);
  });
  personSit(scene, driverLook);
  // cx values are the cap panel centres: standing panel spans 40–152px, seated 56–184px.
  // cy rides just above panel centre so the mark clears the brim and glasses.
  stampKindling(scene, "tex-driver", 96, 31, DRIVER_MARK_PX, 104);
  stampKindling(scene, "tex-driver-sit", 120, 31, DRIVER_MARK_PX, 120);
  stampKindling(scene, "tex-keylead", 96, 208, 23, 120);
  receipt(scene);
  jar(scene, "tex-flower", 0x4a8a52, 0x3a2a18, true);
  jar(scene, "tex-edible", 0xc48496, 0x5a3040, false);
  jar(scene, "tex-preroll", 0xc4964a, 0x5a4020, false);
  pin(scene);
  crate(scene);
  phone(scene);
  cog(scene);
  // People bake at 2× the world grid and are displayed under 1:1, so they want
  // LINEAR. Every appearance variant has to be in here or the pool renders
  // NEAREST and looks like it came from a different game.
  const people = new Set([
    "tex-keylead",
    "tex-driver",
    "tex-driver-sit",
    ...customerTextureKeys(),
    ...customerPortraitKeys(),
  ]);
  for (const key of scene.textures.getTextureKeys()) {
    if (!key.startsWith("tex-")) continue;
    scene.textures.get(key).setFilter(
      people.has(key) ? Phaser.Textures.FilterMode.LINEAR : Phaser.Textures.FilterMode.NEAREST,
    );
  }
}

function roadH(scene: Phaser.Scene): void {
  // North lane of a 2-tile EW street — curb + fog line on the outer (top) edge;
  // dashed yellow center line on the inner (bottom) edge meets the south lane.
  bake(scene, "tex-road-hn", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphalt);
    cells(g, 0, 0, 16, 1, Pal.curb);
    cells(g, 0, 1, 16, 1, Pal.creamSoft);
    for (let x = 0; x < 16; x += 8) cells(g, x + 1, 15, 5, 1, Pal.dash);
  });
  bake(scene, "tex-road-hs", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphalt);
    cells(g, 0, 15, 16, 1, Pal.curb);
    cells(g, 0, 14, 16, 1, Pal.creamSoft);
    for (let x = 0; x < 16; x += 8) cells(g, x + 1, 0, 5, 1, Pal.dash);
  });
  bake(scene, "tex-road", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphalt);
    cells(g, 0, 0, 16, 1, Pal.curb);
    cells(g, 0, 1, 16, 1, Pal.creamSoft);
    for (let x = 0; x < 16; x += 8) cells(g, x + 1, 8, 5, 1, Pal.dash);
  });
}

function roadV(scene: Phaser.Scene): void {
  bake(scene, "tex-road-vw", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphalt);
    cells(g, 0, 0, 1, 16, Pal.curb);
    cells(g, 1, 0, 1, 16, Pal.creamSoft);
    for (let y = 0; y < 16; y += 8) cells(g, 15, y + 1, 1, 5, Pal.dash);
  });
  bake(scene, "tex-road-ve", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphalt);
    cells(g, 15, 0, 1, 16, Pal.curb);
    cells(g, 14, 0, 1, 16, Pal.creamSoft);
    for (let y = 0; y < 16; y += 8) cells(g, 0, y + 1, 1, 5, Pal.dash);
  });
  bake(scene, "tex-road-v", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphalt);
    cells(g, 0, 0, 1, 16, Pal.curb);
    cells(g, 15, 0, 1, 16, Pal.curb);
    for (let y = 0; y < 16; y += 8) cells(g, 8, y + 1, 1, 5, Pal.dash);
  });
}

function roadCross(scene: Phaser.Scene): void {
  // 2×2 junction: zebra crosswalks on outer approaches, curb corners at lots,
  // stop bars — no center dashes through the intersection pad.
  const quad = (key: string, north: boolean, west: boolean): void => {
    bake(scene, key, 64, 64, (g) => {
      cells(g, 0, 0, 16, 16, Pal.asphalt);
      // Lot-facing curb corner.
      if (north && west) {
        cells(g, 0, 0, 4, 1, Pal.curb);
        cells(g, 0, 0, 1, 4, Pal.curb);
        cells(g, 1, 1, 2, 1, Pal.creamSoft);
        cells(g, 1, 1, 1, 2, Pal.creamSoft);
      }
      if (north && !west) {
        cells(g, 12, 0, 4, 1, Pal.curb);
        cells(g, 15, 0, 1, 4, Pal.curb);
        cells(g, 13, 1, 2, 1, Pal.creamSoft);
        cells(g, 14, 1, 1, 2, Pal.creamSoft);
      }
      if (!north && west) {
        cells(g, 0, 15, 4, 1, Pal.curb);
        cells(g, 0, 12, 1, 4, Pal.curb);
        cells(g, 1, 14, 2, 1, Pal.creamSoft);
        cells(g, 1, 13, 1, 2, Pal.creamSoft);
      }
      if (!north && !west) {
        cells(g, 12, 15, 4, 1, Pal.curb);
        cells(g, 15, 12, 1, 4, Pal.curb);
        cells(g, 13, 14, 2, 1, Pal.creamSoft);
        cells(g, 14, 13, 1, 2, Pal.creamSoft);
      }
      // Zebra crosswalks on outer edges.
      for (let i = 3; i <= 12; i += 2) {
        if (north) cells(g, i, 1, 1, 2, Pal.cream);
        if (!north) cells(g, i, 13, 1, 2, Pal.cream);
        if (west) cells(g, 1, i, 2, 1, Pal.cream);
        if (!west) cells(g, 13, i, 2, 1, Pal.cream);
      }
      // Stop bars just inside the zebra.
      if (north) cells(g, 3, 3, 10, 1, Pal.creamSoft);
      if (!north) cells(g, 3, 12, 10, 1, Pal.creamSoft);
      if (west) cells(g, 3, 3, 1, 10, Pal.creamSoft);
      if (!west) cells(g, 12, 3, 1, 10, Pal.creamSoft);
    });
  };
  quad("tex-road-x-nw", true, true);
  quad("tex-road-x-ne", true, false);
  quad("tex-road-x-sw", false, true);
  quad("tex-road-x-se", false, false);
  bake(scene, "tex-road-x", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphalt);
  });
}

function parkingStall(scene: Phaser.Scene): void {
  // Soft driveway pad — full asphalt tile so walkways can meet the lip cleanly.
  bake(scene, "tex-parking", 64, 64, (g) => {
    cells(g, 0, 0, 16, 16, Pal.asphalt);
    cells(g, 0, 0, 16, 1, Pal.asphaltLite);
    cells(g, 0, 15, 16, 1, Pal.asphaltDark);
    cells(g, 1, 2, 1, 12, Pal.asphaltLite);
    cells(g, 14, 2, 1, 12, Pal.asphaltDark);
  });
}

function grass(scene: Phaser.Scene): void {
  const speck = (g: G, seed: number): void => {
    cells(g, 0, 0, 16, 16, Pal.grass);
    for (let i = 0; i < 9; i++) {
      const x = (i * 5 + seed * 3 + 2) % 16;
      const y = (i * 7 + seed * 5 + 3) % 16;
      cells(g, x, y, 1, 1, i % 3 === 0 ? Pal.grassLite : Pal.grassDark);
    }
  };
  bake(scene, "tex-wall", 64, 64, (g) => speck(g, 0));
  bake(scene, "tex-wall-2", 64, 64, (g) => speck(g, 2));
  bake(scene, "tex-wall-3", 64, 64, (g) => speck(g, 5));
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

type HouseStyle = "gable" | "ranch" | "town" | "cottage" | "twoStory" | "modern";

function yard(g: G, w: number, h: number): void {
  cells(g, 0, 0, w, h, Pal.grass);
  for (let i = 0; i < 28; i++) {
    const x = (i * 5 + 2) % w;
    const y = (i * 7 + 3) % h;
    cells(g, x, y, 1, 1, i % 2 === 0 ? Pal.grassLite : Pal.grassDark);
  }
  cells(g, 2, h - 4, w - 4, 4, Pal.grassDark);
  cells(g, 3, h - 5, w - 6, 2, Pal.grassLite);
}

function windowPane(g: G, x: number, y: number, w: number, h: number): void {
  cells(g, x, y, w, h, Pal.glass);
  cells(g, x, y, w, 2, Pal.sun);
  cells(g, x + 1, y + 2, w - 2, h - 4, Pal.dusk);
}

/** Lot house — 48 logical pixels, Terraria-style block craft, distinct silhouettes. */
function houseLot(scene: Phaser.Scene, key: string, wall: number, roof: number, trim: number, style: HouseStyle): void {
  bake(scene, key, 192, 192, (g) => {
    yard(g, 48, 48);
    // Soft lot edge so the building meets grass instead of floating on a hard crop.
    cells(g, 1, 1, 46, 2, Pal.grassLite);
    cells(g, 1, 45, 46, 2, Pal.grassLite);
    cells(g, 1, 1, 2, 46, Pal.grassLite);
    cells(g, 45, 1, 2, 46, Pal.grassLite);
    if (style === "ranch") {
      cells(g, 3, 16, 42, 6, roof);
      cells(g, 5, 14, 38, 4, roof);
      cells(g, 8, 12, 32, 3, roof);
      cells(g, 4, 16, 40, 2, trim);
      cells(g, 5, 20, 38, 22, wall);
      cells(g, 40, 21, 3, 21, Pal.shadow);
      windowPane(g, 8, 24, 7, 7);
      windowPane(g, 18, 24, 7, 7);
      windowPane(g, 33, 24, 7, 7);
      cells(g, 4, 40, 40, 3, Pal.curb);
      cells(g, 20, 32, 8, 10, Pal.woodDark);
      cells(g, 21, 34, 6, 8, Pal.wood);
      cells(g, 24, 36, 1, 2, Pal.gold);
      cells(g, 18, 41, 12, 3, Pal.wall);
    } else if (style === "town") {
      cells(g, 10, 2, 28, 8, roof);
      cells(g, 8, 8, 32, 6, roof);
      cells(g, 9, 12, 30, 2, trim);
      cells(g, 10, 14, 28, 28, wall);
      cells(g, 35, 15, 3, 27, Pal.shadow);
      windowPane(g, 13, 17, 6, 8);
      windowPane(g, 29, 17, 6, 8);
      windowPane(g, 13, 28, 6, 6);
      cells(g, 9, 40, 30, 3, Pal.curb);
      cells(g, 20, 30, 8, 12, Pal.woodDark);
      cells(g, 21, 32, 6, 10, Pal.wood);
      cells(g, 24, 35, 1, 2, Pal.gold);
      cells(g, 18, 41, 12, 3, Pal.wall);
    } else if (style === "cottage") {
      cells(g, 16, 4, 16, 8, roof);
      cells(g, 10, 10, 28, 6, roof);
      cells(g, 6, 14, 36, 5, roof);
      cells(g, 7, 17, 34, 2, trim);
      cells(g, 10, 19, 28, 22, wall);
      cells(g, 34, 20, 4, 21, Pal.shadow);
      windowPane(g, 13, 22, 6, 6);
      windowPane(g, 29, 22, 6, 6);
      cells(g, 20, 30, 8, 11, Pal.woodDark);
      cells(g, 21, 32, 6, 9, Pal.wood);
      cells(g, 6, 36, 8, 5, Pal.leaf);
      cells(g, 36, 34, 7, 7, Pal.leafDark);
      cells(g, 24, 34, 1, 2, Pal.gold);
      cells(g, 9, 40, 30, 3, Pal.curb);
      cells(g, 18, 41, 12, 3, Pal.wall);
    } else if (style === "twoStory") {
      cells(g, 8, 4, 32, 6, roof);
      cells(g, 6, 8, 36, 5, roof);
      cells(g, 10, 2, 8, 6, Pal.shadow);
      cells(g, 11, 1, 6, 5, roof);
      cells(g, 7, 12, 34, 2, trim);
      cells(g, 8, 14, 32, 26, wall);
      cells(g, 36, 15, 4, 25, Pal.shadow);
      windowPane(g, 11, 17, 6, 6);
      windowPane(g, 31, 17, 6, 6);
      cells(g, 18, 16, 12, 6, Pal.wood);
      cells(g, 19, 17, 10, 4, Pal.dusk);
      windowPane(g, 11, 28, 6, 6);
      cells(g, 20, 30, 8, 10, Pal.woodDark);
      cells(g, 21, 32, 6, 8, Pal.wood);
      cells(g, 24, 34, 1, 2, Pal.gold);
      cells(g, 7, 40, 34, 3, Pal.curb);
      cells(g, 18, 41, 12, 3, Pal.wall);
    } else if (style === "modern") {
      cells(g, 6, 8, 36, 6, roof);
      cells(g, 6, 8, 36, 2, trim);
      cells(g, 8, 14, 32, 26, wall);
      cells(g, 36, 14, 4, 26, Pal.shadow);
      cells(g, 10, 16, 12, 16, Pal.glass);
      cells(g, 10, 16, 12, 3, Pal.sun);
      cells(g, 12, 20, 8, 10, Pal.dusk);
      windowPane(g, 28, 18, 8, 8);
      cells(g, 26, 32, 10, 8, Pal.woodDark);
      cells(g, 27, 34, 8, 6, Pal.wood);
      cells(g, 30, 36, 1, 2, Pal.gold);
      cells(g, 7, 40, 34, 3, Pal.curb);
      cells(g, 24, 41, 14, 3, Pal.wall);
    } else {
      cells(g, 20, 2, 8, 8, Pal.shadow);
      cells(g, 21, 1, 6, 6, roof);
      cells(g, 6, 10, 36, 7, roof);
      cells(g, 8, 8, 32, 5, roof);
      cells(g, 12, 6, 24, 4, roof);
      cells(g, 7, 15, 34, 2, trim);
      cells(g, 8, 17, 32, 23, wall);
      cells(g, 36, 18, 4, 22, Pal.shadow);
      windowPane(g, 11, 20, 7, 7);
      windowPane(g, 30, 20, 7, 7);
      cells(g, 20, 28, 8, 12, Pal.woodDark);
      cells(g, 21, 30, 6, 10, Pal.wood);
      cells(g, 24, 33, 1, 2, Pal.gold);
      cells(g, 12, 34, 5, 3, Pal.leaf);
      cells(g, 31, 34, 5, 3, Pal.leafDark);
      cells(g, 7, 40, 34, 3, Pal.curb);
      cells(g, 18, 41, 12, 3, Pal.wall);
    }
  });
}

function shopBuilding(scene: Phaser.Scene): void {
  bake(scene, "tex-shop-bldg", 320, 240, (g) => {
    yard(g, 80, 60);
    cells(g, 6, 10, 68, 42, Pal.wall);
    cells(g, 6, 10, 68, 8, Pal.wood);
    cells(g, 6, 10, 68, 3, Pal.woodLight);
    cells(g, 34, 2, 12, 10, Pal.woodDark);
    cells(g, 10, 5, 60, 7, Pal.woodDark);
    cells(g, 16, 5, 48, 7, Pal.wood);
    cells(g, 10, 20, 14, 12, Pal.glass);
    cells(g, 30, 20, 20, 12, Pal.glass);
    cells(g, 56, 20, 14, 12, Pal.glass);
    cells(g, 10, 20, 14, 3, Pal.cream);
    cells(g, 30, 20, 20, 3, Pal.cream);
    cells(g, 56, 20, 14, 3, Pal.cream);
    cells(g, 12, 24, 10, 7, Pal.dusk);
    cells(g, 33, 24, 14, 7, Pal.dusk);
    cells(g, 58, 24, 10, 7, Pal.dusk);
    cells(g, 34, 36, 12, 16, Pal.woodDark);
    cells(g, 36, 40, 8, 12, Pal.wood);
    cells(g, 39, 44, 2, 4, Pal.gold);
    cells(g, 8, 50, 64, 4, Pal.wood);
    cells(g, 24, 16, 32, 4, Pal.leaf);
    cells(g, 70, 12, 4, 40, Pal.shadow);
  });
}

function treeTile(scene: Phaser.Scene): void {
  // Transparent canvas — only trunk/canopy pixels, so trees never stamp a grass box over houses.
  bake(scene, "tex-tree", 64, 80, (g) => {
    cells(g, 7, 14, 2, 5, Pal.woodDark);
    cells(g, 6, 15, 4, 2, Pal.wood);
    cells(g, 4, 5, 8, 8, Pal.leafDark);
    cells(g, 5, 4, 6, 7, Pal.leaf);
    cells(g, 6, 3, 4, 4, Pal.grassLite);
    cells(g, 7, 6, 2, 2, Pal.leafDark);
  });
}

function treeTileAlt(scene: Phaser.Scene, key: string, leaf: number, dark: number): void {
  bake(scene, key, 64, 80, (g) => {
    cells(g, 7, 13, 2, 6, Pal.woodDark);
    cells(g, 6, 14, 4, 2, Pal.wood);
    cells(g, 3, 4, 10, 8, dark);
    cells(g, 4, 3, 8, 7, leaf);
    cells(g, 6, 2, 4, 3, Pal.grassLite);
  });
}

function garageTile(scene: Phaser.Scene): void {
  bake(scene, "tex-garage", 96, 80, (g) => {
    cells(g, 1, 6, 22, 12, Pal.wall);
    cells(g, 1, 4, 22, 3, Pal.asphaltDark);
    cells(g, 2, 3, 20, 2, Pal.curb);
    cells(g, 20, 6, 3, 12, Pal.shadow);
    cells(g, 3, 9, 16, 8, Pal.asphalt);
    cells(g, 3, 9, 16, 1, Pal.asphaltLite);
    cells(g, 4, 11, 14, 5, Pal.asphaltDark);
    cells(g, 5, 12, 3, 3, Pal.creamSoft);
    cells(g, 10, 12, 3, 3, Pal.creamSoft);
    cells(g, 15, 12, 3, 3, Pal.creamSoft);
    cells(g, 11, 16, 2, 1, Pal.gold);
  });
}

function streetLamp(scene: Phaser.Scene): void {
  bake(scene, "tex-lamp", 32, 80, (g) => {
    cells(g, 3, 16, 2, 4, Pal.asphaltDark);
    cells(g, 3, 4, 2, 13, Pal.ink);
    cells(g, 2, 2, 4, 3, Pal.gold);
    cells(g, 2, 1, 4, 1, Pal.cream);
  });
}

function parkedCar(scene: Phaser.Scene, key: string, body: number, roof: number): void {
  bake(scene, key, 96, 56, (g) => {
    cells(g, 1, 8, 22, 6, Pal.shadow);
    cells(g, 2, 4, 20, 8, body);
    cells(g, 5, 3, 12, 4, roof);
    cells(g, 6, 3, 4, 3, Pal.glass);
    cells(g, 13, 3, 4, 3, Pal.glass);
    cells(g, 3, 10, 4, 3, Pal.shoe);
    cells(g, 17, 10, 4, 3, Pal.shoe);
    cells(g, 2, 6, 1, 2, Pal.cream);
    cells(g, 21, 6, 1, 2, Pal.amber);
  });
}

function hydrant(scene: Phaser.Scene): void {
  bake(scene, "tex-hydrant", 32, 56, (g) => {
    cells(g, 2, 10, 4, 4, Pal.rustDark);
    cells(g, 3, 3, 2, 8, Pal.rust);
    cells(g, 2, 2, 4, 2, Pal.gold);
    cells(g, 1, 5, 6, 2, Pal.rustDark);
  });
}

function mailbox(scene: Phaser.Scene): void {
  bake(scene, "tex-mailbox", 32, 64, (g) => {
    cells(g, 3, 10, 2, 6, Pal.ink);
    cells(g, 1, 4, 6, 6, Pal.denim);
    cells(g, 2, 5, 4, 3, Pal.denimDark);
    cells(g, 6, 6, 1, 2, Pal.gold);
  });
}

function bench(scene: Phaser.Scene): void {
  bake(scene, "tex-bench", 64, 44, (g) => {
    cells(g, 1, 5, 14, 2, Pal.wood);
    cells(g, 1, 3, 14, 2, Pal.woodLight);
    cells(g, 2, 7, 2, 3, Pal.woodDark);
    cells(g, 12, 7, 2, 3, Pal.woodDark);
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

/**
 * Counter bags carry their own printed label, so they bake at 112×84 and draw
 * 1:1 — the sill above the counter caps the height, so the room for type had to
 * come from width. `tex-bag` stays the smaller sheet for the road and the door.
 */
const CBAG = { w: 28, h: 21, panelX: 4, panelY: 6, panelW: 20, panelH: 13 };
const COUNTER_BAG_PX = { w: CBAG.w * PX, h: CBAG.h * PX };

/** Kraft sack with a blank label panel — `stampText` prints the wording. */
function counterBag(scene: Phaser.Scene, key: string, panel: number): void {
  bake(scene, key, COUNTER_BAG_PX.w, COUNTER_BAG_PX.h, (g) => {
    cells(g, 1, 4, 26, 17, Pal.ink);
    cells(g, 2, 5, 24, 15, Pal.leaf);
    cells(g, 2, 5, 2, 15, Pal.leafDark);
    cells(g, 24, 5, 2, 15, Pal.leafDark);
    cells(g, 2, 19, 24, 1, Pal.leafDark);
    cells(g, CBAG.panelX, CBAG.panelY, CBAG.panelW, CBAG.panelH, panel);
    cells(g, CBAG.panelX, CBAG.panelY + CBAG.panelH - 1, CBAG.panelW, 1, Pal.creamSoft);
    // Handles over the sack mouth, drawn last so they read in front of it.
    cells(g, 7, 0, 5, 6, Pal.ink);
    cells(g, 8, 1, 3, 4, Pal.leaf);
    cells(g, 16, 0, 5, 6, Pal.ink);
    cells(g, 17, 1, 3, 4, Pal.leaf);
  });
}

/**
 * The four labelled counter bags. Fixed wording bakes into the pixels: it stays
 * on the grid, costs no Text object, and tints with the sprite when the supply
 * bag flashes as the next tap. Only the live counts stay as Text.
 */
function counterBags(scene: Phaser.Scene): void {
  const mid = COUNTER_BAG_PX.w / 2;
  const panelTop = CBAG.panelY * PX;
  const panelBottom = (CBAG.panelY + CBAG.panelH) * PX;
  const panelW = CBAG.panelW * PX - 8;
  /** Lower band of the panel; the count owns the taller band above it. */
  const wordCy = panelBottom - 9;
  const ink = { color: Color.inkHex, strokeThickness: 0 };

  counterBag(scene, "tex-bag-cream", Pal.cream);
  counterBag(scene, "tex-bag-lime", Pal.lime);
  stampText(scene, "tex-bag-cream", "tex-bag-bags", "BAGS", mid, (panelTop + panelBottom) / 2, 30, panelW, ink);
  stampText(scene, "tex-bag-lime", "tex-bag-pack", "TAP TO\nPACK", mid, (panelTop + panelBottom) / 2, 19, panelW, ink);
  stampText(scene, "tex-bag-cream", "tex-bag-delivery", "DELIVERY", mid, wordCy, 15, panelW, ink);
  stampText(scene, "tex-bag-cream", "tex-bag-pickup", "PICKUP", mid, wordCy, 15, panelW, ink);
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

function drawFace(g: G, ox: number, oy: number, look: Look): void {
  pcells(g, ox, oy, 14, 15, look.skin);
  pcells(g, ox, oy + 6, 2, 5, look.skinDark);
  pcells(g, ox + 12, oy + 6, 2, 5, look.skinDark);
  pcells(g, ox + 3, oy + 14, 8, 1, look.skinDark);
  pcells(g, ox + 1, oy + 2, 5, 1, look.hair);
  pcells(g, ox + 8, oy + 2, 5, 1, look.hair);
  drawEyes(g, ox + 1, oy + 4, look.iris);
  pcells(g, ox + 6, oy + 10, 2, 1, look.skinDark);
  pcells(g, ox + 6, oy + 12, 2, 1, look.skinDark);
}

function drawHands(g: G, leftX: number, rightX: number, y: number, skin: number, skinDark: number): void {
  pcells(g, leftX, y, 3, 2, skin);
  pcells(g, leftX + 1, y + 1, 1, 1, skinDark);
  pcells(g, rightX, y, 3, 2, skinDark);
  pcells(g, rightX + 1, y + 1, 1, 1, skin);
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

function drawCollar(g: G, kit: Kit, look: Look, dy: number): void {
  pcells(g, 10, 17 + dy, 4, 3, look.skinDark);
  pcells(g, 11, 17 + dy, 2, 1, look.skin);
  if (kit === "keylead") {
    pcells(g, 7, 19 + dy, 10, 2, Pal.cream);
    pcells(g, 8, 19 + dy, 8, 1, Pal.creamSoft);
    pcells(g, 11, 20 + dy, 2, 1, look.shirtDark);
  } else {
    pcells(g, 8, 19 + dy, 8, 2, look.shirtDark);
    pcells(g, 9, 19 + dy, 6, 1, look.shirt);
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

/**
 * Hair, drawn before the face so the face crops the scalp back to the hairline.
 * That leaves the crown band (rows 0–2) and the temples (columns 3–4 and 19–21)
 * carrying the silhouette, which is what actually reads at 24 logical pixels —
 * colour alone does not distinguish two people across a shop floor.
 */
function drawHair(g: G, style: HairStyle, hair: number, hairLite: number, hat: boolean, dy = 0): void {
  const y = (row: number): number => row + dy;
  if (hat) {
    // Under a cap only the sides show; length is the one cue left.
    const long = style === "long" || style === "coils";
    pcells(g, 4, y(6), 3, long ? 12 : 8, hair);
    pcells(g, 17, y(6), 4, long ? 13 : 9, hair);
    pcells(g, 3, y(8), 2, 4, hair);
    pcells(g, 20, y(9), 2, long ? 9 : 5, hairLite);
    if (style === "bun") {
      pcells(g, 18, y(12), 4, 4, hair);
      pcells(g, 19, y(13), 2, 2, hairLite);
    }
    return;
  }
  if (style === "crop") {
    pcells(g, 5, y(1), 14, 5, hair);
    pcells(g, 6, y(1), 12, 2, hairLite);
    pcells(g, 3, y(3), 3, 7, hair);
    pcells(g, 19, y(3), 3, 8, hair);
    pcells(g, 20, y(5), 2, 4, hairLite);
    return;
  }
  if (style === "swept") {
    pcells(g, 4, y(0), 16, 6, hair);
    pcells(g, 5, y(0), 9, 3, hairLite);
    pcells(g, 14, y(0), 2, 4, hair);
    pcells(g, 3, y(2), 3, 10, hair);
    pcells(g, 18, y(1), 4, 12, hair);
    pcells(g, 20, y(4), 2, 7, hairLite);
    return;
  }
  if (style === "bun") {
    // Knot above the crown, everything else tucked in tight.
    pcells(g, 9, y(0), 6, 3, hair);
    pcells(g, 10, y(0), 4, 1, hairLite);
    pcells(g, 5, y(2), 14, 4, hair);
    pcells(g, 7, y(2), 10, 1, hairLite);
    pcells(g, 4, y(3), 2, 5, hair);
    pcells(g, 19, y(3), 2, 6, hair);
    pcells(g, 19, y(8), 3, 4, hair);
    pcells(g, 20, y(9), 2, 2, hairLite);
    return;
  }
  if (style === "coils") {
    // Volume plus dabbed texture — a rounded outline, not a helmet.
    pcells(g, 4, y(0), 16, 6, hair);
    pcells(g, 3, y(1), 18, 5, hair);
    pcells(g, 2, y(3), 4, 8, hair);
    pcells(g, 18, y(2), 4, 10, hair);
    for (let i = 0; i < 7; i++) pcells(g, 4 + i * 2, y(i % 2 === 0 ? 0 : 1), 1, 1, hairLite);
    pcells(g, 3, y(4), 1, 2, hairLite);
    pcells(g, 20, y(5), 1, 3, hairLite);
    pcells(g, 19, y(11), 3, 3, hair);
    return;
  }
  // long
  pcells(g, 4, y(0), 16, 6, hair);
  pcells(g, 3, y(2), 4, 11, hair);
  pcells(g, 17, y(1), 5, 13, hair);
  pcells(g, 6, y(0), 10, 3, hairLite);
  pcells(g, 5, y(0), 7, 3, hairLite);
  pcells(g, 18, y(2), 4, 13, hair);
  pcells(g, 20, y(8), 2, 8, hairLite);
  pcells(g, 3, y(12), 3, 5, hair);
}

/** Hairline over the forehead, drawn after the face so it lands on top of it. */
function drawFringe(g: G, style: HairStyle, hair: number, hairLite: number, dy: number): void {
  if (style === "crop") {
    pcells(g, 6, 3 + dy, 12, 1, hair);
    pcells(g, 7, 3 + dy, 5, 1, hairLite);
    return;
  }
  if (style === "swept") {
    pcells(g, 6, 3 + dy, 12, 2, hair);
    pcells(g, 7, 4 + dy, 5, 1, hairLite);
    pcells(g, 13, 3 + dy, 5, 2, hair);
    return;
  }
  if (style === "bun") {
    pcells(g, 6, 3 + dy, 12, 1, hair);
    pcells(g, 6, 3 + dy, 5, 1, hairLite);
    return;
  }
  if (style === "coils") {
    pcells(g, 6, 3 + dy, 12, 2, hair);
    pcells(g, 8, 4 + dy, 1, 1, hairLite);
    pcells(g, 12, 4 + dy, 1, 1, hairLite);
    pcells(g, 15, 4 + dy, 1, 1, hairLite);
    return;
  }
  pcells(g, 6, 3 + dy, 12, 2, hair);
  pcells(g, 7, 4 + dy, 4, 2, hairLite);
  pcells(g, 12, 4 + dy, 3, 1, hair);
}

interface StampStyle {
  color?: string;
  stroke?: string;
  strokeThickness?: number;
  letterSpacing?: number;
}

/**
 * Bake wording into a texture. Pass a different `outKey` to keep the source
 * sheet intact, so one bake can carry several printed labels.
 */
function stampText(
  scene: Phaser.Scene,
  srcKey: string,
  outKey: string,
  content: string,
  cx: number,
  cy: number,
  fontSize: number,
  maxWidth: number,
  style: StampStyle = {},
): void {
  const frame = scene.textures.get(srcKey).get();
  const w = frame.width;
  const h = frame.height;
  const box = Math.max(24, maxWidth - 4);
  const lines = content.split("\n").length;
  const label = makeType(scene, 0, 0, content, {
    size: `${fontSize}px`,
    fontStyle: "700",
    color: style.color ?? "#fff6e0",
    stroke: style.stroke ?? "#1a301e",
    strokeThickness: style.strokeThickness ?? Math.max(3, Math.round(fontSize * 0.18)),
    letterSpacing: style.letterSpacing,
    align: "center",
    noWrap: lines > 1,
    maxWidth: box,
    maxHeight: Math.max(16, Math.round(fontSize * 1.4 * lines)),
  });
  label.setOrigin(0.5, 0.5);
  fitTypeToWidth(label, box);
  const rt = scene.add.renderTexture(0, 0, w, h);
  rt.setVisible(false);
  rt.draw(srcKey, 0, 0);
  rt.draw(label, cx, cy);
  if (outKey === srcKey) scene.textures.remove(outKey);
  rt.saveTexture(outKey);
  label.destroy();
  rt.destroy();
}

function stampKindling(scene: Phaser.Scene, key: string, cx: number, cy: number, fontSize: number, maxWidth: number): void {
  stampText(scene, key, key, MARK, cx, cy, fontSize, maxWidth, {
    letterSpacing: Math.max(1, Math.round(fontSize * 0.08)),
  });
}

function person(scene: Phaser.Scene, key: string, kit: Kit, look: Look): void {
  const hat = kit === "driver";
  const dy = hat ? 4 : 0;
  const wide = kit === "keylead";
  bake(scene, key, PERSON_W, hat ? PERSON_HAT_H : PERSON_H, (g) => {
    if (wide) {
      pcells(g, 4, 42 + dy, 16, 2, Pal.shadow);
      drawPants(g, 7, 13, 33 + dy, 4, 9);
      drawShoes(g, 6, 13, 41 + dy, 5);
      pcells(g, 4, 19 + dy, 16, 14, look.shirt);
      pcells(g, 18, 21 + dy, 2, 12, look.shirtDark);
      pcells(g, 1, 20 + dy, 3, 10, look.shirt);
      pcells(g, 20, 20 + dy, 3, 10, look.shirtDark);
      drawHands(g, 1, 20, 29 + dy, look.skin, look.skinDark);
    } else {
      pcells(g, 6, 42 + dy, 12, 2, Pal.shadow);
      drawPants(g, 8, 13, 33 + dy, 3, 9);
      drawShoes(g, 7, 13, 41 + dy, 4);
      pcells(g, 6, 19 + dy, 12, 14, look.shirt);
      pcells(g, 16, 21 + dy, 2, 12, look.shirtDark);
      pcells(g, 3, 20 + dy, 3, 10, look.shirt);
      pcells(g, 18, 20 + dy, 3, 10, look.shirtDark);
      drawHands(g, 3, 18, 29 + dy, look.skin, look.skinDark);
    }

    drawCollar(g, kit, look, dy);
    drawHair(g, look.hairStyle, look.hair, look.hairLite, hat);
    if (hat) drawCap(g, 5, 0);
    drawFace(g, 5, 3 + dy, look);
    if (!hat) drawFringe(g, look.hairStyle, look.hair, look.hairLite, dy);
    else pcells(g, 6, 3 + dy, 12, 1, Pal.leaf);
  });
}

/**
 * Head-and-shoulders for the ID card. Deliberately the *same* head as the
 * standing sprite, drawn with the same helpers at the same cell size, so the
 * photo and the person at the door cannot drift apart as the art changes.
 */
/** Rows of headroom in the portrait, so a bun or coils never touch the frame. */
const PORTRAIT_DY = 5;

function personPortrait(scene: Phaser.Scene, key: string, look: Look): void {
  const backdrop = 0xbecad3;
  const backdropLow = 0x94a6b4;
  const rows = PORTRAIT_H / PEOPLE_PX;
  bake(scene, key, PORTRAIT_W, PORTRAIT_H, (g) => {
    // Studio sweep: light behind the head, falling off behind the shoulders, so
    // the head is not floating on a flat card.
    pcells(g, 0, 0, 24, rows, backdrop);
    pcells(g, 0, rows - 9, 24, 9, backdropLow);
    pcells(g, 0, rows - 11, 5, 11, backdropLow);
    pcells(g, 19, rows - 12, 5, 12, backdropLow);
    pcells(g, 4, 19 + PORTRAIT_DY, 16, rows - 19 - PORTRAIT_DY, look.shirt);
    pcells(g, 16, 20 + PORTRAIT_DY, 4, rows - 20 - PORTRAIT_DY, look.shirtDark);
    pcells(g, 3, 21 + PORTRAIT_DY, 2, rows - 21 - PORTRAIT_DY, look.shirtDark);
    drawCollar(g, "customer", look, PORTRAIT_DY);
    drawHair(g, look.hairStyle, look.hair, look.hairLite, false, PORTRAIT_DY);
    drawFace(g, 5, 3 + PORTRAIT_DY, look);
    drawFringe(g, look.hairStyle, look.hair, look.hairLite, PORTRAIT_DY);
  });
}

function personSit(scene: Phaser.Scene, look: Look): void {
  bake(scene, "tex-driver-sit", PERSON_SIT_W, PERSON_SIT_H, (g) => {
    pcells(g, 8, 34, 12, 2, Pal.shadow);
    drawPants(g, 11, 16, 27, 5, 6);
    pcells(g, 11, 32, 4, 2, Pal.pant);
    pcells(g, 17, 32, 4, 2, Pal.pantDark);
    drawShoes(g, 10, 17, 33, 4);

    pcells(g, 10, 19, 12, 9, look.shirt);
    pcells(g, 20, 20, 2, 8, look.shirtDark);
    pcells(g, 11, 19, 8, 2, look.shirtDark);
    pcells(g, 12, 19, 6, 1, look.shirt);

    pcells(g, 7, 21, 3, 8, look.shirt);
    pcells(g, 7, 28, 3, 2, look.skin);
    pcells(g, 8, 29, 1, 1, look.skinDark);
    pcells(g, 21, 21, 3, 8, look.shirtDark);
    pcells(g, 21, 28, 3, 2, look.skin);
    pcells(g, 22, 29, 1, 1, look.skinDark);

    pcells(g, 13, 17, 4, 3, look.skinDark);
    pcells(g, 14, 17, 2, 1, look.skin);

    pcells(g, 6, 6, 3, 8, look.hair);
    pcells(g, 21, 6, 4, 9, look.hair);
    pcells(g, 22, 9, 2, 5, look.hairLite);
    drawCap(g, 7, 0, 18);
    drawFace(g, 7, 5, look);
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
  // Floating destination chevron — tip points down at the stall.
  bake(scene, "tex-pin", 64, 80, (g) => {
    const fill = Pal.amber;
    const deep = Pal.rustDark;
    const hi = Pal.sun;
    // Soft ground shadow under the tip
    cells(g, 5, 18, 6, 2, Pal.shadow);
    // Shaft
    cells(g, 6, 2, 4, 8, fill);
    cells(g, 7, 2, 2, 8, hi);
    cells(g, 6, 2, 4, 1, hi);
    // Broad arrow head pointing down
    cells(g, 2, 10, 12, 2, fill);
    cells(g, 3, 12, 10, 2, fill);
    cells(g, 4, 14, 8, 2, fill);
    cells(g, 5, 16, 6, 2, fill);
    cells(g, 6, 18, 4, 1, fill);
    cells(g, 7, 19, 2, 1, deep);
    // Edge / depth
    cells(g, 2, 10, 1, 2, deep);
    cells(g, 13, 10, 1, 2, deep);
    cells(g, 3, 12, 1, 2, deep);
    cells(g, 12, 12, 1, 2, deep);
    cells(g, 7, 11, 2, 5, hi);
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

/** One 8px phone cell. Finer than the 4px world grid — see `art/phoneArt.ts`. */
function phcells(g: G, lx: number, ly: number, lw: number, lh: number, color: number): void {
  g.fillStyle(color, 1);
  g.fillRect(lx * PHONE_PX, ly * PHONE_PX, lw * PHONE_PX, lh * PHONE_PX);
}

function phone(scene: Phaser.Scene): void {
  const chassis = PHONE_CHASSIS_CELLS;
  const glass = PHONE_GLASS_CELLS;
  const status = PHONE_STATUS_CELLS;
  const island = PHONE_ISLAND_CELLS;
  const home = PHONE_HOME_CELLS;
  const rimLite = 0x6a707c;
  const rim = 0x3a3f49;
  const rimDark = 0x1c1f25;
  const bezel = 0x07070b;
  const screen = 0x0d1218;
  const pip = 0xa6b0b8;
  const pipDim = 0x59636b;

  // Canvas is derived from the cell grid, so the art fits it exactly and the
  // chassis lands dead centre — the old bake clipped three edges and skewed
  // every ring, hit box and inset hung off it.
  bake(scene, "tex-phone", PHONE_TEX.w, PHONE_TEX.h, (g) => {
    const right = chassis.x + chassis.w;
    const bottom = chassis.y + chassis.h;
    // Polished band, corners stepped in one cell for the rounded shell. The band is
    // the bezel: one cell of it, so the glass reaches almost to the edge.
    phcells(g, chassis.x + 1, chassis.y, chassis.w - 2, 1, rimLite);
    phcells(g, chassis.x, chassis.y + 1, chassis.w, chassis.h - 2, rim);
    phcells(g, chassis.x + 1, bottom - 1, chassis.w - 2, 1, rimDark);
    phcells(g, chassis.x, chassis.y + 1, 1, chassis.h - 2, rimLite);
    phcells(g, right - 1, chassis.y + 1, 1, chassis.h - 2, rimDark);

    // Side buttons live in the margin columns the old bake was clipping off.
    phcells(g, chassis.x - 1, 8, 1, 2, rim);
    phcells(g, chassis.x - 1, 12, 1, 3, rimLite);
    phcells(g, chassis.x - 1, 16, 1, 3, rimLite);
    phcells(g, right, 11, 1, 5, rimLite);

    // Matte black under the glass, so the corners the band steps around stay dark.
    phcells(g, glass.x, glass.y, glass.w, glass.h, bezel);
    phcells(g, glass.x, glass.y, glass.w, glass.h, screen);

    // Status bar sits on a lifted ground, or the black island vanishes into the glass.
    phcells(g, status.x, status.y, status.w, status.h, 0x161d24);
    // Signal: ascending bars. Battery: a filled cell with a dim tip.
    phcells(g, status.x + 1, status.y + 1, 1, 1, pipDim);
    phcells(g, status.x + 2, status.y, 1, 2, pip);
    phcells(g, status.x + 3, status.y, 1, 2, pip);
    const battery = status.x + status.w - 4;
    phcells(g, battery, status.y, 3, 2, pip);
    phcells(g, battery + 3, status.y + 1, 1, 1, pipDim);

    // Dynamic island: a plain pill, narrowed on its top row, with one lens dot.
    phcells(g, island.x + 1, island.y, island.w - 2, 1, bezel);
    phcells(g, island.x, island.y + 1, island.w, 1, bezel);
    phcells(g, island.x + island.w - 3, island.y + 1, 1, 1, 0x2a3f4e);

    phcells(g, home.x + 6, home.y, home.w - 12, 1, 0x4c515a);
  });
}

