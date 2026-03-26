import type { BatchExportFile, ImageEntry, ProjectBuildProgress, SaveProjectResult } from './types'
import { buildProjectPayload, createProjectEntries, getUniqueProjectImages } from './project'

export const isMissingIpcHandlerError = (error: unknown, channel: string) =>
  error instanceof Error && error.message.includes(`No handler registered for '${channel}'`)

export function downloadTextFile(fileName: string, content: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 0)
}

export const saveProjectFile = async (payload: PhotoPainterProjectPayload): Promise<SaveProjectResult> => {
  const bridge = window.desktopBridge

  if (bridge?.saveProject) {
    try {
      const result = await bridge.saveProject({
        defaultName: 'photopainter-project.photopaint',
        project: payload,
      })

      if (result.canceled) {
        return { kind: 'canceled' }
      }

      return {
        kind: 'saved',
        filePath: result.filePath,
      }
    } catch (error) {
      if (!isMissingIpcHandlerError(error, 'dialog:save-project')) {
        throw error
      }
    }
  }

  downloadTextFile(
    'photopainter-project.photopaint',
    JSON.stringify(payload, null, 2),
    'application/json',
  )
  return { kind: 'downloaded' }
}

export const exportProjectFile = async (
  images: ImageEntry[],
  onProgress?: (progress: ProjectBuildProgress) => void,
): Promise<SaveProjectResult> => {
  const bridge = window.desktopBridge

  if (bridge?.beginSaveProjectExport && bridge?.appendProjectExportImage && bridge?.finishProjectExport) {
    const uniqueImages = getUniqueProjectImages(images)
    const beginResult = await bridge.beginSaveProjectExport({
      defaultName: 'photopainter-project.photopaint',
      exportedAt: new Date().toISOString(),
      entries: createProjectEntries(images),
    })

    if (beginResult.error) {
      throw new Error(beginResult.error)
    }

    if (beginResult.canceled || !beginResult.filePath) {
      return { kind: 'canceled' }
    }

    try {
      for (let index = 0; index < uniqueImages.length; index += 1) {
        const entry = uniqueImages[index]
        onProgress?.({
          phase: 'encoding',
          current: index + 1,
          total: uniqueImages.length,
          imageName: entry.image.name,
        })

        const data = new Uint8Array(await entry.image.blob.arrayBuffer())

        onProgress?.({
          phase: 'saving',
          current: index + 1,
          total: uniqueImages.length,
          imageName: entry.image.name,
        })

        const appendResult = await bridge.appendProjectExportImage({
          filePath: beginResult.filePath,
          prependComma: index > 0,
          image: {
            hash: entry.image.hash,
            name: entry.image.name,
            mimeType: entry.image.mimeType,
            width: entry.image.width,
            height: entry.image.height,
            data,
          },
        })

        if (appendResult.error) {
          throw new Error(appendResult.error)
        }
      }

      const finishResult = await bridge.finishProjectExport({ filePath: beginResult.filePath })
      if (finishResult.error) {
        throw new Error(finishResult.error)
      }

      return {
        kind: 'saved',
        filePath: beginResult.filePath,
      }
    } catch (error) {
      await bridge.abortProjectExport?.({ filePath: beginResult.filePath })
      throw error
    }
  }

  const payload = await buildProjectPayload(images, onProgress)
  return saveProjectFile(payload)
}

export const buildWaveshareFileName = (name: string) => {
  const base = stripExtension(extractBaseName(name)).trim()
  const sanitized = base
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  const stem = sanitized || 'image'
  return `${stem}.bmp`
}

export const uniquifyFileNames = (files: BatchExportFile[]): BatchExportFile[] => {
  const usedNames = new Set<string>()
  return files.map((file) => {
    const uniqueName = createUniqueName(file.fileName, usedNames)
    usedNames.add(uniqueName.toLowerCase())
    return {
      ...file,
      fileName: uniqueName,
    }
  })
}

const createUniqueName = (requestedName: string, usedNames: Set<string>) => {
  const baseName = stripExtension(requestedName)
  const extension = requestedName.includes('.') ? requestedName.slice(requestedName.lastIndexOf('.')) : ''
  let candidate = `${baseName}${extension}`
  let index = 1

  while (usedNames.has(candidate.toLowerCase())) {
    candidate = `${baseName}_${index}${extension}`
    index += 1
  }

  return candidate
}

const extractBaseName = (name: string) => name.split(/[\\/]/).pop() ?? name

const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '')

export const forceOpaqueWhite = (imageData: ImageData) => {
  const { data } = imageData
  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3]
    if (alpha < 255) {
      data[index] = 255
      data[index + 1] = 255
      data[index + 2] = 255
    }
    data[index + 3] = 255
  }
}

export const saveBmpInBrowser = async (fileName: string, data: Uint8Array) => {
  const byteView = new Uint8Array(data)

  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string
        types?: Array<{ description?: string; accept: Record<string, string[]> }>
      }) => Promise<{
        createWritable: () => Promise<{
          write: (input: BufferSource | Blob) => Promise<void>
          close: () => Promise<void>
        }>
        name?: string
      }>
    }
  ).showSaveFilePicker

  if (typeof picker === 'function') {
    try {
      const fileHandle = await picker({
        suggestedName: fileName,
        types: [
          {
            description: 'Bitmap image',
            accept: { 'image/bmp': ['.bmp'] },
          },
        ],
      })

      const writable = await fileHandle.createWritable()
      await writable.write(byteView)
      await writable.close()
      return {
        canceled: false,
        pathHint: fileHandle.name,
      }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { canceled: true }
      }
      throw error
    }
  }

  const blob = new Blob([byteView], { type: 'image/bmp' })
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = objectUrl
  anchor.download = fileName
  anchor.click()
  URL.revokeObjectURL(objectUrl)

  return {
    canceled: false,
    pathHint: undefined,
  }
}