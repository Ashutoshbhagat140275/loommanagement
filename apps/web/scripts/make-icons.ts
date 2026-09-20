/**
 * Draws the app icons. Run with: pnpm -F @loom/web icons
 *
 * A tiny PNG writer rather than a toolchain: the icon is a flat colour with a
 * woven grid on it, which is a handful of loops, and this keeps a build-time
 * image dependency out of the project.
 */
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";

const BACKGROUND: RGB = [15, 23, 42]; // slate-900
const WARP: RGB = [71, 85, 105]; // slate-600, the threads held on the loom
const WEFT: RGB = [251, 191, 36]; // amber-400, the thread woven across

type RGB = [number, number, number];

const CRC_TABLE = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = value & 1 ? 0xed_b8_83_20 ^ (value >>> 1) : value >>> 1;
  }
  return value >>> 0;
});

function crc32(bytes: Buffer): number {
  let crc = 0xff_ff_ff_ff;
  for (const byte of bytes) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8);
  }
  return (crc ^ 0xff_ff_ff_ff) >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

/** RGBA pixels -> PNG bytes. */
function encodePng(size: number, pixels: Uint8Array): Buffer {
  const stride = size * 4;
  // Each scanline is prefixed with its filter type; 0 means "no filter".
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(
      raw,
      y * (stride + 1) + 1,
    );
  }

  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bits per channel
  header[9] = 6; // colour type 6: RGBA
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

/**
 * @param inset fraction of the edge to leave clear. Maskable icons get cropped
 *   to a circle by the launcher, so their motif has to sit well inside.
 */
function drawIcon(size: number, inset: number): Uint8Array {
  const pixels = new Uint8Array(size * size * 4);

  const put = (x: number, y: number, [r, g, b]: RGB) => {
    const offset = (y * size + x) * 4;
    pixels[offset] = r;
    pixels[offset + 1] = g;
    pixels[offset + 2] = b;
    pixels[offset + 3] = 255;
  };

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) put(x, y, BACKGROUND);
  }

  const margin = Math.round(size * inset);
  const span = size - margin * 2;
  const threads = 5;
  const gap = span / threads;
  const thickness = Math.max(2, Math.round(size * 0.045));

  // Warp: threads running down the loom.
  for (let index = 0; index < threads; index += 1) {
    const left = Math.round(margin + gap * index + (gap - thickness) / 2);
    for (let x = left; x < left + thickness; x += 1) {
      for (let y = margin; y < margin + span; y += 1) put(x, y, WARP);
    }
  }

  // Weft: the thread the weaver passes across, over and under the warp.
  for (let index = 0; index < threads; index += 1) {
    const top = Math.round(margin + gap * index + (gap - thickness) / 2);
    for (let y = top; y < top + thickness; y += 1) {
      for (let x = margin; x < margin + span; x += 1) {
        const overWarp = (Math.floor((x - margin) / gap) + index) % 2 === 0;
        if (overWarp) put(x, y, WEFT);
      }
    }
  }

  return pixels;
}

const outputDir = path.resolve(import.meta.dirname, "../public");
mkdirSync(outputDir, { recursive: true });

const icons: { file: string; size: number; inset: number }[] = [
  { file: "icon-192.png", size: 192, inset: 0.12 },
  { file: "icon-512.png", size: 512, inset: 0.12 },
  { file: "icon-maskable-512.png", size: 512, inset: 0.26 },
  { file: "apple-touch-icon.png", size: 180, inset: 0.14 },
];

for (const icon of icons) {
  const png = encodePng(icon.size, drawIcon(icon.size, icon.inset));
  writeFileSync(path.join(outputDir, icon.file), png);
  console.log(`${icon.file}  ${png.length} bytes`);
}
