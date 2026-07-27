'use strict';

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const size = 512;
const pixels = Buffer.alloc(size * size * 4);

function insideRoundedRect(x, y, left, top, right, bottom, radius) {
  const cx = Math.max(left + radius, Math.min(x, right - radius));
  const cy = Math.max(top + radius, Math.min(y, bottom - radius));
  return (x - cx) ** 2 + (y - cy) ** 2 <= radius ** 2;
}

for (let y = 0; y < size; y++) {
  for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    if (!insideRoundedRect(x, y, 28, 28, 484, 484, 104)) continue;
    const mix = (x + y) / (size * 2);
    pixels[offset] = Math.round(55 - mix * 24);
    pixels[offset + 1] = Math.round(138 - mix * 45);
    pixels[offset + 2] = Math.round(246 - mix * 18);
    pixels[offset + 3] = 255;

    const body = insideRoundedRect(x, y, 142, 236, 370, 398, 28);
    const outerShackle = y >= 119 && y <= 282 && ((x - 256) ** 2 / 98 ** 2 + (y - 215) ** 2 / 104 ** 2 <= 1);
    const innerShackle = y >= 149 && y <= 282 && ((x - 256) ** 2 / 53 ** 2 + (y - 218) ** 2 / 68 ** 2 <= 1);
    if (body || (outerShackle && !innerShackle)) {
      pixels[offset] = 255; pixels[offset + 1] = 255; pixels[offset + 2] = 255; pixels[offset + 3] = 255;
    }
    const keyholeCircle = (x - 256) ** 2 + (y - 302) ** 2 <= 20 ** 2;
    const keyholeStem = x >= 246 && x <= 266 && y >= 302 && y <= 350;
    if (keyholeCircle || keyholeStem) {
      pixels[offset] = 39; pixels[offset + 1] = 102; pixels[offset + 2] = 218; pixels[offset + 3] = 255;
    }
  }
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4); length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])));
  return Buffer.concat([length, typeBuffer, data, crc]);
}

const scanlines = Buffer.alloc((size * 4 + 1) * size);
for (let y = 0; y < size; y++) pixels.copy(scanlines, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
const header = Buffer.alloc(13);
header.writeUInt32BE(size, 0); header.writeUInt32BE(size, 4);
header[8] = 8; header[9] = 6;
const png = Buffer.concat([
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
  chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(scanlines, { level: 9 })), chunk('IEND', Buffer.alloc(0))
]);
const output = path.join(__dirname, '..', 'build', 'icon.png');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, png);
console.log(`Generated ${output}`);
