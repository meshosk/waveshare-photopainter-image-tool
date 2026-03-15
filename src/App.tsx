import { useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { imageDataToBmp } from './bmp'
import { applyPaletteWithDithering, PHOTO_PAINTER_PALETTE } from './color'
import { OUTPUT_SIZES, type Orientation, renderCroppedImage } from './crop'
import { getImageElement, loadImageFile, releaseImage, type LoadedImage } from './image'

const ACCEPTED_FORMATS = '.jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif'

const INITIAL_CROP = { x: 0, y: 0 }
const MIN_ZOOM = 0.4
const MAX_ZOOM = 5
const ROTATION_STEP = 90

type ImageEntry = {
  id: string
  image: LoadedImage
  crop: { x: number; y: number }
  zoom: number
  croppedAreaPixels: Area
  orientation: Orientation
  rotationDeg: number
  mediaViewport: {
    width: number
    height: number
    naturalWidth: number
    naturalHeight: number
  } | null
}

type BatchExportFile = {
  fileName: string
  data: Uint8Array
}

function clampCrop(
  crop: { x: number; y: number },
  cropSize: { width: number; height: number },
  mediaViewport: { width: number; height: number },
  zoom: number,
): { x: number; y: number } {
  const renderedWidth = mediaViewport.width * zoom
  const renderedHeight = mediaViewport.height * zoom
  const maxX = Math.max(0, (renderedWidth - cropSize.width) / 2)
  const maxY = Math.max(0, (renderedHeight - cropSize.height) / 2)
  return {
    x: Math.max(-maxX, Math.min(maxX, crop.x)),
    y: Math.max(-maxY, Math.min(maxY, crop.y)),
  }
}

function App() {
  const [images, setImages] = useState<ImageEntry[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | undefined>(undefined)
  const [constrainToImage, setConstrainToImage] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState('Upload one or more images, set crop for each, and export BMP files.')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cropShellRef = useRef<HTMLDivElement | null>(null)
  const imagesRef = useRef<ImageEntry[]>([])

  const activeImage = useMemo(
    () => images.find((entry) => entry.id === activeImageId) ?? null,
    [activeImageId, images],
  )

  const outputSize = activeImage ? OUTPUT_SIZES[activeImage.orientation] : OUTPUT_SIZES.landscape
  const aspect = outputSize.width / outputSize.height

  const minZoomToFit =
    cropSize && activeImage?.mediaViewport
      ? Math.max(
          cropSize.width / activeImage.mediaViewport.width,
          cropSize.height / activeImage.mediaViewport.height,
        )
      : MIN_ZOOM

  const effectiveMinZoom = constrainToImage ? Math.max(MIN_ZOOM, minZoomToFit) : MIN_ZOOM

  useEffect(() => {
    imagesRef.current = images
  }, [images])

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
  }, [aspect, activeImageId])

  useEffect(() => {
    return () => {
      for (const entry of imagesRef.current) {
        releaseImage(entry.image.src)
      }
    }
  }, [])

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

  useEffect(() => {
    if (constrainToImage && cropSize && activeImage?.mediaViewport) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [constrainToImage])

  const paletteLabels = useMemo(
    () => PHOTO_PAINTER_PALETTE.map((entry) => entry.name).join(', '),
    [],
  )

  const updateActiveImage = (updater: (entry: ImageEntry) => ImageEntry) => {
    if (!activeImageId) {
      return
    }

    setImages((current) =>
      current.map((entry) => (entry.id === activeImageId ? updater(entry) : entry)),
    )
  }

  const rotateActiveImage = (delta: number) => {
    updateActiveImage((entry) => ({
      ...entry,
      rotationDeg: normalizeRotation(entry.rotationDeg + delta),
    }))
  }

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(event.target.files ?? [])
    if (selectedFiles.length === 0) {
      return
    }

    await importImages(selectedFiles)
    event.target.value = ''
  }

  const importImages = async (files: File[]) => {
    const loadedEntries: ImageEntry[] = []
    const failures: string[] = []

    for (const file of files) {
      try {
        const loaded = await loadImageFile(file)
        loadedEntries.push(createImageEntry(loaded))
      } catch (error) {
        failures.push(error instanceof Error ? error.message : 'Unknown problem while loading file.')
      }
    }

    if (loadedEntries.length > 0) {
      setImages((current) => [...current, ...loadedEntries])
      setActiveImageId((current) => current ?? loadedEntries[0].id)
    }

    if (loadedEntries.length > 0 && failures.length === 0) {
      setStatus(`Loaded ${loadedEntries.length} image(s). Select thumbnail and adjust crop before export.`)
      return
    }

    if (loadedEntries.length > 0) {
      setStatus(`Loaded ${loadedEntries.length} image(s). ${failures.length} file(s) failed to import.`)
      return
    }

    setStatus(`Import failed: ${failures[0] ?? 'No supported image file found.'}`)
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
        setStatus('Upload one or more images, set crop for each, and export BMP files.')
      }

      return next
    })
  }

  const handleExportAll = async () => {
    if (images.length === 0) {
      return
    }

    setIsExporting(true)
    setStatus(`Preparing ${images.length} export(s) for PhotoPainter...`)

    try {
      const encodedFiles: BatchExportFile[] = []

      for (let index = 0; index < images.length; index += 1) {
        const entry = images[index]
        setStatus(`Rendering image ${index + 1}/${images.length}: ${entry.image.name}`)

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

      const uniqueFiles = uniquifyFileNames(encodedFiles)
      const bridge = window.desktopBridge

      if (bridge?.selectDirectory && bridge?.exportBatchBmp) {
        const selected = await bridge.selectDirectory()
        if (selected.canceled || !selected.folderPath) {
          setStatus('Export was canceled.')
          return
        }

        const result = await bridge.exportBatchBmp({
          folderPath: selected.folderPath,
          files: uniqueFiles,
        })

        if (result.canceled) {
          setStatus('Export was canceled.')
          return
        }

        const failures = result.failed ?? []
        if (failures.length > 0) {
          setStatus(
            `Export finished with errors. Saved ${result.savedCount ?? 0}/${uniqueFiles.length} file(s).`,
          )
          return
        }

        setStatus(
          `Exported ${result.savedCount ?? uniqueFiles.length} BMP file(s) to ${result.folderPath ?? selected.folderPath}.`,
        )
        return
      }

      for (const file of uniqueFiles) {
        await saveBmpInBrowser(file.fileName, file.data)
      }
      setStatus(`Exported ${uniqueFiles.length} BMP file(s) via browser downloads.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown problem during export.'
      setStatus(`Export failed: ${message}`)
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">The meshosk and AI presents</p>
          <h1>Waveshare PhotoPainter image tool</h1>
          <p className="lede">
            Upload photos, tune crop per image, rotate by 90 degrees, and export 24-bit BMP files
            for 800 x 480 or 480 x 800 panels.
          </p>
        </div>

        <section className="panel stack">
          <h2>Input</h2>
          <button className="primary" type="button" onClick={() => inputRef.current?.click()}>
            Select images
          </button>
          <input
            ref={inputRef}
            hidden
            accept={ACCEPTED_FORMATS}
            type="file"
            multiple
            onChange={handleFileSelection}
          />
          <p className="muted">Supported formats: JPG, PNG, WebP, BMP, GIF, HEIC.</p>
        </section>

        <section className="panel stack">
          <h2>Output</h2>
          <div className="segmented">
            <button
              type="button"
              className={activeImage?.orientation === 'landscape' ? 'active' : ''}
              disabled={!activeImage}
              onClick={() => updateActiveImage((entry) => ({ ...entry, orientation: 'landscape' }))}
            >
              800 x 480
            </button>
            <button
              type="button"
              className={activeImage?.orientation === 'portrait' ? 'active' : ''}
              disabled={!activeImage}
              onClick={() => updateActiveImage((entry) => ({ ...entry, orientation: 'portrait' }))}
            >
              480 x 800
            </button>
          </div>

          <label className="control" htmlFor="zoom-range">
            <span>Zoom</span>
            <strong>{activeImage ? `${activeImage.zoom.toFixed(2)}x` : '0.00x'}</strong>
          </label>
          <input
            id="zoom-range"
            min={effectiveMinZoom}
            max={MAX_ZOOM}
            step={0.01}
            type="range"
            value={activeImage?.zoom ?? effectiveMinZoom}
            disabled={!activeImage}
            onChange={(event) =>
              updateActiveImage((entry) => ({
                ...entry,
                zoom: Math.max(effectiveMinZoom, Number(event.target.value)),
              }))
            }
          />

          <div className="zoom-row">
            <button
              type="button"
              className="secondary"
              disabled={!activeImage}
              onClick={() =>
                updateActiveImage((entry) => ({
                  ...entry,
                  zoom: Math.max(effectiveMinZoom, entry.zoom - 0.1),
                }))
              }
            >
              Zoom out
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!activeImage}
              onClick={() =>
                updateActiveImage((entry) => ({
                  ...entry,
                  zoom: Math.min(MAX_ZOOM, entry.zoom + 0.1),
                }))
              }
            >
              Zoom in
            </button>
          </div>

          <div className="zoom-row">
            <button
              type="button"
              className="secondary"
              disabled={!activeImage}
              onClick={() => rotateActiveImage(-ROTATION_STEP)}
            >
              Rotate left 90
            </button>
            <button
              type="button"
              className="secondary"
              disabled={!activeImage}
              onClick={() => rotateActiveImage(ROTATION_STEP)}
            >
              Rotate right 90
            </button>
          </div>

          <p className="muted">Rotation: {activeImage ? `${activeImage.rotationDeg}deg` : '0deg'}</p>

          <label className="checkbox-control" htmlFor="constrain-crop">
            <input
              id="constrain-crop"
              type="checkbox"
              checked={constrainToImage}
              onChange={(e) => setConstrainToImage(e.target.checked)}
            />
            <span>Constrain crop to image</span>
          </label>

          <p className="muted">
            Crop frame behavior and zoom controls are unchanged. Rotation applies to the image under
            the crop frame.
          </p>

          <button
            className="primary"
            type="button"
            disabled={images.length === 0 || isExporting}
            onClick={handleExportAll}
          >
            {isExporting ? 'Exporting...' : `Export all (${images.length})`}
          </button>
          <p className="muted">{status}</p>
        </section>

        <section className="panel stack">
          <h2>Palette</h2>
          <p className="muted">{paletteLabels}</p>
          <p className="muted">Floyd-Steinberg dithering is used for better detail on e-paper.</p>
          {activeImage ? (
            <dl className="meta">
              <div>
                <dt>Source</dt>
                <dd>
                  {activeImage.image.width} x {activeImage.image.height}
                </dd>
              </div>
              <div>
                <dt>File</dt>
                <dd>{activeImage.image.name}</dd>
              </div>
            </dl>
          ) : null}
        </section>
      </aside>

      <main className="workspace">
        {images.length > 0 ? (
          <section className="panel thumbs-panel">
            <div className="thumb-strip" role="list" aria-label="Imported images">
              {images.map((entry) => (
                <article
                  key={entry.id}
                  className={`thumb-card ${entry.id === activeImageId ? 'active' : ''}`}
                  onClick={() => setActiveImageId(entry.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveImageId(entry.id)
                    }
                  }}
                >
                  <img src={entry.image.src} alt={entry.image.name} />
                  <div className="thumb-meta">
                    <span title={entry.image.name}>{entry.image.name}</span>
                    <button
                      type="button"
                      className="thumb-remove"
                      onClick={(event) => {
                        event.stopPropagation()
                        removeImage(entry.id)
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section
          className={`dropzone ${activeImage ? 'loaded' : ''}`}
          onDragEnter={(event) => event.preventDefault()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            void handleDrop(event)
          }}
        >
          {activeImage ? (
            <div className="crop-shell" ref={cropShellRef}>
              <Cropper
                image={activeImage.image.src}
                crop={activeImage.crop}
                zoom={activeImage.zoom}
                minZoom={effectiveMinZoom}
                maxZoom={MAX_ZOOM}
                aspect={aspect}
                cropSize={cropSize}
                showGrid={true}
                objectFit="contain"
                restrictPosition={constrainToImage}
                rotation={activeImage.rotationDeg}
                onCropChange={(crop) =>
                  updateActiveImage((entry) => ({
                    ...entry,
                    crop,
                  }))
                }
                onZoomChange={(value) =>
                  updateActiveImage((entry) => ({
                    ...entry,
                    zoom: Math.max(effectiveMinZoom, Math.min(MAX_ZOOM, value)),
                  }))
                }
                onCropComplete={(_area, pixels) =>
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
              <div className="frame-badge">
                Crop for {outputSize.width} x {outputSize.height}
              </div>
            </div>
          ) : (
            <div className="dropzone-empty">
              <p>Drag one or more images here</p>
              <span>or use the Select images button</span>
            </div>
          )}
        </section>

        <section className="preview-panel panel">
          <div className="preview-header">
            <h2>Preview</h2>
          </div>

          <div className="preview-stage">
            {previewUrl ? (
              <div className="preview-canvas">
                <img src={previewUrl} alt="Preview for PhotoPainter" />
              </div>
            ) : (
              <div className="preview-placeholder">Preview will appear after loading an image.</div>
            )}
          </div>
        </section>
      </main>
    </div>
  )
}

const createImageEntry = (image: LoadedImage): ImageEntry => {
  const orientation: Orientation = 'landscape'
  return {
    id: createId(),
    image,
    crop: INITIAL_CROP,
    zoom: 1,
    croppedAreaPixels: createInitialArea(image, orientation),
    orientation,
    rotationDeg: 0,
    mediaViewport: null,
  }
}

const createInitialArea = (image: LoadedImage, orientation: Orientation): Area => {
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

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.round(Math.random() * 1_000_000)}`
}

const normalizeRotation = (rotation: number) => {
  const normalized = rotation % 360
  return normalized < 0 ? normalized + 360 : normalized
}

const buildWaveshareFileName = (name: string) => {
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

const uniquifyFileNames = (files: BatchExportFile[]): BatchExportFile[] => {
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

const forceOpaqueWhite = (imageData: ImageData) => {
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

const saveBmpInBrowser = async (fileName: string, data: Uint8Array) => {
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

export default App
