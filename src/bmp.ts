import { nearestPaletteColor } from './color'

export const imageDataToBmp = (imageData: ImageData): Uint8Array => {
  const { width, height, data } = imageData
  const rowStride = width * 3
  const rowPadding = (4 - (rowStride % 4)) % 4
  const pixelArraySize = (rowStride + rowPadding) * height
  const fileSize = 14 + 40 + pixelArraySize
  const output = new Uint8Array(fileSize)
  const view = new DataView(output.buffer)

  view.setUint8(0, 0x42)
  view.setUint8(1, 0x4d)
  view.setUint32(2, fileSize, true)
  view.setUint32(10, 54, true)
  view.setUint32(14, 40, true)
  view.setInt32(18, width, true)
  view.setInt32(22, height, true)
  view.setUint16(26, 1, true)
  view.setUint16(28, 24, true)
  view.setUint32(34, pixelArraySize, true)
  // Match Waveshare sample metadata values (96 DPI equivalent in px/m used by their tool output).
  view.setInt32(38, 3780, true)
  view.setInt32(42, 3780, true)

  let offset = 54

  for (let y = height - 1; y >= 0; y -= 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4
      const [r, g, b] = nearestPaletteColor([data[index], data[index + 1], data[index + 2]])
      output[offset] = b
      output[offset + 1] = g
      output[offset + 2] = r
      offset += 3
    }

    for (let padding = 0; padding < rowPadding; padding += 1) {
      output[offset] = 0
      offset += 1
    }
  }

  return output
}