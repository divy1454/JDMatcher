const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// Create PNG buffer from raw RGBA pixels
function createPng(width, height, rgbaBuffer) {
  // 1. Signature
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

  // 2. IHDR Chunk
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData.writeUInt8(8, 8); // 8-bit depth
  ihdrData.writeUInt8(6, 9); // Color type 6 (RGBA)
  ihdrData.writeUInt8(0, 10); // Compression
  ihdrData.writeUInt8(0, 11); // Filter
  ihdrData.writeUInt8(0, 12); // Interlace
  const ihdrChunk = makeChunk('IHDR', ihdrData);

  // 3. IDAT Chunk (Scanlines with filter byte 0)
  const scanlineLength = width * 4 + 1;
  const rawIdat = Buffer.alloc(height * scanlineLength);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * scanlineLength;
    rawIdat[rowOffset] = 0; // Filter type 0 (None)
    for (let x = 0; x < width; x++) {
      const srcOffset = (y * width + x) * 4;
      const destOffset = rowOffset + 1 + x * 4;
      rawIdat[destOffset] = rgbaBuffer[srcOffset]; // R
      rawIdat[destOffset + 1] = rgbaBuffer[srcOffset + 1]; // G
      rawIdat[destOffset + 2] = rgbaBuffer[srcOffset + 2]; // B
      rawIdat[destOffset + 3] = rgbaBuffer[srcOffset + 3]; // A
    }
  }

  const compressedIdat = zlib.deflateSync(rawIdat);
  const idatChunk = makeChunk('IDAT', compressedIdat);

  // 4. IEND Chunk
  const iendChunk = makeChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdrChunk, idatChunk, iendChunk]);
}

function makeChunk(type, data) {
  const len = data.length;
  const chunk = Buffer.alloc(4 + 4 + len + 4);
  chunk.writeUInt32BE(len, 0);
  chunk.write(type, 4, 4, 'ascii');
  data.copy(chunk, 8);
  const crc = crc32(chunk.subarray(4, 8 + len));
  chunk.writeInt32BE(crc, 8 + len);
  return chunk;
}

// CRC-32 table
const crcTable = [];
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    if (c & 1) c = 0xedb88320 ^ (c >>> 1);
    else c = c >>> 1;
  }
  crcTable[n] = c;
}

function crc32(buf) {
  let crc = -1;
  for (let i = 0; i < buf.length; i++) {
    crc = crcTable[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8);
  }
  return crc ^ -1;
}

// Render icon at specified size
function renderIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const radius = Math.floor(size * 0.24);
  const cx = size / 2;
  const cy = size / 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = (y * size + x) * 4;

      // Squircle distance
      const dx = Math.abs(x - cx);
      const dy = Math.abs(y - cy);
      const halfSize = (size - 2) / 2;

      // Rounded rect test
      const qx = Math.max(0, dx - (halfSize - radius));
      const qy = Math.max(0, dy - (halfSize - radius));
      const dist = Math.sqrt(qx * qx + qy * qy);

      if (dist <= radius) {
        // Gradient: Deep Sapphire to Electric Cyan
        const t = (x + y) / (2 * size);
        const r = Math.round(2 * (1 - t) + 6 * t);
        const g = Math.round(132 * (1 - t) + 182 * t);
        const b = Math.round(199 * (1 - t) + 212 * t);

        // Border highlight
        const isBorder = dist >= radius - 1.5 || dx >= halfSize - 1.5 || dy >= halfSize - 1.5;
        if (isBorder) {
          buf[idx] = 56; // #38BDF8
          buf[idx + 1] = 189;
          buf[idx + 2] = 248;
          buf[idx + 3] = 255;
        } else {
          // Inside chamber
          buf[idx] = Math.round(r * 0.35);
          buf[idx + 1] = Math.round(g * 0.45);
          buf[idx + 2] = Math.round(b * 0.65);
          buf[idx + 3] = 255;
        }

        // Draw Stylized 'J' and 'D' glyphs
        const nx = x / size;
        const ny = y / size;

        // J column
        if (nx >= 0.38 && nx <= 0.46 && ny >= 0.28 && ny <= 0.62) {
          buf[idx] = 240; buf[idx + 1] = 249; buf[idx + 2] = 255; buf[idx + 3] = 255;
        }
        // J hook bottom
        if (nx >= 0.28 && nx <= 0.46 && ny >= 0.58 && ny <= 0.66) {
          buf[idx] = 240; buf[idx + 1] = 249; buf[idx + 2] = 255; buf[idx + 3] = 255;
        }
        if (nx >= 0.28 && nx <= 0.36 && ny >= 0.50 && ny <= 0.62) {
          buf[idx] = 240; buf[idx + 1] = 249; buf[idx + 2] = 255; buf[idx + 3] = 255;
        }

        // D column
        if (nx >= 0.52 && nx <= 0.60 && ny >= 0.28 && ny <= 0.66) {
          buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; buf[idx + 3] = 255;
        }
        // D top bar
        if (nx >= 0.52 && nx <= 0.70 && ny >= 0.28 && ny <= 0.35) {
          buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; buf[idx + 3] = 255;
        }
        // D bottom bar
        if (nx >= 0.52 && nx <= 0.70 && ny >= 0.59 && ny <= 0.66) {
          buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; buf[idx + 3] = 255;
        }
        // D right curve
        if (nx >= 0.68 && nx <= 0.76 && ny >= 0.33 && ny <= 0.61) {
          buf[idx] = 255; buf[idx + 1] = 255; buf[idx + 2] = 255; buf[idx + 3] = 255;
        }

        // Cyan Match Sparkle dot at top right
        const sparkDist = Math.sqrt((nx - 0.78) ** 2 + (ny - 0.22) ** 2);
        if (sparkDist <= 0.08) {
          buf[idx] = 56; buf[idx + 1] = 189; buf[idx + 2] = 248; buf[idx + 3] = 255;
        }
      } else {
        // Transparent outside
        buf[idx] = 0; buf[idx + 1] = 0; buf[idx + 2] = 0; buf[idx + 3] = 0;
      }
    }
  }

  return createPng(size, size, buf);
}

// Generate 16, 32, 48, 128 icons
const sizes = [16, 32, 48, 128];
const dirs = [
  path.join(__dirname, '..', 'public', 'icons'),
  path.join(__dirname, '..', 'dist', 'icons'),
];

for (const dir of dirs) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

for (const size of sizes) {
  const pngData = renderIcon(size);
  for (const dir of dirs) {
    const filePath = path.join(dir, `icon${size}.png`);
    fs.writeFileSync(filePath, pngData);
    console.log(`Generated: ${filePath} (${size}x${size}, ${pngData.length} bytes)`);
  }
}

console.log('--- All Chrome Extension Icons Generated Successfully ---');
