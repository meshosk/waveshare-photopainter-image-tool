import type { Area } from 'react-easy-crop'
import { MAX_ZOOM, MIN_ZOOM, INITIAL_CROP } from './constants'
import { createImageEntry, createInitialArea, normalizeRotation } from './imageEntries'
import type {
  ImageEntry,
  ProjectBuildProgress,
  ProjectEntrySettings,
  ProjectImportProgress,
  ProjectImportResult,
} from './types'
import type { LoadedImage } from '../image'
import { releaseImage } from '../image'

export const buildProjectPayload = async (
  images: ImageEntry[],
  onProgress?: (progress: ProjectBuildProgress) => void,
): Promise<PhotoPainterProjectPayload> => {
  const uniqueEntries: ImageEntry[] = []
  const knownHashes = new Set<string>()

  for (const entry of images) {
    if (knownHashes.has(entry.image.hash)) {
      continue
    }

    knownHashes.add(entry.image.hash)
    uniqueEntries.push(entry)
  }

  const imageRecords = new Map<string, PhotoPainterProjectPayload['images'][number]>()

  for (let index = 0; index < uniqueEntries.length; index += 1) {
    const entry = uniqueEntries[index]
    onProgress?.({
      current: index + 1,
      total: uniqueEntries.length,
      imageName: entry.image.name,
    })

    const bytes = new Uint8Array(await entry.image.blob.arrayBuffer())
    imageRecords.set(entry.image.hash, {
      hash: entry.image.hash,
      name: entry.image.name,
      mimeType: entry.image.mimeType,
      width: entry.image.width,
      height: entry.image.height,
      dataBase64: uint8ToBase64(bytes),
    })
  }

  return {
    app: 'photopainter-converter',
    exportedAt: new Date().toISOString(),
    images: [...imageRecords.values()],
    entries: images.map((entry) => ({
      imageHash: entry.image.hash,
      crop: { x: entry.crop.x, y: entry.crop.y },
      zoom: entry.zoom,
      croppedAreaPixels: {
        x: entry.croppedAreaPixels.x,
        y: entry.croppedAreaPixels.y,
        width: entry.croppedAreaPixels.width,
        height: entry.croppedAreaPixels.height,
      },
      orientation: entry.orientation,
      rotationDeg: entry.rotationDeg,
      constrainToImage: entry.constrainToImage,
    })),
  }
}

export const isProjectPayload = (value: unknown): value is PhotoPainterProjectPayload => {
  if (!value || typeof value !== 'object') {
    return false
  }

  const candidate = value as Partial<PhotoPainterProjectPayload>
  if (candidate.app !== 'photopainter-converter') {
    return false
  }

  if (!Array.isArray(candidate.images) || !Array.isArray(candidate.entries)) {
    return false
  }

  return true
}

export const importProjectPayload = async (
  payload: PhotoPainterProjectPayload,
  existingHashes: Iterable<string>,
  onProgress?: (progress: ProjectImportProgress) => void,
): Promise<ProjectImportResult> => {
  const decodedByHash = new Map<string, LoadedImage>()
  let decodeFailed = 0

  for (let index = 0; index < payload.images.length; index += 1) {
    const projectImage = payload.images[index]
    onProgress?.({
      phase: 'decoding',
      current: index + 1,
      total: payload.images.length,
      imageName: projectImage.name,
    })

    if (decodedByHash.has(projectImage.hash)) {
      continue
    }

    try {
      const bytes = base64ToUint8(projectImage.dataBase64)
      const blob = new Blob([bytes], { type: projectImage.mimeType || 'application/octet-stream' })
      const src = URL.createObjectURL(blob)
      decodedByHash.set(projectImage.hash, {
        src,
        blob,
        hash: projectImage.hash,
        name: projectImage.name,
        mimeType: projectImage.mimeType,
        width: projectImage.width,
        height: projectImage.height,
      })
    } catch {
      decodeFailed += 1
    }
  }

  const knownHashes = new Set(existingHashes)
  const loadedEntries: ImageEntry[] = []
  const keptHashes = new Set<string>()
  let duplicates = 0
  let skippedMissing = 0

  for (let index = 0; index < payload.entries.length; index += 1) {
    const entry = payload.entries[index]
    onProgress?.({
      phase: 'restoring',
      current: index + 1,
      total: payload.entries.length,
      imageName: decodedByHash.get(entry.imageHash)?.name,
    })

    const image = decodedByHash.get(entry.imageHash)
    if (!image) {
      skippedMissing += 1
      continue
    }

    if (knownHashes.has(image.hash)) {
      duplicates += 1
      continue
    }

    knownHashes.add(image.hash)
    keptHashes.add(image.hash)
    loadedEntries.push(createImageEntry(image, sanitizeProjectEntrySettings(entry, image)))
  }

  for (const [hash, image] of decodedByHash) {
    if (!keptHashes.has(hash)) {
      releaseImage(image.src)
    }
  }

  return {
    loadedEntries,
    duplicates,
    skippedMissing,
    decodeFailed,
  }
}

const sanitizeProjectEntrySettings = (
  value: PhotoPainterProjectPayload['entries'][number],
  image: LoadedImage,
): ProjectEntrySettings => {
  const orientation = value.orientation === 'portrait' ? 'portrait' : 'landscape'
  const fallbackArea = createInitialArea(image, orientation)

  return {
    crop: {
      x: finiteOr(value.crop?.x, INITIAL_CROP.x),
      y: finiteOr(value.crop?.y, INITIAL_CROP.y),
    },
    zoom: clamp(finiteOr(value.zoom, 1), MIN_ZOOM, MAX_ZOOM),
    croppedAreaPixels: sanitizeArea(value.croppedAreaPixels, fallbackArea, image),
    orientation,
    rotationDeg: normalizeRotation(finiteOr(value.rotationDeg, 0)),
    constrainToImage: Boolean(value.constrainToImage),
  }
}

const sanitizeArea = (value: Area, fallback: Area, image: LoadedImage): Area => {
  const width = Math.min(image.width, Math.max(1, Math.round(finiteOr(value?.width, fallback.width))))
  const height = Math.min(image.height, Math.max(1, Math.round(finiteOr(value?.height, fallback.height))))
  const x = Math.max(0, Math.min(image.width - width, Math.round(finiteOr(value?.x, fallback.x))))
  const y = Math.max(0, Math.min(image.height - height, Math.round(finiteOr(value?.y, fallback.y))))
  return { x, y, width, height }
}

const finiteOr = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? value : fallback

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

const uint8ToBase64 = (bytes: Uint8Array) => {
  let binary = ''
  const chunkSize = 0x8000

  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize)
    binary += String.fromCharCode(...chunk)
  }

  return btoa(binary)
}

const base64ToUint8 = (encoded: string) => {
  const binary = atob(encoded)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}