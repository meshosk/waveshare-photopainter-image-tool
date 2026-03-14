import { useEffect, useMemo, useRef, useState } from 'react'
import Cropper, { type Area } from 'react-easy-crop'
import { imageDataToBmp } from './bmp'
import { applyPaletteWithDithering, PHOTO_PAINTER_PALETTE } from './color'
import { OUTPUT_SIZES, type Orientation, renderCroppedImage } from './crop'
import { getImageElement, loadImageFile, releaseImage, type LoadedImage } from './image'

const ACCEPTED_FORMATS = '.jpg,.jpeg,.png,.webp,.bmp,.gif,.heic,.heif'

const INITIAL_CROP = { x: 0, y: 0 }
const INITIAL_AREA: Area = { x: 0, y: 0, width: 800, height: 480 }
const MIN_ZOOM = 0.4
const MAX_ZOOM = 5

function App() {
  const [image, setImage] = useState<LoadedImage | null>(null)
  const [crop, setCrop] = useState(INITIAL_CROP)
  const [zoom, setZoom] = useState(1)
  const [cropSize, setCropSize] = useState<{ width: number; height: number } | undefined>(undefined)
  const [mediaViewport, setMediaViewport] = useState<{
    width: number
    height: number
    naturalWidth: number
    naturalHeight: number
  } | null>(null)
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area>(INITIAL_AREA)
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState('Upload an image and place the crop for PhotoPainter.')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const cropShellRef = useRef<HTMLDivElement | null>(null)

  const outputSize = OUTPUT_SIZES[orientation]
  const aspect = outputSize.width / outputSize.height

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
  }, [aspect, image])

  useEffect(() => {
    return () => {
      if (image) {
        releaseImage(image.src)
      }
    }
  }, [image])

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
      if (!image) {
        if (!isCancelled) {
          setPreviewUrl(null)
        }
        return
      }

      const previewImage = await getImageElement(image.src)
      const cropped = await renderCroppedImage(
        previewImage,
        croppedAreaPixels,
        outputSize.width,
        outputSize.height,
        cropSize && mediaViewport
          ? {
              crop,
              zoom,
              cropSize,
              media: mediaViewport,
            }
          : undefined,
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
  }, [crop, cropSize, croppedAreaPixels, image, mediaViewport, outputSize.height, outputSize.width, zoom])

  const paletteLabels = useMemo(
    () => PHOTO_PAINTER_PALETTE.map((entry) => entry.name).join(', '),
    [],
  )

  const handleFileSelection = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    if (!selectedFile) {
      return
    }

    await importImage(selectedFile)
    event.target.value = ''
  }

  const importImage = async (file: File) => {
    try {
      const loaded = await loadImageFile(file)
      setImage((current) => {
        if (current) {
          releaseImage(current.src)
        }
        return loaded
      })
      setMediaViewport(null)
      setCrop(INITIAL_CROP)
      setZoom(1)
      setStatus(`Loaded file ${loaded.name}. Adjust the crop and export BMP.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown problem while loading the file.'
      setStatus(`Import failed: ${message}`)
    }
  }

  const handleDrop = async (event: React.DragEvent<HTMLElement>) => {
    event.preventDefault()
    const file = event.dataTransfer.files?.[0]
    if (!file) {
      return
    }

    await importImage(file)
  }

  const handleExport = async () => {
    if (!image) {
      return
    }

    setIsExporting(true)
    setStatus('Preparing export for PhotoPainter...')

    try {
      const sourceImage = await getImageElement(image.src)
      const cropped = await renderCroppedImage(
        sourceImage,
        croppedAreaPixels,
        outputSize.width,
        outputSize.height,
        cropSize && mediaViewport
          ? {
              crop,
              zoom,
              cropSize,
              media: mediaViewport,
            }
          : undefined,
      )
      forceOpaqueWhite(cropped)
      const dithered = applyPaletteWithDithering(cropped)
      const bmp = imageDataToBmp(dithered)
      const defaultName = buildWaveshareFileName(image.name)
      const saveBridge = window.desktopBridge?.saveBmp

      if (typeof saveBridge === 'function') {
        const result = await saveBridge({ defaultName, data: bmp })
        setStatus(
          result.canceled
            ? 'Export was canceled.'
            : `BMP saved successfully: ${result.filePath ?? defaultName}. Keep only BMP files in /pic when copying to SD.`,
        )
      } else {
        const browserResult = await saveBmpInBrowser(defaultName, bmp)
        setStatus(
          browserResult.canceled
            ? 'Export was canceled.'
            : browserResult.pathHint
              ? `BMP saved successfully: ${browserResult.pathHint}. Keep only BMP files in /pic when copying to SD.`
              : `BMP downloaded in browser: ${defaultName}. Keep only BMP files in /pic when copying to SD.`,
        )
      }
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
            Upload a photo, place the exact crop, switch orientation, and export a 24-bit BMP at
            800 x 480 or 480 x 800.
          </p>
        </div>

        <section className="panel stack">
          <h2>Input</h2>
          <button className="primary" type="button" onClick={() => inputRef.current?.click()}>
            Select image
          </button>
          <input
            ref={inputRef}
            hidden
            accept={ACCEPTED_FORMATS}
            type="file"
            onChange={handleFileSelection}
          />
          <p className="muted">Supported formats: JPG, PNG, WebP, BMP, GIF, HEIC.</p>
        </section>

        <section className="panel stack">
          <h2>Output</h2>
          <div className="segmented">
            <button
              type="button"
              className={orientation === 'landscape' ? 'active' : ''}
              onClick={() => setOrientation('landscape')}
            >
              800 x 480
            </button>
            <button
              type="button"
              className={orientation === 'portrait' ? 'active' : ''}
              onClick={() => setOrientation('portrait')}
            >
              480 x 800
            </button>
          </div>

          <label className="control" htmlFor="zoom-range">
            <span>Zoom</span>
            <strong>{zoom.toFixed(2)}x</strong>
          </label>
          <input
            id="zoom-range"
            min={MIN_ZOOM}
            max={MAX_ZOOM}
            step={0.01}
            type="range"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />

          <div className="zoom-row">
            <button
              type="button"
              className="secondary"
              onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 0.1))}
            >
              Zoom out
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 0.1))}
            >
              Zoom in
            </button>
          </div>
          <p className="muted">Place the crop directly on the source image with your mouse. Zoom changes image scale.</p>

          <button className="primary" type="button" disabled={!image || isExporting} onClick={handleExport}>
            {isExporting ? 'Exporting...' : 'Export BMP'}
          </button>
          <p className="muted">{status}</p>
        </section>

        <section className="panel stack">
          <h2>Palette</h2>
          <p className="muted">{paletteLabels}</p>
          <p className="muted">Floyd-Steinberg dithering is used for better detail on e-paper.</p>
          {image ? (
            <dl className="meta">
              <div>
                <dt>Source</dt>
                <dd>{image.width} x {image.height}</dd>
              </div>
              <div>
                <dt>File</dt>
                <dd>{image.name}</dd>
              </div>
            </dl>
          ) : null}
        </section>
      </aside>

      <main className="workspace">
        <section
          className={`dropzone ${image ? 'loaded' : ''}`}
          onDragEnter={(event) => event.preventDefault()}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            void handleDrop(event)
          }}
        >
          {image ? (
            <div className="crop-shell" ref={cropShellRef}>
              <Cropper
                image={image.src}
                crop={crop}
                zoom={zoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                aspect={aspect}
                cropSize={cropSize}
                showGrid={true}
                objectFit="contain"
                restrictPosition={false}
                onCropChange={setCrop}
                onZoomChange={(value) => setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, value)))}
                onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
                onMediaLoaded={(media) =>
                  setMediaViewport({
                    width: media.width,
                    height: media.height,
                    naturalWidth: media.naturalWidth ?? media.width,
                    naturalHeight: media.naturalHeight ?? media.height,
                  })
                }
              />
              <div className="frame-badge">Crop for {outputSize.width} x {outputSize.height}</div>
            </div>
          ) : (
            <div className="dropzone-empty">
              <p>Drag an image here</p>
              <span>or use the Select image button</span>
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

const buildWaveshareFileName = (name: string) => {
  const base = stripExtension(name)
  const sanitized = base
    .normalize('NFKD')
    .replace(/[^A-Za-z0-9]/g, '')
    .toUpperCase()

  const stem = sanitized.slice(0, 8) || `PIC${Date.now().toString().slice(-5).padStart(5, '0')}`
  return `${stem}.BMP`
}

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
  const picker = (
    window as Window & {
      showSaveFilePicker?: (options: {
        suggestedName?: string
        types?: Array<{ description?: string; accept: Record<string, string[]> }>
      }) => Promise<{
        createWritable: () => Promise<{ write: (input: BufferSource | Blob) => Promise<void>; close: () => Promise<void> }>
        name?: string
      }>
    }
  ).showSaveFilePicker

  if (typeof picker === 'function') {
    try {
      const handle = await picker({
        suggestedName: fileName,
        types: [{ description: 'Bitmap image', accept: { 'image/bmp': ['.bmp'] } }],
      })
      const writable = await handle.createWritable()
      const bytes = new Uint8Array(data.byteLength)
      bytes.set(data)
      await writable.write(bytes)
      await writable.close()
      return { canceled: false, pathHint: handle.name ?? fileName }
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        return { canceled: true }
      }
    }
  }

  downloadBmp(fileName, data)
  return { canceled: false }
}

const downloadBmp = (fileName: string, data: Uint8Array) => {
  const bytes = new Uint8Array(data.byteLength)
  bytes.set(data)
  const blob = new Blob([bytes], { type: 'image/bmp' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}

export default App