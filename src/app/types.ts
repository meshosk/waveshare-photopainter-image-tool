import type { Area } from 'react-easy-crop'
import type { Orientation } from '../crop'
import type { LoadedImage } from '../image'

export type CropPoint = {
  x: number
  y: number
}

export type MediaViewport = {
  width: number
  height: number
  naturalWidth: number
  naturalHeight: number
}

export type ImageEntry = {
  id: string
  image: LoadedImage
  crop: CropPoint
  zoom: number
  croppedAreaPixels: Area
  orientation: Orientation
  rotationDeg: number
  mediaViewport: MediaViewport | null
  constrainToImage: boolean
}

export type BatchExportFile = {
  fileName: string
  data: Uint8Array
}

export type ProjectEntrySettings = {
  crop: CropPoint
  zoom: number
  croppedAreaPixels: Area
  orientation: Orientation
  rotationDeg: number
  constrainToImage: boolean
}

export type ProjectImportResult = {
  loadedEntries: ImageEntry[]
  duplicates: number
  skippedMissing: number
  decodeFailed: number
}

export type SaveProjectResult =
  | { kind: 'canceled' }
  | { kind: 'saved'; filePath?: string }
  | { kind: 'downloaded' }

export type SaveBmpBatchResult =
  | { kind: 'canceled' }
  | { kind: 'saved'; savedCount: number; folderPath?: string }
  | { kind: 'partial'; savedCount: number; totalCount: number }
  | { kind: 'downloaded'; savedCount: number }