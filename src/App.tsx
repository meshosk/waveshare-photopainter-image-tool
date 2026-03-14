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
  const [orientation, setOrientation] = useState<Orientation>('landscape')
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area>(INITIAL_AREA)
  const [isExporting, setIsExporting] = useState(false)
  const [status, setStatus] = useState('Nahraj obrazok a nastav vyrez pre PhotoPainter.')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  const outputSize = OUTPUT_SIZES[orientation]
  const aspect = outputSize.width / outputSize.height

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
      )
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
  }, [croppedAreaPixels, image, outputSize.height, outputSize.width])

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
      setCrop(INITIAL_CROP)
      setZoom(0.85)
      setStatus(`Nacitany subor ${loaded.name}. Uprav vyrez a exportuj BMP.`)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neznamy problem pri nacitani suboru.'
      setStatus(`Import zlyhal: ${message}`)
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
    setStatus('Pripravujem export pre PhotoPainter...')

    try {
      const sourceImage = await getImageElement(image.src)
      const cropped = await renderCroppedImage(
        sourceImage,
        croppedAreaPixels,
        outputSize.width,
        outputSize.height,
      )
      const dithered = applyPaletteWithDithering(cropped)
      const bmp = imageDataToBmp(dithered)
      const defaultName = buildWaveshareFileName(image.name)
      const saveBridge = window.desktopBridge?.saveBmp

      if (typeof saveBridge === 'function') {
        const result = await saveBridge({ defaultName, data: bmp })
        setStatus(
          result.canceled
            ? 'Export bol zruseny.'
            : `BMP uspesne ulozene: ${result.filePath ?? defaultName}. Pri kopirovani na SD nechaj v /pic iba BMP subory.`,
        )
      } else {
        const browserResult = await saveBmpInBrowser(defaultName, bmp)
        setStatus(
          browserResult.canceled
            ? 'Export bol zruseny.'
            : browserResult.pathHint
              ? `BMP uspesne ulozene: ${browserResult.pathHint}. Pri kopirovani na SD nechaj v /pic iba BMP subory.`
              : `BMP stiahnute v prehliadaci: ${defaultName}. Pri kopirovani na SD nechaj v /pic iba BMP subory.`,
        )
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Neznamy problem pri exporte.'
      setStatus(`Export zlyhal: ${message}`)
    } finally {
      setIsExporting(false)
    }
  }

  const resetView = () => {
    setCrop(INITIAL_CROP)
    setZoom(0.85)
  }

  return (
    <div className="shell">
      <aside className="sidebar">
        <div>
          <p className="eyebrow">Waveshare PhotoPainter</p>
          <h1>Converter s interaktivnym vyrezom a 7-farebnym ditheringom</h1>
          <p className="lede">
            Nahraj fotografiu, nastav presny vyrez, prepni orientaciu a exportuj 24-bit BMP v rozliseni
            800 x 480 alebo 480 x 800.
          </p>
        </div>

        <section className="panel stack">
          <h2>Vstup</h2>
          <button className="primary" type="button" onClick={() => inputRef.current?.click()}>
            Vybrat obrazok
          </button>
          <input
            ref={inputRef}
            hidden
            accept={ACCEPTED_FORMATS}
            type="file"
            onChange={handleFileSelection}
          />
          <p className="muted">Podporovane formaty: JPG, PNG, WebP, BMP, GIF, HEIC.</p>
        </section>

        <section className="panel stack">
          <h2>Vystup</h2>
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
            <button type="button" className="secondary" onClick={() => setZoom((current) => Math.max(MIN_ZOOM, current - 0.1))}>
              Oddialit
            </button>
            <button type="button" className="secondary" onClick={resetView}>
              Fit
            </button>
            <button type="button" className="secondary" onClick={() => setZoom((current) => Math.min(MAX_ZOOM, current + 0.1))}>
              Priblizit
            </button>
          </div>
          <p className="muted">Vyrez umiestnuj priamo mysou na zdrojovom obrazku. Zoom meni mierku podkladoveho obrazka.</p>

          <button className="primary" type="button" disabled={!image || isExporting} onClick={handleExport}>
            {isExporting ? 'Exportujem...' : 'Export BMP'}
          </button>
          <p className="muted">{status}</p>
        </section>

        <section className="panel stack">
          <h2>Paleta</h2>
          <p className="muted">{paletteLabels}</p>
          <p className="muted">Pouziva sa Floyd-Steinberg dithering pre lepsi detail na e-paperi.</p>
          {image ? (
            <dl className="meta">
              <div>
                <dt>Zdroj</dt>
                <dd>{image.width} x {image.height}</dd>
              </div>
              <div>
                <dt>Subor</dt>
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
            <div className="crop-shell">
              <Cropper
                image={image.src}
                crop={crop}
                zoom={zoom}
                minZoom={MIN_ZOOM}
                maxZoom={MAX_ZOOM}
                aspect={aspect}
                showGrid={true}
                objectFit="contain"
                onCropChange={setCrop}
                onZoomChange={setZoom}
                onCropComplete={(_area, pixels) => setCroppedAreaPixels(pixels)}
              />
              <div className="frame-badge">Vyrez pre {outputSize.width} x {outputSize.height}</div>
            </div>
          ) : (
            <div className="dropzone-empty">
              <p>Pretiahni obrazok sem</p>
              <span>alebo pouzi tlacidlo Vybrat obrazok</span>
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
                <img src={previewUrl} alt="Preview pre PhotoPainter" />
              </div>
            ) : (
              <div className="preview-placeholder">Preview sa zobrazi po nacitani obrazka.</div>
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