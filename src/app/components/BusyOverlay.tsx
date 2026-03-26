type BusyOverlayProps = {
  title: string
  detail: string
  current?: number
  total?: number
}

const clampPercent = (value: number) => Math.min(100, Math.max(0, value))

export function BusyOverlay({ title, detail, current, total }: BusyOverlayProps) {
  const hasProgress = typeof current === 'number' && typeof total === 'number' && total > 0
  const progressPercent = hasProgress ? clampPercent(Math.round((current / total) * 100)) : null

  return (
    <div className="busy-overlay" role="alertdialog" aria-modal="true" aria-live="polite">
      <div className="busy-overlay__backdrop" aria-hidden="true" />
      <section className="busy-overlay__panel panel" aria-busy="true">
        <div className="busy-overlay__spinner" aria-hidden="true" />
        <p className="busy-overlay__eyebrow">Please wait</p>
        <h2 className="busy-overlay__title">{title}</h2>
        <p className="busy-overlay__detail">{detail}</p>

        {hasProgress ? (
          <>
            <div className="busy-overlay__progress" aria-hidden="true">
              <div className="busy-overlay__progress-fill" style={{ width: `${progressPercent}%` }} />
            </div>
            <p className="busy-overlay__progress-label">
              {current}/{total} completed
            </p>
          </>
        ) : (
          <p className="busy-overlay__progress-label">Operation is in progress.</p>
        )}
      </section>
    </div>
  )
}