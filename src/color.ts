export type RGB = [number, number, number]
type Lab = [number, number, number]

export const PHOTO_PAINTER_PALETTE: Array<{ name: string; rgb: RGB }> = [
  { name: 'Black', rgb: [0, 0, 0] },
  { name: 'White', rgb: [255, 255, 255] },
  { name: 'Green', rgb: [0, 255, 0] },
  { name: 'Blue', rgb: [0, 0, 255] },
  { name: 'Red', rgb: [255, 0, 0] },
  { name: 'Yellow', rgb: [255, 255, 0] },
  { name: 'Orange', rgb: [255, 128, 0] },
]

// --- Perceptual color distance via CIE L*a*b* ---

const rgbToLab = (rgb: RGB): Lab => {
  // Linearize sRGB
  const lin = (c: number) => {
    const n = c / 255
    return n > 0.04045 ? Math.pow((n + 0.055) / 1.055, 2.4) : n / 12.92
  }
  const r = lin(rgb[0])
  const g = lin(rgb[1])
  const b = lin(rgb[2])

  // sRGB → XYZ D65
  const x = (r * 0.4124564 + g * 0.3575761 + b * 0.1804375) / 0.95047
  const y = (r * 0.2126729 + g * 0.7151522 + b * 0.0721750) / 1.00000
  const z = (r * 0.0193339 + g * 0.1191920 + b * 0.9503041) / 1.08883

  // XYZ → L*a*b*
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

const labDistanceSquared = (a: Lab, b: Lab) => {
  const dL = a[0] - b[0]
  const da = a[1] - b[1]
  const db = a[2] - b[2]
  return dL * dL + da * da + db * db
}

// Pre-compute Lab values for the palette once
const PALETTE_LAB = PHOTO_PAINTER_PALETTE.map(({ rgb }) => rgbToLab(rgb))

export const nearestPaletteColor = (rgb: RGB): RGB => {
  const lab = rgbToLab(rgb)
  let nearest = PHOTO_PAINTER_PALETTE[0].rgb
  let nearestDistance = Number.POSITIVE_INFINITY

  for (let i = 0; i < PALETTE_LAB.length; i++) {
    const distance = labDistanceSquared(lab, PALETTE_LAB[i])
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = PHOTO_PAINTER_PALETTE[i].rgb
    }
  }

  return nearest
}

// --- Stucki dithering (wider error spread than Floyd-Steinberg) ---
//
//           *   8   4
//   2   4   8   4   2     ÷ 42
//   1   2   4   2   1

const STUCKI: Array<[dx: number, dy: number, weight: number]> = [
  [1, 0, 8 / 42],
  [2, 0, 4 / 42],
  [-2, 1, 2 / 42],
  [-1, 1, 4 / 42],
  [0, 1, 8 / 42],
  [1, 1, 4 / 42],
  [2, 1, 2 / 42],
  [-2, 2, 1 / 42],
  [-1, 2, 2 / 42],
  [0, 2, 4 / 42],
  [1, 2, 2 / 42],
  [2, 2, 1 / 42],
]

export const applyPaletteWithDithering = (imageData: ImageData): ImageData => {
  const { width, height, data } = imageData
  const buffer = new Float32Array(data.length)

  for (let index = 0; index < data.length; index += 1) {
    buffer[index] = data[index]
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const original: RGB = [buffer[index], buffer[index + 1], buffer[index + 2]]
      const mapped = nearestPaletteColor(original)

      data[index] = mapped[0]
      data[index + 1] = mapped[1]
      data[index + 2] = mapped[2]
      data[index + 3] = 255

      const errorR = original[0] - mapped[0]
      const errorG = original[1] - mapped[1]
      const errorB = original[2] - mapped[2]

      for (const [dx, dy, weight] of STUCKI) {
        distributeError(buffer, width, height, x + dx, y + dy, errorR, errorG, errorB, weight)
      }
    }
  }

  return imageData
}

const distributeError = (
  buffer: Float32Array,
  width: number,
  height: number,
  x: number,
  y: number,
  errorR: number,
  errorG: number,
  errorB: number,
  factor: number,
) => {
  if (x < 0 || x >= width || y < 0 || y >= height) {
    return
  }

  const index = (y * width + x) * 4
  buffer[index] = clamp(buffer[index] + errorR * factor)
  buffer[index + 1] = clamp(buffer[index + 1] + errorG * factor)
  buffer[index + 2] = clamp(buffer[index + 2] + errorB * factor)
}

const clamp = (value: number) => Math.max(0, Math.min(255, value))