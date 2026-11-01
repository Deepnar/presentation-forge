// Natural pixel size of an embedded raster, read from its header. PptxGenJS
// crops for cover/contain from the size it is told the image is, so without
// this every image is stretched to its box instead.

export interface PixelSize { w: number; h: number }

function png(b: Uint8Array): PixelSize | null {
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[2] !== 0x4e || b[3] !== 0x47) return null;
  const v = new DataView(b.buffer, b.byteOffset, b.byteLength);
  return { w: v.getUint32(16), h: v.getUint32(20) };
}

function gif(b: Uint8Array): PixelSize | null {
  if (b.length < 10 || b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  return { w: b[6] | (b[7] << 8), h: b[8] | (b[9] << 8) };
}

function jpeg(b: Uint8Array): PixelSize | null {
  if (b.length < 4 || b[0] !== 0xff || b[1] !== 0xd8) return null;
  let i = 2;
  while (i + 9 < b.length) {
    if (b[i] !== 0xff) { i++; continue; }
    const marker = b[i + 1];
    // Start-of-frame markers carry the dimensions; DHT, JPG and DAC share
    // the range and do not.
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
      return { h: (b[i + 5] << 8) | b[i + 6], w: (b[i + 7] << 8) | b[i + 8] };
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
    i += 2 + ((b[i + 2] << 8) | b[i + 3]);
  }
  return null;
}

function webp(b: Uint8Array): PixelSize | null {
  if (b.length < 30 || String.fromCharCode(...b.subarray(0, 4)) !== "RIFF" || String.fromCharCode(...b.subarray(8, 12)) !== "WEBP") return null;
  const chunk = String.fromCharCode(...b.subarray(12, 16));
  if (chunk === "VP8 ") return { w: ((b[26] | (b[27] << 8)) & 0x3fff), h: ((b[28] | (b[29] << 8)) & 0x3fff) };
  if (chunk === "VP8L") {
    const bits = b[21] | (b[22] << 8) | (b[23] << 16) | (b[24] << 24);
    return { w: (bits & 0x3fff) + 1, h: ((bits >> 14) & 0x3fff) + 1 };
  }
  if (chunk === "VP8X") {
    return { w: 1 + (b[24] | (b[25] << 8) | (b[26] << 16)), h: 1 + (b[27] | (b[28] << 8) | (b[29] << 16)) };
  }
  return null;
}

export function dataUriPixelSize(src: string): PixelSize | null {
  const match = /^data:image\/[a-z+.-]+;base64,(.*)$/is.exec(src);
  if (!match) return null;
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(Buffer.from(match[1], "base64")); } catch { return null; }
  const size = png(bytes) ?? jpeg(bytes) ?? gif(bytes) ?? webp(bytes);
  return size && size.w > 0 && size.h > 0 ? size : null;
}
