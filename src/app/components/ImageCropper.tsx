import Cropper, { type Area } from 'react-easy-crop'
import type { CropPoint, ImageEntry } from '../types'

type ImageCropperProps = {
  activeImage: ImageEntry | null
  cropShellRef: React.RefObject<HTMLDivElement | null>
  cropSize: { width: number; height: number } | undefined
  aspect: number
  effectiveMinZoom: number
  maxZoom: number
  outputSize: { width: number; height: number }
  onDrop: (event: React.DragEvent<HTMLElement>) => void | Promise<void>
  onCropChange: (crop: CropPoint) => void
  onZoomChange: (zoom: number) => void
  onCropComplete: (pixels: Area) => void
  onMediaLoaded: (media: { width: number; height: number; naturalWidth?: number; naturalHeight?: number }) => void
}

export function ImageCropper({
  activeImage,
  cropShellRef,
  cropSize,
  aspect,
  effectiveMinZoom,
  maxZoom,
  outputSize,
  onDrop,
  onCropChange,
  onZoomChange,
  onCropComplete,
  onMediaLoaded,
}: ImageCropperProps) {
  return (
    <section
      className={`dropzone ${activeImage ? 'loaded' : ''}`}
      onDragEnter={(event) => event.preventDefault()}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        void onDrop(event)
      }}
    >
      {activeImage ? (
        <div className="crop-shell" ref={cropShellRef}>
          <Cropper
            image={activeImage.image.src}
            crop={activeImage.crop}
            zoom={activeImage.zoom}
            minZoom={effectiveMinZoom}
            maxZoom={maxZoom}
            aspect={aspect}
            cropSize={cropSize}
            showGrid={true}
            objectFit="contain"
            restrictPosition={activeImage.constrainToImage}
            rotation={activeImage.rotationDeg}
            onCropChange={onCropChange}
            onZoomChange={onZoomChange}
            onCropComplete={(_area, pixels) => onCropComplete(pixels)}
            onMediaLoaded={onMediaLoaded}
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
  )
}