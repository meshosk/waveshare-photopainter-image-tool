import { useEffect, useMemo, useRef, useState } from 'react'
import { OUTPUT_SIZES } from './crop'
import { loadImageFile, releaseImage } from './image'
import { saveBmpBatch, renderBmpBatch } from './app/bmpExport'
import { EditorSidebar } from './app/components/EditorSidebar'
import { ImageCropper } from './app/components/ImageCropper'
import { ImageThumbnailStrip } from './app/components/ImageThumbnailStrip'
import { PreviewPanel } from './app/components/PreviewPanel'
import { DEFAULT_STATUS, MAX_ZOOM, MIN_ZOOM } from './app/constants'
import { saveProjectFile } from './app/fileHelpers'
import { clampCrop, createImageEntry, normalizeRotation } from './app/imageEntries'
import { useCropSize } from './app/hooks/useCropSize'
import { usePreview } from './app/hooks/usePreview'
import { buildProjectPayload, importProjectPayload, isProjectPayload } from './app/project'
import type { ImageEntry } from './app/types'

type ImportProgress = {
  totalFiles: number
  processedFiles: number
  visibleCount: number
  pendingVisibleIds: string[]
  completionStatus: string | null
}

const buildImportSummary = (loadedCount: number, failuresCount: number, duplicates: number) => {
  if (loadedCount > 0 && failuresCount === 0 && duplicates === 0) {
    return `Loaded ${loadedCount} image(s). Select thumbnail and adjust crop before export.`
  }

  if (loadedCount > 0) {
    const summary = [
      `Loaded ${loadedCount} image(s).`,
      duplicates > 0 ? `Skipped ${duplicates} duplicate(s).` : '',
      failuresCount > 0 ? `${failuresCount} file(s) failed to import.` : '',
    ]
      .filter(Boolean)
      .join(' ')

    return `${summary} Select thumbnail and adjust crop before export.`
  }

  if (duplicates > 0 && failuresCount === 0) {
    return `Skipped ${duplicates} duplicate image(s).`
  }

  return `Import failed: No supported image file found.`
}

