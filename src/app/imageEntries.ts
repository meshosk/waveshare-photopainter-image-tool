import type { Area } from 'react-easy-crop'
import { OUTPUT_SIZES, type Orientation } from '../crop'
import type { LoadedImage } from '../image'
import { INITIAL_CROP } from './constants'
import type { CropPoint, ImageEntry, MediaViewport, ProjectEntrySettings } from './types'

export function clampCrop(
  crop: CropPoint,
  cropSize: { width: number; height: number },
  mediaViewport: Pick<MediaViewport, 'width' | 'height'>,
  zoom: number,
): CropPoint {
  const renderedWidth = mediaViewport.width * zoom
  const renderedHeight = mediaViewport.height * zoom
  const maxX = Math.max(0, (renderedWidth - cropSize.width) / 2)
  const maxY = Math.max(0, (renderedHeight - cropSize.height) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, crop.x)),
    y: Math.max(-maxY, Math.min(maxY, crop.y)),
  }
}

export const createImageEntry = (image: LoadedImage, settings?: ProjectEntrySettings): ImageEntry => {
  const orientation: Orientation = 'landscape'
  const initialArea = createInitialArea(image, orientation)

  return {
    id: createId(),
    image,
    crop: settings?.crop ?? INITIAL_CROP,
    zoom: settings?.zoom ?? 1,
    croppedAreaPixels: settings?.croppedAreaPixels ?? initialArea,
    orientation: settings?.orientation ?? orientation,
    rotationDeg: settings?.rotationDeg ?? 0,
    mediaViewport: null,
    constrainToImage: settings?.constrainToImage ?? false,
  }
}

export const createInitialArea = (image: LoadedImage, orientation: Orientation): Area => {
  const ratio = OUTPUT_SIZES[orientation].width / OUTPUT_SIZES[orientation].height
  const imageRatio = image.width / image.height

  if (imageRatio > ratio) {
    const height = image.height
    const width = Math.round(height * ratio)
    return {
      x: Math.round((image.width - width) / 2),
      y: 0,
      width,
      height,
    }
  }

  const width = image.width
  const height = Math.round(width / ratio)
  return {
    x: 0,
    y: Math.round((image.height - height) / 2),
    width,
    height,
  }
}

export const normalizeRotation = (rotation: number) => {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}