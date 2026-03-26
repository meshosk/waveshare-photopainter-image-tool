import { useEffect, useState } from 'react'

export const useCropSize = (
  cropShellRef: React.RefObject<HTMLDivElement | null>,
  aspect: number,
  activeImageId: string | null,
) => {
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | undefined>(undefined)

  useEffect(() => {
    const element = cropShellRef.current
    if (!element) {
      return
    }

    const updateCropSize = () => {
      const bounds = element.getBoundingClientRect()
      if (bounds.width <= 0 || bounds.height <= 0) {
        return
      }

      const padding = 80
      const availableWidth = Math.max(220, bounds.width - padding)
      const availableHeight = Math.max(160, bounds.height - padding)

      let width = availableWidth
      let height = width / aspect

      if (height > availableHeight) {
        height = availableHeight
        width = height * aspect
      }

      setCropSize({
        width: Math.round(width),
        height: Math.round(height),
      })
    }

    updateCropSize()
    const observer = new ResizeObserver(updateCropSize)
    observer.observe(element)
    return () => observer.disconnect()
  }, [aspect, activeImageId, cropShellRef])

  return cropSize
}