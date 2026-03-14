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
    const renderedWidth = transform.media.width * transform.zoom
    const renderedHeight = transform.media.height * transform.zoom
    const cropWidth = transform.cropSize.width
    const cropHeight = transform.cropSize.height

    if (renderedWidth > 0 && renderedHeight > 0 && cropWidth > 0 && cropHeight > 0) {
      const mediaLeft = (cropWidth - renderedWidth) / 2 + transform.crop.x
      const mediaTop = (cropHeight - renderedHeight) / 2 + transform.crop.y
      const mediaRight = mediaLeft + renderedWidth
      const mediaBottom = mediaTop + renderedHeight

      const intersectionLeft = Math.max(0, mediaLeft)
      const intersectionTop = Math.max(0, mediaTop)
      const intersectionRight = Math.min(cropWidth, mediaRight)
      const intersectionBottom = Math.min(cropHeight, mediaBottom)
      const intersectionWidth = intersectionRight - intersectionLeft
      const intersectionHeight = intersectionBottom - intersectionTop

      if (intersectionWidth > 0 && intersectionHeight > 0) {
        const srcX = ((intersectionLeft - mediaLeft) / renderedWidth) * transform.media.naturalWidth
        const srcY = ((intersectionTop - mediaTop) / renderedHeight) * transform.media.naturalHeight
        const srcW = (intersectionWidth / renderedWidth) * transform.media.naturalWidth
        const srcH = (intersectionHeight / renderedHeight) * transform.media.naturalHeight

        const destX = (intersectionLeft / cropWidth) * outputWidth
        const destY = (intersectionTop / cropHeight) * outputHeight
        const destW = (intersectionWidth / cropWidth) * outputWidth
        const destH = (intersectionHeight / cropHeight) * outputHeight

        context.drawImage(image, srcX, srcY, srcW, srcH, destX, destY, destW, destH)
      }

      return context.getImageData(0, 0, outputWidth, outputHeight)
    }
  }

  const cropX = croppedAreaPixels.x
  const cropY = croppedAreaPixels.y
  const cropW = croppedAreaPixels.width
  const cropH = croppedAreaPixels.height

  if (cropW <= 0 || cropH <= 0) {
    return context.getImageData(0, 0, outputWidth, outputHeight)
  }

  const srcX = Math.max(0, cropX)
  const srcY = Math.max(0, cropY)
  const srcRight = Math.min(image.naturalWidth, cropX + cropW)
  const srcBottom = Math.min(image.naturalHeight, cropY + cropH)
  const srcW = srcRight - srcX
  const srcH = srcBottom - srcY

  if (srcW > 0 && srcH > 0) {
    const scaleX = outputWidth / cropW
    const scaleY = outputHeight / cropH
    const destX = (srcX - cropX) * scaleX
    const destY = (srcY - cropY) * scaleY
    const destW = srcW * scaleX
    const destH = srcH * scaleY

    context.drawImage(image, srcX, srcY, srcW, srcH, destX, destY, destW, destH)
  }

  return context.getImageData(0, 0, outputWidth, outputHeight)
}