import { PHOTO_PAINTER_PALETTE } from '../../color'
import type { CropPoint, ImageEntry } from '../types'
import { ACCEPTED_FORMATS, MAX_ZOOM, PROJECT_FILE_FORMATS } from '../constants'

type EditorSidebarProps = {
  activeImage: ImageEntry | null
  imagesCount: number
  isExporting: boolean
  isProjectBusy: boolean
  status: string
  effectiveMinZoom: number
  onOpenImages: () => void
  onExportProject: () => void
  onOpenProject: () => void
  inputRef: React.RefObject<HTMLInputElement | null>
  projectInputRef: React.RefObject<HTMLInputElement | null>
  onImageInputChange: (event: React.ChangeEvent<HTMLInputElement>) => void
  onProjectInputChange: () => void
  onOrientationChange: (orientation: 'landscape' | 'portrait') => void
  onZoomChange: (zoom: number) => void
  onZoomStep: (delta: number) => void
  onRotate: (delta: number) => void
  onConstrainToggle: (value: boolean) => void
  onExportAll: () => void
}

const paletteLabels = PHOTO_PAINTER_PALETTE.map((entry) => entry.name).join(', ')

export function EditorSidebar({
  activeImage,
  imagesCount,
  isExporting,
  isProjectBusy,
  status,
  effectiveMinZoom,
  onOpenImages,
  onExportProject,
  onOpenProject,
  inputRef,
  projectInputRef,
  onImageInputChange,
  onProjectInputChange,
  onOrientationChange,
  onZoomChange,
  onZoomStep,
  onRotate,
  onConstrainToggle,
  onExportAll,
}: EditorSidebarProps) {
  return (
    <aside className="sidebar">
      <div>
        <p className="eyebrow">The meshosk and AI presents</p>
        <h1>Waveshare PhotoPainter image tool</h1>
        <p className="lede">
          Upload photos, tune crop per image, rotate by 90 degrees, and export 24-bit BMP files for
          800 x 480 or 480 x 800 panels.
        </p>
      </div>

      <section className="panel stack">
        <h2>Input</h2>
        <button className="primary" type="button" onClick={onOpenImages}>
          Select images
        </button>
        <button
          className="secondary"
          type="button"
          disabled={isProjectBusy || isExporting || imagesCount === 0}
          onClick={onExportProject}
        >
          {isProjectBusy ? 'Working...' : 'Export project (.photopaint)'}
        </button>
        <button
          className="secondary"
          type="button"
          disabled={isProjectBusy || isExporting}
          onClick={onOpenProject}
        >
          {isProjectBusy ? 'Working...' : 'Import project (.photopaint)'}
        </button>
        <input
          ref={inputRef}
          hidden
          accept={ACCEPTED_FORMATS}
          type="file"
          multiple
          onChange={onImageInputChange}
        />
        <input
          ref={projectInputRef}
          hidden
          accept={PROJECT_FILE_FORMATS}
          type="file"
          onChange={onProjectInputChange}
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
            onClick={() => onOrientationChange('landscape')}
          >
            800 x 480
          </button>
          <button
            type="button"
            className={activeImage?.orientation === 'portrait' ? 'active' : ''}
            disabled={!activeImage}
            onClick={() => onOrientationChange('portrait')}
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
          onChange={(event) => onZoomChange(Number(event.target.value))}
        />

        <div className="zoom-row">
          <button
            type="button"
            className="secondary"
            disabled={!activeImage}
            onClick={() => onZoomStep(-0.1)}
          >
            Zoom out
          </button>
          <button
            type="button"
            className="secondary"
            disabled={!activeImage}
            onClick={() => onZoomStep(0.1)}
          >
            Zoom in
          </button>
        </div>

        <div className="zoom-row">
          <button type="button" className="secondary" disabled={!activeImage} onClick={() => onRotate(-90)}>
            Rotate left 90
          </button>
          <button type="button" className="secondary" disabled={!activeImage} onClick={() => onRotate(90)}>
            Rotate right 90
          </button>
        </div>

        <p className="muted">Rotation: {activeImage ? `${activeImage.rotationDeg}deg` : '0deg'}</p>

        <label className="checkbox-control" htmlFor="constrain-crop">
          <input
            id="constrain-crop"
            type="checkbox"
            checked={activeImage?.constrainToImage ?? false}
            disabled={!activeImage}
            onChange={(event) => onConstrainToggle(event.target.checked)}
          />
          <span>Constrain crop to image</span>
        </label>

        <p className="muted">
          Crop frame behavior and zoom controls are unchanged. Rotation applies to the image under the
          crop frame.
        </p>

        <button
          className="primary"
          type="button"
          disabled={imagesCount === 0 || isExporting || isProjectBusy}
          onClick={onExportAll}
        >
          {isExporting ? 'Exporting...' : `Export all (${imagesCount})`}
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
  )
}