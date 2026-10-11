const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 1024;

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function encodePng(pixels) {
  const rowSize = SIZE * 4 + 1;
  const raw = Buffer.alloc(rowSize * SIZE);
  for (let y = 0; y < SIZE; y += 1) {
    const row = y * rowSize;
    raw[row] = 0;
    pixels.copy(raw, row + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(SIZE, 0);
  ihdr.writeUInt32BE(SIZE, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

function distanceToSegment(px, py, ax, ay, bx, by) {
  const abx = bx - ax;
  const aby = by - ay;
  const apx = px - ax;
  const apy = py - ay;
  const lengthSquared = abx * abx + aby * aby;
  const t = lengthSquared ? Math.max(0, Math.min(1, (apx * abx + apy * aby) / lengthSquared)) : 0;
  const cx = ax + abx * t;
  const cy = ay + aby * t;
  return Math.hypot(px - cx, py - cy);
}

function insideEllipse(x, y, cx, cy, rx, ry) {
  const dx = (x - cx) / rx;
  const dy = (y - cy) / ry;
  return dx * dx + dy * dy <= 1;
}

function mix(a, b, t) {
  return Math.round(a * (1 - t) + b * t);
}

function makePixels(withBackground) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const deep = [7, 37, 31, 255];
  const emerald = [22, 89, 65, 255];
  const cream = [253, 252, 244, 255];
  const mint = [114, 230, 156, 255];

  // A recognizable bowl-and-leaf symbol, designed to remain sharp at 48px.
  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const glow = Math.min(1, Math.hypot(x - 260, y - 160) / 1100);
      const shade = Math.max(0, Math.min(1, 0.12 + glow * 0.55 + y / SIZE * 0.20));
      let color = withBackground
        ? [mix(emerald[0], deep[0], shade), mix(emerald[1], deep[1], shade), mix(emerald[2], deep[2], shade), 255]
        : [0, 0, 0, 0];

      // Three clean steam strokes – the central one merges into a leaf.
      const steamA = distanceToSegment(x, y, 398, 470, 422, 386);
      const steamB = distanceToSegment(x, y, 422, 386, 406, 323);
      const steamC = distanceToSegment(x, y, 510, 460, 522, 365);
      const steamD = distanceToSegment(x, y, 522, 365, 504, 305);
      if (Math.min(steamA, steamB, steamC, steamD) < 16) color = cream;

      // Fresh leaf: rotated, tapered oval above the rim.
      const lx = x - 628;
      const ly = y - 322;
      const ca = Math.cos(-0.63);
      const sa = Math.sin(-0.63);
      const along = lx * ca + ly * sa;
      const across = -lx * sa + ly * ca;
      const limit = 91 * Math.max(0, 1 - Math.abs(along) / 148);
      if (Math.abs(along) < 148 && Math.abs(across) < limit * 0.62) color = mint;
      // Subtle leaf vein.
      if (Math.abs(along) < 99 && Math.abs(across) < 4) color = emerald;

      // Thick white bowl silhouette with a smooth curved base.
      const dx = x - 512;
      const distance = Math.abs(dx) / 266;
      const top = 528 + distance * distance * 24;
      const bottom = 796 - distance * distance * 249;
      if (distance <= 1 && y >= top && y <= bottom) color = cream;

      // A strong elliptical white rim with a dark inner opening.
      if (insideEllipse(x, y, 512, 532, 267, 78)) color = cream;
      if (insideEllipse(x, y, 512, 529, 218, 42)) color = withBackground ? [18, 77, 58, 255] : [19, 73, 52, 255];

      // The bowl lip crosses in front of the opening.
      if (y >= 565 && y <= 582 && Math.abs(dx) <= 221 && insideEllipse(x, y, 512, 532, 268, 78)) color = cream;

      // Small carved curve on the front for depth.
      const carve = distanceToSegment(x, y, 402, 681, 483, 716);
      if (carve < 9) color = [190, 226, 203, 255];

      pixels[i] = color[0];
      pixels[i + 1] = color[1];
      pixels[i + 2] = color[2];
      pixels[i + 3] = color[3];
    }
  }
  return pixels;
}

function generateIcons() {
  const assets = path.resolve(__dirname, '..', 'assets');
  fs.mkdirSync(assets, { recursive: true });
  fs.writeFileSync(path.join(assets, 'icon.png'), encodePng(makePixels(true)));
  fs.writeFileSync(path.join(assets, 'adaptive-icon.png'), encodePng(makePixels(false)));
}

if (require.main === module) generateIcons();
module.exports = { generateIcons };
