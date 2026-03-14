export type RGB = [number, number, number]

export const PHOTO_PAINTER_PALETTE: Array<{ name: string; rgb: RGB }> = [
  { name: 'Black', rgb: [0, 0, 0] },
  { name: 'White', rgb: [255, 255, 255] },
  { name: 'Green', rgb: [0, 255, 0] },
  { name: 'Blue', rgb: [0, 0, 255] },
  { name: 'Red', rgb: [255, 0, 0] },
  { name: 'Yellow', rgb: [255, 255, 0] },
  { name: 'Orange', rgb: [255, 128, 0] },
]

const distanceSquared = (a: RGB, b: RGB) => {
  const dr = a[0] - b[0]
  const dg = a[1] - b[1]
  const db = a[2] - b[2]
  return dr * dr + dg * dg + db * db
}

export const nearestPaletteColor = (rgb: RGB): RGB => {
  let nearest = PHOTO_PAINTER_PALETTE[0].rgb
  let nearestDistance = Number.POSITIVE_INFINITY

  for (const { rgb: candidate } of PHOTO_PAINTER_PALETTE) {
    const distance = distanceSquared(rgb, candidate)
    if (distance < nearestDistance) {
      nearestDistance = distance
      nearest = candidate
    }
  }

  return nearest
}

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

      distributeError(buffer, width, height, x + 1, y, errorR, errorG, errorB, 7 / 16)
      distributeError(buffer, width, height, x - 1, y + 1, errorR, errorG, errorB, 3 / 16)
      distributeError(buffer, width, height, x, y + 1, errorR, errorG, errorB, 5 / 16)
      distributeError(buffer, width, height, x + 1, y + 1, errorR, errorG, errorB, 1 / 16)
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