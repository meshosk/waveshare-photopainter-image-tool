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

type MediaViewport = {
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

type CropViewportTransform = {
  crop: { x: number; y: number }
  zoom: number
  cropSize: { width: number; height: number }
  media: MediaViewport
}

export const renderCroppedImage = async (
  image: HTMLImageElement,
  croppedAreaPixels: Area,
  outputWidth: number,
  outputHeight: number,
  transform?: CropViewportTransform,
  rotationDeg = 0,
) => {
  const canvas = document.createElement('canvas')
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas 2D context is unavailable')
  }

  // Keep areas outside the source image white when the crop extends beyond image bounds.
  context.fillStyle = '#ffffff'
  context.fillRect(0, 0, outputWidth, outputHeight)

  context.imageSmoothingEnabled = true
  context.imageSmoothingQuality = 'high'

  if (transform) {
    const cropWidth = transform.cropSize.width
    const cropHeight = transform.cropSize.height

    if (cropWidth > 0 && cropHeight > 0) {
      const viewportCanvas = document.createElement('canvas')
      viewportCanvas.width = Math.round(cropWidth)
      viewportCanvas.height = Math.round(cropHeight)

      const viewportContext = viewportCanvas.getContext('2d')
      if (!viewportContext) {
        throw new Error('Canvas 2D context is unavailable')
      }

      viewportContext.fillStyle = '#ffffff'
      viewportContext.fillRect(0, 0, viewportCanvas.width, viewportCanvas.height)
      viewportContext.imageSmoothingEnabled = true
      viewportContext.imageSmoothingQuality = 'high'

      viewportContext.save()
      viewportContext.translate(
        viewportCanvas.width / 2 + transform.crop.x,
        viewportCanvas.height / 2 + transform.crop.y,
      )
      viewportContext.rotate((rotationDeg * Math.PI) / 180)
      viewportContext.scale(transform.zoom, transform.zoom)
      viewportContext.drawImage(
        image,
        -transform.media.width / 2,
        -transform.media.height / 2,
        transform.media.width,
        transform.media.height,
      )
      viewportContext.restore()

      context.drawImage(viewportCanvas, 0, 0, outputWidth, outputHeight)

      return context.getImageData(0, 0, outputWidth, outputHeight)
    }
  }

  const source = getCropSource(image, rotationDeg)
  const cropX = croppedAreaPixels.x
  const cropY = croppedAreaPixels.y
  const cropW = croppedAreaPixels.width
  const cropH = croppedAreaPixels.height

  if (cropW <= 0 || cropH <= 0) {
    return context.getImageData(0, 0, outputWidth, outputHeight)
  }

  const srcX = Math.max(0, cropX)
  const srcY = Math.max(0, cropY)
  const srcRight = Math.min(source.width, cropX + cropW)
  const srcBottom = Math.min(source.height, cropY + cropH)
  const srcW = srcRight - srcX
  const srcH = srcBottom - srcY

  if (srcW > 0 && srcH > 0) {
    const scaleX = outputWidth / cropW
    const scaleY = outputHeight / cropH
    const destX = (srcX - cropX) * scaleX
    const destY = (srcY - cropY) * scaleY
    const destW = srcW * scaleX
    const destH = srcH * scaleY

    context.drawImage(source.canvas, srcX, srcY, srcW, srcH, destX, destY, destW, destH)
  }

  return context.getImageData(0, 0, outputWidth, outputHeight)
}

const getCropSource = (image: HTMLImageElement, rotationDeg: number) => {
  const normalizedRotation = ((rotationDeg % 360) + 360) % 360
  if (normalizedRotation === 0) {
    const sourceCanvas = document.createElement('canvas')
    sourceCanvas.width = image.naturalWidth
    sourceCanvas.height = image.naturalHeight
    const sourceContext = sourceCanvas.getContext('2d')
    if (!sourceContext) {
      throw new Error('Canvas 2D context is unavailable')
    }

    sourceContext.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight)
    return {
      canvas: sourceCanvas,
      width: sourceCanvas.width,
      height: sourceCanvas.height,
    }
  }

  const radians = (normalizedRotation * Math.PI) / 180
  const cos = Math.abs(Math.cos(radians))
  const sin = Math.abs(Math.sin(radians))
  const rotatedWidth = Math.max(1, Math.round(image.naturalWidth * cos + image.naturalHeight * sin))
  const rotatedHeight = Math.max(1, Math.round(image.naturalWidth * sin + image.naturalHeight * cos))

  const rotatedCanvas = document.createElement('canvas')
  rotatedCanvas.width = rotatedWidth
  rotatedCanvas.height = rotatedHeight

  const rotatedContext = rotatedCanvas.getContext('2d')
  if (!rotatedContext) {
    throw new Error('Canvas 2D context is unavailable')
  }

  rotatedContext.fillStyle = '#ffffff'
  rotatedContext.fillRect(0, 0, rotatedWidth, rotatedHeight)
  rotatedContext.save()
  rotatedContext.translate(rotatedWidth / 2, rotatedHeight / 2)
  rotatedContext.rotate(radians)
  rotatedContext.drawImage(
    image,
    -image.naturalWidth / 2,
    -image.naturalHeight / 2,
    image.naturalWidth,
    image.naturalHeight,
  )
  rotatedContext.restore()

  return {
    canvas: rotatedCanvas,
    width: rotatedWidth,
    height: rotatedHeight,
  }
}