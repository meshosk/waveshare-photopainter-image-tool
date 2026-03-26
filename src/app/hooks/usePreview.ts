import { useEffect, useState } from 'react'
import { applyPaletteWithDithering } from '../../color'
import { renderCroppedImage } from '../../crop'
import { getImageElement } from '../../image'
import { forceOpaqueWhite } from '../fileHelpers'
import type { ImageEntry } from '../types'

export const usePreview = (
  activeImage: ImageEntry | null,
  outputSize: { width: number; height: number },
) => {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl)
      }
    }
  }, [previewUrl])

  useEffect(() => {
    let isCancelled = false

    const renderPreview = async () => {
      if (!activeImage) {
        if (!isCancelled) {
          setPreviewUrl(null)
        }
        return
      }

      const previewImage = await getImageElement(activeImage.image.src)
      const cropped = await renderCroppedImage(
        previewImage,
        activeImage.croppedAreaPixels,
        outputSize.width,
        outputSize.height,
        undefined,
        activeImage.rotationDeg,
      )
      forceOpaqueWhite(cropped)
      const dithered = applyPaletteWithDithering(cropped)
      const canvas = document.createElement('canvas')
      canvas.width = outputSize.width
      canvas.height = outputSize.height
      const context = canvas.getContext('2d')

      if (!context) {
        throw new Error('Canvas 2D context is unavailable')
      }

      context.putImageData(dithered, 0, 0)
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result)
            return
          }
          reject(new Error('Unable to build preview blob'))
        }, 'image/png')
      })

      if (!isCancelled) {
        setPreviewUrl((current) => {
          if (current) {
            URL.revokeObjectURL(current)
          }
          return URL.createObjectURL(blob)
        })
      }
    }

    const timeout = window.setTimeout(() => {
      void renderPreview()
    }, 120)

    return () => {
      isCancelled = true
      window.clearTimeout(timeout)
    }
  }, [
    activeImage?.crop.x,
    activeImage?.crop.y,
    activeImage?.croppedAreaPixels.height,
    activeImage?.croppedAreaPixels.width,
    activeImage?.croppedAreaPixels.x,
    activeImage?.croppedAreaPixels.y,
    activeImage?.image.src,
    activeImage?.orientation,
    activeImage?.rotationDeg,
    activeImage?.zoom,
    outputSize.height,
    outputSize.width,
  ])

  return previewUrl
}