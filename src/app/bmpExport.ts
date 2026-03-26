import { imageDataToBmp } from '../bmp'
import { applyPaletteWithDithering } from '../color'
import { OUTPUT_SIZES, renderCroppedImage } from '../crop'
import { getImageElement } from '../image'
import { buildWaveshareFileName, forceOpaqueWhite, saveBmpInBrowser, uniquifyFileNames } from './fileHelpers'
import type { BatchExportFile, ExportBmpProgress, ImageEntry, SaveBmpBatchResult } from './types'

type PlannedExport = {
  entry: ImageEntry
  fileName: string
}

const buildExportPlan = (images: ImageEntry[], options?: { prefixWithFiveDigitNumber?: boolean }): PlannedExport[] => {
  const uniqueFiles = uniquifyFileNames(
    images.map((entry) => ({
      fileName: buildWaveshareFileName(entry.image.name),
      data: new Uint8Array(0),
    })),
  )
  const numericPrefixes = options?.prefixWithFiveDigitNumber ? createFiveDigitPrefixes(images.length) : null

  return images.map((entry, index) => ({
    entry,
    fileName: numericPrefixes ? `${numericPrefixes[index]}_${uniqueFiles[index].fileName}` : uniqueFiles[index].fileName,
  }))
}

const createFiveDigitPrefixes = (count: number) => {
  const usedNumbers = new Set<number>()
  const prefixes: string[] = []

  while (prefixes.length < count) {
    const candidate = Math.floor(Math.random() * 90000) + 10000
    if (usedNumbers.has(candidate)) {
      continue
    }

    usedNumbers.add(candidate)
    prefixes.push(String(candidate))
  }

  return prefixes
}

const renderBmpFile = async (entry: ImageEntry, fileName: string): Promise<BatchExportFile> => {
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

  return {
    fileName,
    data: imageDataToBmp(dithered),
  }
}

const yieldToBrowser = async () => {
  await new Promise<void>((resolve) => {
    window.setTimeout(resolve, 0)
  })
}

export const exportBmpBatch = async (
  images: ImageEntry[],
  options?: { prefixWithFiveDigitNumber?: boolean },
  onProgress?: (progress: ExportBmpProgress) => void,
): Promise<SaveBmpBatchResult> => {
  const plannedExports = buildExportPlan(images, options)
  const bridge = window.desktopBridge

  if (bridge?.selectDirectory && (bridge?.saveBmpToDirectory || bridge?.exportBatchBmp)) {
    const selected = await bridge.selectDirectory()
    if (selected.canceled || !selected.folderPath) {
      return { kind: 'canceled' }
    }

    let savedCount = 0

    for (let index = 0; index < plannedExports.length; index += 1) {
      const { entry, fileName } = plannedExports[index]
      onProgress?.({
        phase: 'rendering',
        current: index + 1,
        total: plannedExports.length,
        imageName: entry.image.name,
        fileName,
      })
      const file = await renderBmpFile(entry, fileName)
      onProgress?.({
        phase: 'saving',
        current: index + 1,
        total: plannedExports.length,
        imageName: entry.image.name,
        fileName: file.fileName,
      })

      if (bridge.saveBmpToDirectory) {
        const result = await bridge.saveBmpToDirectory({
          folderPath: selected.folderPath,
          fileName: file.fileName,
          data: file.data,
        })

        if (result.error) {
          return {
            kind: 'partial',
            savedCount,
            totalCount: plannedExports.length,
          }
        }
      } else {
        const result = await bridge.exportBatchBmp({
          folderPath: selected.folderPath,
          files: [file],
        })

        if (result.canceled) {
          return { kind: 'canceled' }
        }

        if ((result.failed ?? []).length > 0) {
          return {
            kind: 'partial',
            savedCount,
            totalCount: plannedExports.length,
          }
        }
      }

      savedCount += 1

      if ((index + 1) % 8 === 0) {
        await yieldToBrowser()
      }
    }

    return {
      kind: 'saved',
      savedCount,
      folderPath: selected.folderPath,
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

    for (let index = 0; index < plannedExports.length; index += 1) {
      const { entry, fileName } = plannedExports[index]
      onProgress?.({
        phase: 'rendering',
        current: index + 1,
        total: plannedExports.length,
        imageName: entry.image.name,
        fileName,
      })
      const file = await renderBmpFile(entry, fileName)
      onProgress?.({
        phase: 'saving',
        current: index + 1,
        total: plannedExports.length,
        imageName: entry.image.name,
        fileName: file.fileName,
      })
      const fileHandle = await dirHandle.getFileHandle(file.fileName, { create: true })
      const writable = await fileHandle.createWritable()
      await writable.write(new Blob([file.data.buffer as ArrayBuffer], { type: 'image/bmp' }))
      await writable.close()

      if ((index + 1) % 8 === 0) {
        await yieldToBrowser()
      }
    }

    return {
      kind: 'saved',
      savedCount: plannedExports.length,
    }
  }

  for (let index = 0; index < plannedExports.length; index += 1) {
    const { entry, fileName } = plannedExports[index]
    onProgress?.({
      phase: 'rendering',
      current: index + 1,
      total: plannedExports.length,
      imageName: entry.image.name,
      fileName,
    })
    const file = await renderBmpFile(entry, fileName)
    onProgress?.({
      phase: 'saving',
      current: index + 1,
      total: plannedExports.length,
      imageName: entry.image.name,
      fileName: file.fileName,
    })
    const result = await saveBmpInBrowser(file.fileName, file.data)
    if (result.canceled) {
      return { kind: 'canceled' }
    }

    if ((index + 1) % 8 === 0) {
      await yieldToBrowser()
    }
  }

  return {
    kind: 'downloaded',
    savedCount: plannedExports.length,
  }
}