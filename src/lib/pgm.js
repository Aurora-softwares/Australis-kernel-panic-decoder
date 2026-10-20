/** Minimal, bounded PGM (P2/P5, 8-bit) reader for kernel-generated QR test images. */
export function parsePgm(arrayBuffer) {
  const bytes = new Uint8Array(arrayBuffer)
  let offset = 0
  const white = c => c === 9 || c === 10 || c === 13 || c === 32
  function token() {
    while (offset < bytes.length) {
      if (white(bytes[offset])) { offset++; continue }
      if (bytes[offset] === 35) { // '#' comment
        while (offset < bytes.length && bytes[offset] !== 10) offset++
        continue
      }
      break
    }
    const begin = offset
    while (offset < bytes.length && !white(bytes[offset]) && bytes[offset] !== 35) offset++
    if (begin === offset) throw new Error('The PGM image header is incomplete.')
    return String.fromCharCode(...bytes.subarray(begin, Math.min(offset, begin + 40)))
  }
  const magic = token()
  if (magic !== 'P5' && magic !== 'P2') throw new Error('This PGM image must be an 8-bit P2 or P5 greyscale file.')
  const widthText = token(), heightText = token(), maxText = token()
  if (![widthText, heightText, maxText].every(x => /^\d+$/.test(x))) throw new Error('The PGM image header has invalid dimensions.')
  const width = Number(widthText), height = Number(heightText), max = Number(maxText)
  if (!Number.isSafeInteger(width) || !Number.isSafeInteger(height) || width < 1 || height < 1 ||
      width > 4000 || height > 4000 || width * height > 4_000_000 || max < 1 || max > 255) {
    throw new Error('The PGM image dimensions or bit depth are unsupported.')
  }
  const size = width * height
  const data = new Uint8Array(size)
  if (magic === 'P5') {
    if (offset >= bytes.length || !white(bytes[offset])) throw new Error('The PGM raster separator is missing.')
    // P5 has exactly one whitespace separator; CRLF counts as one line ending.
    if (bytes[offset++] === 13 && bytes[offset] === 10) offset++
    if (bytes.length - offset !== size) throw new Error('The PGM pixel data is missing or has an unexpected length.')
    data.set(bytes.subarray(offset, offset + size))
  } else {
    for (let index = 0; index < size; index++) {
      const valueText = token()
      if (!/^\d+$/.test(valueText)) throw new Error('A PGM pixel is invalid.')
      const value = Number(valueText)
      if (value > max) throw new Error('A PGM pixel exceeds the declared maximum.')
      data[index] = Math.round(value * 255 / max)
    }
  }
  if (magic === 'P5' && max !== 255) {
    for (let i = 0; i < size; i++) data[i] = Math.round(data[i] * 255 / max)
  }
  return { width, height, pixels: data }
}

/** Pad by 4 modules and scale small raw QR matrices for reliable decoding. */
export function pgmToRgba({ width, height, pixels }) {
  const border = 4
  const scale = Math.max(1, Math.min(12, Math.floor(720 / (Math.max(width, height) + 2 * border))))
  const outputWidth = (width + 2 * border) * scale
  const outputHeight = (height + 2 * border) * scale
  const rgba = new Uint8ClampedArray(outputWidth * outputHeight * 4)
  rgba.fill(255)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = pixels[y * width + x]
      for (let iy = 0; iy < scale; iy++) {
        for (let ix = 0; ix < scale; ix++) {
          const at = ((y + border) * scale + iy) * outputWidth * 4 + ((x + border) * scale + ix) * 4
          rgba[at] = rgba[at + 1] = rgba[at + 2] = color
        }
      }
    }
  }
  return { width: outputWidth, height: outputHeight, data: rgba }
}
