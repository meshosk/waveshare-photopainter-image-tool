import { imageDataToBmp } from '../bmp'
import { applyPaletteWithDithering } from '../color'
import { OUTPUT_SIZES, renderCroppedImage } from '../crop'
import { getImageElement } from '../image'
import { buildWaveshareFileName, forceOpaqueWhite, saveBmpInBrowser, uniquifyFileNames } from './fileHelpers'
import type { BatchExportFile, ImageEntry, SaveBmpBatchResult } from './types'

export const renderBmpBatch = async (
  images: ImageEntry[],
  onProgress?: (status: string) => void,
): Promise<BatchExportFile[]> => {
  const encodedFiles: BatchExportFile[] = []

  for (let index = 0; index < images.length; index += 1) {
    const entry = images[index]
    onProgress?.(`Rendering image ${index + 1}/${images.length}: ${entry.image.name}`)

    const sourceImage = await getImageElement(entry.image.src)
    const entryOutput = OUTPUT_SIZES[entry.orientation]
    const cropped = await renderCroppedImage(
      sourceImage,
      entry.croppedAreaPixels,
      entryOutput.width,
      entryOutput.height,
      undefined,
      entry.rotationDeg,
    )
    forceOpaqueWhite(cropped)
    const dithered = applyPaletteWithDithering(cropped)
    const bmp = imageDataToBmp(dithered)
    encodedFiles.push({
      fileName: buildWaveshareFileName(entry.image.name),
      data: bmp,
    })
  }

  return uniquifyFileNames(encodedFiles)
}

export const saveBmpBatch = async (
  files: BatchExportFile[],
  onProgress?: (status: string) => void,
): Promise<SaveBmpBatchResult> => {
  const bridge = window.desktopBridge

  if (bridge?.selectDirectory && bridge?.exportBatchBmp) {
    const selected = await bridge.selectDirectory()
    if (selected.canceled || !selected.folderPath) {
      return { kind: 'canceled' }
    }

    const result = await bridge.exportBatchBmp({
      folderPath: selected.folderPath,
      files,
    })

    if (result.canceled) {
      return { kind: 'canceled' }
    }

    const failures = result.failed ?? []
    if (failures.length > 0) {
      return {
        kind: 'partial',
        savedCount: result.savedCount ?? 0,
        totalCount: files.length,
      }
    }

    return {
      kind: 'saved',
      savedCount: result.savedCount ?? files.length,
      folderPath: result.folderPath ?? selected.folderPath,
    }
  }

  const dirPicker = (
    window as Window & {
      showDirectoryPicker?: (options?: { mode?: string }) => Promise<FileSystemDirectoryHandle>
    }
  ).showDirectoryPicker

  if (typeof dirPicker === 'function') {
    let dirHandle: FileSystemDirectoryHandle
    try {
      dirHandle = await dirPicker({ mode: 'readwrite' })
    } catch (error) {
      console.error('[export-bmp-dir-picker]', error)
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { kind: 'canceled' }
      }
      throw error
    }

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index]
      onProgress?.(`Saving ${index + 1}/${files.length}: ${file.fileName}`)
      const fileHandle = await dirHandle.getFileHandle(file.fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(new Blob([file.data.buffer as ArrayBuffer], { type: 'image/bmp' }))
      await writable.close()
    }

    return {
      kind: 'saved',
      savedCount: files.length,
    }
  }

  for (const file of files) {
    const result = await saveBmpInBrowser(file.fileName, file.data)
    if (result.canceled) {
      return { kind: 'canceled' }
    }
  }

  return {
    kind: 'downloaded',
    savedCount: files.length,
  }
}