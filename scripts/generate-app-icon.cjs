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

function insideRotatedEllipse(x, y, cx, cy, rx, ry, angle) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dx = x - cx;
  const dy = y - cy;
  const px = cos * dx + sin * dy;
  const py = -sin * dx + cos * dy;
  return (px * px) / (rx * rx) + (py * py) / (ry * ry) <= 1;
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

function mix(a, b, t) {
  return Math.round(a * (1 - t) + b * t);
}

function makePixels(withBackground) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const ivory = [249, 249, 244, 255];
  const lime = [190, 226, 168, 255];
  const deepGreen = [25, 68, 44, 255];
  const midGreen = [47, 107, 69, 255];

  for (let y = 0; y < SIZE; y += 1) {
    const vertical = y / (SIZE - 1);
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      const radial = Math.min(1, Math.hypot(x - 470, y - 420) / 760);
      const gradientT = Math.min(1, vertical * 0.52 + radial * 0.34);
      let color = withBackground
        ? [mix(deepGreen[0], midGreen[0], gradientT), mix(deepGreen[1], midGreen[1], gradientT), mix(deepGreen[2], midGreen[2], gradientT), 255]
        : [0, 0, 0, 0];

      const dx = x - 500;
      const dy = y - 535;
      const radius = Math.hypot(dx, dy);

      // Bold plate ring: clear at small icon sizes and visually tied to food.
      if (radius >= 242 && radius <= 316) color = ivory;

      // Planning/checkmark symbol inside the plate.
      const checkA = distanceToSegment(x, y, 350, 548, 455, 648);
      const checkB = distanceToSegment(x, y, 455, 648, 670, 414);
      if (checkA <= 34 || checkB <= 34) color = ivory;

      // Small leaf accent makes the icon feel fresh without adding clutter.
      if (insideRotatedEllipse(x, y, 710, 302, 98, 48, -0.66)) color = lime;
      if (distanceToSegment(x, y, 650, 350, 760, 250) <= 10) color = deepGreen;

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
