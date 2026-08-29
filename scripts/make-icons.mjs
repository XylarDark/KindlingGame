import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const outDir = join(dirname(fileURLToPath(import.meta.url)), "..", "public");

function crc32(buf) {
  let c = ~0;
  for (const b of buf) {
    c ^= b;
    for (let i = 0; i < 8; i++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return ~c >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const head = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(head));
  return Buffer.concat([len, head, crc]);
}

function png(size, paint) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1);
    raw[row] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = paint(x, y, size);
      const i = row + 1 + x * 4;
      raw[i] = r;
      raw[i + 1] = g;
      raw[i + 2] = b;
      raw[i + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function icon(x, y, size) {
  const u = size / 32;
  const cx = size / 2;
  const cy = size / 2 + 1 * u;
  const dx = x - cx;
  const dy = y - cy;
  const r = Math.hypot(dx, dy);
  if (r > 15.2 * u) return [36, 28, 22, 255];
  if (r > 14.2 * u) return [90, 52, 28, 255];
  if (r > 13.2 * u) return [244, 232, 193, 255];
  const flame =
    Math.abs(dx) < 3.2 * u && dy < 2.4 * u && dy > -8.5 * u && Math.abs(dx) < 2.2 * u + (dy + 8.5 * u) * 0.18;
  if (flame) {
    const t = (dy + 8.5 * u) / (10.9 * u);
    return t < 0.45 ? [196, 160, 96, 255] : [200, 106, 56, 255];
  }
  return [61, 106, 68, 255];
}

function iconMaskable(x, y, size) {
  const inset = size * 0.12;
  const inner = size - inset * 2;
  if (x < inset || y < inset || x >= size - inset || y >= size - inset) {
    return [36, 28, 22, 255];
  }
  return icon(((x - inset) / inner) * size, ((y - inset) / inner) * size, size);
}

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "apple-touch-icon.png"), png(180, icon));
writeFileSync(join(outDir, "icon-192.png"), png(192, icon));
writeFileSync(join(outDir, "icon-512.png"), png(512, icon));
writeFileSync(join(outDir, "icon-192-maskable.png"), png(192, iconMaskable));
writeFileSync(join(outDir, "icon-512-maskable.png"), png(512, iconMaskable));
console.log(
  "wrote public/apple-touch-icon.png, icon-192.png, icon-512.png, icon-192-maskable.png, icon-512-maskable.png",
);
