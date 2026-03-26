import { useRef, useState } from 'react'
import type { ImageEntry } from '../types'

type ImageThumbnailStripProps = {
  images: ImageEntry[]
  activeImageId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
  onDrop: (event: React.DragEvent<HTMLElement>) => void | Promise<void>
}

const hasFilePayload = (event: React.DragEvent<HTMLElement>) => event.dataTransfer.types.includes('Files')

export function ImageThumbnailStrip({
  images,
  activeImageId,
  onSelect,
  onRemove,
  onDrop,
}: ImageThumbnailStripProps) {
  const dragDepthRef = useRef(0)
  const [isDragActive, setIsDragActive] = useState(false)

  if (images.length === 0) {
    return null
  }

  return (
    <section
      className={`panel thumbs-panel ${isDragActive ? 'drag-active' : ''}`}
      onDragEnter={(event) => {
        if (!hasFilePayload(event)) {
          return
        }

        event.preventDefault()
        dragDepthRef.current += 1
        setIsDragActive(true)
      }}
      onDragOver={(event) => {
        if (!hasFilePayload(event)) {
          return
        }

        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDragLeave={(event) => {
        if (!hasFilePayload(event)) {
          return
        }

        event.preventDefault()
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1)

        if (dragDepthRef.current === 0) {
          setIsDragActive(false)
        }
      }}
      onDrop={(event) => {
        if (!hasFilePayload(event)) {
          return
        }

        dragDepthRef.current = 0
        setIsDragActive(false)
        void onDrop(event)
      }}
    >
      <div className="thumb-strip" role="list" aria-label="Imported images">
        {images.map((entry) => (
          <article
            key={entry.id}
            className={`thumb-card ${entry.id === activeImageId ? 'active' : ''}`}
            onClick={() => onSelect(entry.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onSelect(entry.id)
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
                  onRemove(entry.id)
                }}
              >
                Remove
              </button>
            </div>
          </article>
        ))}

        <div className="thumb-add-drop" aria-hidden="true">
          <strong>Drop more images here</strong>
          <span>or use Select images</span>
        </div>
      </div>
    </section>
  )
}