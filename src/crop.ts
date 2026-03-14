export type Orientation = 'landscape' | 'portrait'

export const OUTPUT_SIZES: Record<Orientation, { width: number; height: number }> = {
  landscape: { width: 800, height: 480 },
  portrait: { width: 480, height: 800 },
}

type Area = {
  x: number
  y: number
  width: number
  height: number
}

export const renderCroppedImage = async (
  image: HTMLImageElement,
  croppedAreaPixels: Area,
  outputWidth: number,
  outputHeight: number,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is unavailable')
  }

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'
  context.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    outputWidth,
    outputHeight,
  )

  return context.getImageData(0, 0, outputWidth, outputHeight)
}