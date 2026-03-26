import type { ImageEntry } from '../types'

type ImageThumbnailStripProps = {
  images: ImageEntry[]
  activeImageId: string | null
  onSelect: (id: string) => void
  onRemove: (id: string) => void
}

export function ImageThumbnailStrip({
  images,
  activeImageId,
  onSelect,
  onRemove,
}: ImageThumbnailStripProps) {
  if (images.length === 0) {
    return null
  }

  return (
    <section className="panel thumbs-panel">
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
      </div>
    </section>
  )
}