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

function angleBetween(value, start, end) {
  const twoPi = Math.PI * 2;
  let a = (value + twoPi) % twoPi;
  let s = (start + twoPi) % twoPi;
  let e = (end + twoPi) % twoPi;
  if (s <= e) return a >= s && a <= e;
  return a >= s || a <= e;
}

function makePixels(withBackground) {
  const pixels = Buffer.alloc(SIZE * SIZE * 4);
  const offWhite = [247, 248, 244, 255];
  const accent = [191, 225, 173, 255];
  const green = [47, 107, 69, 255];
  for (let y = 0; y < SIZE; y += 1) {
    const t = y / (SIZE - 1);
    const bg = [Math.round(33 * (1 - t) + 59 * t), Math.round(79 * (1 - t) + 122 * t), Math.round(51 * (1 - t) + 80 * t), 255];
    for (let x = 0; x < SIZE; x += 1) {
      const i = (y * SIZE + x) * 4;
      let color = withBackground ? bg : [0, 0, 0, 0];
      const dx = x - 512;
      const dy = y - 512;
      const r = Math.hypot(dx, dy);
      if (withBackground && r < 350) color = green;
      if (Math.abs(r - 264) <= 27) color = offWhite;

      const a1x = x - 512;
      const a1y = y - 465;
      const a1r = Math.hypot(a1x, a1y);
      const a1 = Math.atan2(a1y, a1x);
      if (Math.abs(a1r - 150) <= 27 && angleBetween(a1, Math.PI * 0.92, Math.PI * 1.93)) color = offWhite;

      const a2x = x - 512;
      const a2y = y - 575;
      const a2r = Math.hypot(a2x, a2y);
      const a2 = Math.atan2(a2y, a2x);
      if (Math.abs(a2r - 150) <= 27 && angleBetween(a2, -Math.PI * 0.08, Math.PI * 0.93)) color = offWhite;

      if (insideRotatedEllipse(x, y, 682, 360, 82, 48, -0.58)) color = accent;
      if (insideRotatedEllipse(x, y, 682, 360, 62, 7, -0.58)) color = green;
      if ((x - 322) ** 2 + (y - 514) ** 2 <= 28 ** 2) color = accent;

      pixels[i] = color[0]; pixels[i + 1] = color[1]; pixels[i + 2] = color[2]; pixels[i + 3] = color[3];
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
