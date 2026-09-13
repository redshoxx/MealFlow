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
  const deep = [22, 61, 42, 255];
  const emerald = [43, 103, 68, 255];
  const ivory = [248, 246, 236, 255];
  const lime = [191, 227, 165, 255];

  for (let y = 0; y < SIZE; y += 1) {
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const radial = Math.min(1, Math.hypot(x - 390, y - 350) / 900);
      const vertical = y / (SIZE - 1);
      const gradient = Math.min(1, 0.18 + radial * 0.46 + vertical * 0.22);

      let color = withBackground
        ? [
            mix(deep[0], emerald[0], gradient),
            mix(deep[1], emerald[1], gradient),
            mix(deep[2], emerald[2], gradient),
            255,
          ]
        : [0, 0, 0, 0];

      // Main plate: a solid, high-contrast disc that remains legible at small sizes.
      const dx = x - 500;
      const dy = y - 530;
      if (Math.hypot(dx, dy) <= 285) color = ivory;

      // MealFlow check/flow mark.
      const checkA = distanceToSegment(x, y, 360, 535, 455, 625);
      const checkB = distanceToSegment(x, y, 455, 625, 655, 405);
      if (checkA <= 43 || checkB <= 43) color = deep;

      // A small fresh accent dot/leaf gives the mark its own identity.
      if (insideEllipse(x, y, 720, 315, 72, 50)) color = lime;

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
