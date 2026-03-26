type PreviewPanelProps = {
  previewUrl: string | null
}

export function PreviewPanel({ previewUrl }: PreviewPanelProps) {
  return (
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
  )
}