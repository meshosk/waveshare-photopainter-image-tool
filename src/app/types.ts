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

export type ExportBmpProgress = {
  phase: 'rendering' | 'saving'
  current: number
  total: number
  imageName: string
  fileName: string
}

export type ProjectBuildProgress = {
  phase: 'encoding' | 'saving'
  current: number
  total: number
  imageName?: string
}

export type ProjectImportProgress = {
  phase: 'decoding' | 'restoring'
  current: number
  total?: number
  imageName?: string
}

export type ProjectBinaryImageRecord = {
  hash: string
  name: string
  mimeType: string
  width: number
  height: number
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