function App() {
  const [images, setImages] = useState<ImageEntry[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [isProjectBusy, setIsProjectBusy] = useState(false)
  const [importProgress, setImportProgress] = useState<ImportProgress | null>(null)
  const [status, setStatus] = useState(DEFAULT_STATUS)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const projectInputRef = useRef<HTMLInputElement | null>(null)
  const cropShellRef = useRef<HTMLDivElement | null>(null)
  const imagesRef = useRef<ImageEntry[]>([])

  const activeImage = useMemo(
    () => images.find((entry) => entry.id === activeImageId) ?? null,
    [activeImageId, images],
  )

  const outputSize = activeImage ? OUTPUT_SIZES[activeImage.orientation] : OUTPUT_SIZES.landscape
  const aspect = outputSize.width / outputSize.height
  const cropSize = useCropSize(cropShellRef, aspect, activeImageId)
  const previewUrl = usePreview(activeImage, outputSize)
  const importIndicator = importProgress
    ? {
        loadedCount: importProgress.visibleCount,
        totalCount: importProgress.totalFiles,
        remainingProcessingCount: Math.max(0, importProgress.totalFiles - importProgress.processedFiles),
        remainingRenderCount: importProgress.pendingVisibleIds.length,
      }
    : null

  const minZoomToFit =
    cropSize && activeImage?.mediaViewport
      ? Math.max(
          cropSize.width / activeImage.mediaViewport.width,
          cropSize.height / activeImage.mediaViewport.height,
        )
      : MIN_ZOOM

  const effectiveMinZoom = activeImage?.constrainToImage ? Math.max(MIN_ZOOM, minZoomToFit) : MIN_ZOOM

  useEffect(() => {
    imagesRef.current = images
  }, [images])

  useEffect(() => {
    return () => {
      for (const entry of imagesRef.current) {
        releaseImage(entry.image.src)
      }
    }
  }, [])

  useEffect(() => {
    if (!importProgress) {
      return
    }

    if (importProgress.processedFiles < importProgress.totalFiles || importProgress.pendingVisibleIds.length > 0) {
      return
    }

    if (importProgress.completionStatus) {
      setStatus(importProgress.completionStatus)
    }

    setImportProgress(null)
  }, [importProgress])

  const updateActiveImage = (updater: (entry: ImageEntry) => ImageEntry) => {
    if (!activeImageId) {
      return
    }

    setImages((current) =>
      current.map((entry) => (entry.id === activeImageId ? updater(entry) : entry)),
    )
  }

  useEffect(() => {
    if (activeImage?.constrainToImage && cropSize && activeImage.mediaViewport) {
      const minZoom = Math.max(
        MIN_ZOOM,
        Math.max(
          cropSize.width / activeImage.mediaViewport.width,
          cropSize.height / activeImage.mediaViewport.height,
        ),
      )

      updateActiveImage((entry) => {
        const snapped = Math.max(entry.zoom, minZoom)
        return {
          ...entry,
          zoom: snapped,
          crop: clampCrop(entry.crop, cropSize, entry.mediaViewport ?? { width: 1, height: 1 }, snapped),
        }
      })
    }
  }, [activeImage?.constrainToImage, cropSize])

  const appendEntries = (loadedEntries: ImageEntry[], options?: { trackVisibility?: boolean }) => {
    if (loadedEntries.length === 0) {
      return
    }

    if (options?.trackVisibility) {
      setImportProgress((current) =>
        current
          ? {
              ...current,
              pendingVisibleIds: [...current.pendingVisibleIds, ...loadedEntries.map((entry) => entry.id)],
            }
          : current,
      )
    }

    setImages((current) => [...current, ...loadedEntries])
    setActiveImageId((current) => current ?? loadedEntries[0].id)
  }

  const rotateActiveImage = (delta: number) => {
    updateActiveImage((entry) => ({
      ...entry,
      rotationDeg: normalizeRotation(entry.rotationDeg + delta),
    }))
  }

  const importImages = async (files: File[]) => {
    const knownHashes = new Set(imagesRef.current.map((entry) => entry.image.hash))
    let loadedCount = 0
    let failuresCount = 0
    let duplicates = 0

    setImportProgress({
      totalFiles: files.length,
      processedFiles: 0,
      visibleCount: 0,
      pendingVisibleIds: [],
      completionStatus: null,
    })

    for (const file of files) {
      try {
        const loaded = await loadImageFile(file)

        if (knownHashes.has(loaded.hash)) {
          duplicates += 1
          releaseImage(loaded.src)
        } else {
          knownHashes.add(loaded.hash)
          const entry = createImageEntry(loaded)
          loadedCount += 1
          appendEntries([entry], { trackVisibility: true })
        }
      } catch (error) {
        console.error('[import-images]', error)
        failuresCount += 1
      } finally {
        setImportProgress((current) =>
          current
            ? {
                ...current,
                processedFiles: current.processedFiles + 1,
              }
            : current,
        )
      }
    }

    const completionStatus = buildImportSummary(loadedCount, failuresCount, duplicates)

    setImportProgress((current) =>
      current
        ? {
            ...current,
            completionStatus,
          }
        : current,
    )
  }

  const handleThumbnailVisible = (id: string) => {
    setImportProgress((current) => {
      if (!current || !current.pendingVisibleIds.includes(id)) {
        return current
      }

      return {
        ...current,
        visibleCount: current.visibleCount + 1,
        pendingVisibleIds: current.pendingVisibleIds.filter((pendingId) => pendingId !== id),
      }
    })
  }

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? [])
    if (selectedFiles.length === 0) {
      return
    }

    await importImages(selectedFiles)
    event.target.value = ''
  }

  const handleExportProject = async () => {
    if (images.length === 0) {
      return
    }

    setIsProjectBusy(true)
    setStatus(`Preparing project with ${images.length} image(s)...`)

    try {
      const payload = await buildProjectPayload(images)
      const result = await saveProjectFile(payload)

      if (result.kind === 'canceled') {
        setStatus('Project export was canceled.')
        return
      }

      if (result.kind === 'saved') {
        setStatus(`Project saved to ${result.filePath ?? 'selected location'}.`)
        return
      }

      setStatus('Project exported via file download.')
    } catch (error) {
      console.error('[export-project]', error)
      const message = error instanceof Error ? error.message : 'Unknown project export problem.'
      setStatus(`Project export failed: ${message}`)
    } finally {
      setIsProjectBusy(false)
    }
  }

  const handleImportProject = async () => {
    setIsProjectBusy(true)
    setStatus('Loading project...')

    try {
      const file = projectInputRef.current?.files?.[0]
      if (!file) {
        setStatus('Project import failed: no file was selected.')
        return
      }

      const text = await file.text()
      let payload: PhotoPainterProjectPayload

      try {
        payload = JSON.parse(text) as PhotoPainterProjectPayload
      } catch (parseError) {
        setStatus(
          `Project import failed: ${parseError instanceof Error ? parseError.message : 'Unable to parse project file'}`,
        )
        return
      }

      if (!isProjectPayload(payload)) {
        setStatus('Project import failed: invalid .photopaint structure.')
        return
      }

      const imported = await importProjectPayload(
        payload,
        imagesRef.current.map((entry) => entry.image.hash),
      )

      appendEntries(imported.loadedEntries)

      if (imported.loadedEntries.length > 0) {
        const summary = [
          `Imported ${imported.loadedEntries.length} image(s) from project.`,
          imported.duplicates > 0 ? `Skipped ${imported.duplicates} duplicate(s).` : '',
          imported.skippedMissing > 0 ? `Skipped ${imported.skippedMissing} missing record(s).` : '',
          imported.decodeFailed > 0 ? `${imported.decodeFailed} image(s) failed to decode.` : '',
        ]
          .filter(Boolean)
          .join(' ')

        setStatus(summary)
        return
      }

      const noAddedSummary = [
        'No new images were imported from project.',
        imported.duplicates > 0 ? `Skipped ${imported.duplicates} duplicate(s).` : '',
        imported.skippedMissing > 0 ? `Skipped ${imported.skippedMissing} missing record(s).` : '',
        imported.decodeFailed > 0 ? `${imported.decodeFailed} image(s) failed to decode.` : '',
      ]
        .filter(Boolean)
        .join(' ')
      setStatus(noAddedSummary)
    } catch (error) {
      console.error('[import-project]', error)
      const message = error instanceof Error ? error.message : 'Unknown project import problem.'
      setStatus(`Project import failed: ${message}`)
    } finally {
      if (projectInputRef.current) {
        projectInputRef.current.value = ''
      }
      setIsProjectBusy(false)
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    const files = Array.from(event.dataTransfer.files ?? [])
    if (files.length === 0) {
      return
    }

    await importImages(files)
  }

  const removeImage = (id: string) => {
    setImages((current) => {
      const target = current.find((entry) => entry.id === id)
      if (target) {
        releaseImage(target.image.src)
      }

      const next = current.filter((entry) => entry.id !== id)
      setActiveImageId((active) => {
        if (active !== id) {
          return active
        }
        return next[0]?.id ?? null
      })

      if (next.length === 0) {
        setStatus(DEFAULT_STATUS)
      }

      return next
    })

    setImportProgress((current) => {
      if (!current || !current.pendingVisibleIds.includes(id)) {
        return current
      }

      return {
        ...current,
        pendingVisibleIds: current.pendingVisibleIds.filter((pendingId) => pendingId !== id),
      }
    })
  }

  const handleExportAll = async () => {
    if (images.length === 0) {
      return
    }

    setIsExporting(true)
    setStatus(`Preparing ${images.length} export(s) for PhotoPainter...`)

    try {
      const files = await renderBmpBatch(images, setStatus)
      const result = await saveBmpBatch(files, setStatus)

      if (result.kind === 'canceled') {
        setStatus('Export was canceled.')
        return
      }

      if (result.kind === 'partial') {
        setStatus(`Export finished with errors. Saved ${result.savedCount}/${result.totalCount} file(s).`)
        return
      }

      if (result.kind === 'saved') {
        setStatus(`Exported ${result.savedCount} BMP file(s) to ${result.folderPath ?? 'selected folder'}.`)
        return
      }

      setStatus(`Exported ${result.savedCount} BMP file(s) via browser downloads.`)
    } catch (error) {
      console.error('[export-bmp]', error)
      const message = error instanceof Error ? error.message : 'Unknown problem during export.'
      setStatus(`Export failed: ${message}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="shell">
      <EditorSidebar
        activeImage={activeImage}
        imagesCount={images.length}
        isExporting={isExporting}
        isProjectBusy={isProjectBusy}
        status={status}
        effectiveMinZoom={effectiveMinZoom}
        onOpenImages={() => inputRef.current?.click()}
        onExportProject={() => {
          void handleExportProject()
        }}
        onOpenProject={() => projectInputRef.current?.click()}
        inputRef={inputRef}
        projectInputRef={projectInputRef}
        onImageInputChange={(event) => {
          void handleFileSelection(event)
        }}
        onProjectInputChange={() => {
          void handleImportProject()
        }}
        onOrientationChange={(orientation) =>
          updateActiveImage((entry) => ({
            ...entry,
            orientation,
          }))
        }
        onZoomChange={(zoom) =>
          updateActiveImage((entry) => ({
            ...entry,
            zoom: Math.max(effectiveMinZoom, Math.min(MAX_ZOOM, zoom)),
          }))
        }
        onZoomStep={(delta) =>
          updateActiveImage((entry) => ({
            ...entry,
            zoom: Math.max(effectiveMinZoom, Math.min(MAX_ZOOM, entry.zoom + delta)),
          }))
        }
        onRotate={rotateActiveImage}
        onConstrainToggle={(value) =>
          updateActiveImage((entry) => ({
            ...entry,
            constrainToImage: value,
          }))
        }
        onExportAll={() => {
          void handleExportAll()
        }}
      />

      <main className="workspace">
        <ImageThumbnailStrip
          images={images}
          activeImageId={activeImageId}
          onSelect={setActiveImageId}
          onRemove={removeImage}
          onDrop={handleDrop}
          onImageVisible={handleThumbnailVisible}
          importProgress={importIndicator}
        />

        <ImageCropper
          activeImage={activeImage}
          cropShellRef={cropShellRef}
          cropSize={cropSize}
          aspect={aspect}
          effectiveMinZoom={effectiveMinZoom}
          maxZoom={MAX_ZOOM}
          outputSize={outputSize}
          onDrop={handleDrop}
          onCropChange={(crop) =>
            updateActiveImage((entry) => ({
              ...entry,
              crop,
            }))
          }
          onZoomChange={(zoom) =>
            updateActiveImage((entry) => ({
              ...entry,
              zoom: Math.max(effectiveMinZoom, Math.min(MAX_ZOOM, zoom)),
            }))
          }
          onCropComplete={(pixels) =>
            updateActiveImage((entry) => ({
              ...entry,
              croppedAreaPixels: pixels,
            }))
          }
          onMediaLoaded={(media) =>
            updateActiveImage((entry) => ({
              ...entry,
              mediaViewport: {
                width: media.width,
                height: media.height,
                naturalWidth: media.naturalWidth ?? media.width,
                naturalHeight: media.naturalHeight ?? media.height,
              },
            }))
          }
        />

        <PreviewPanel previewUrl={previewUrl} />
      </main>
    </div>
  )
}

export default App