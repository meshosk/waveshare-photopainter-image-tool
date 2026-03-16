declare global {
  type PhotoPainterProjectPayload = {
    app: 'photopainter-converter'
    exportedAt: string
    images: Array<{
      hash: string
      name: string
      mimeType: string
      width: number
      height: number
      dataBase64: string
    }>
    entries: Array<{
      imageHash: string
      crop: { x: number; y: number }
      zoom: number
      croppedAreaPixels: { x: number; y: number; width: number; height: number }
      orientation: 'landscape' | 'portrait'
      rotationDeg: number
      constrainToImage: boolean
    }>
  }

  interface Window {
    desktopBridge?: {
      saveBmp: (payload: { defaultName: string; data: Uint8Array }) => Promise<{
        canceled: boolean
        filePath?: string
      }>
      selectDirectory: () => Promise<{
        canceled: boolean
        folderPath?: string
      }>
      exportBatchBmp: (payload: {
        folderPath: string
        files: Array<{ fileName: string; data: Uint8Array }>
      }) => Promise<{
        canceled: boolean
        folderPath?: string
        savedCount?: number
        failed?: Array<{ fileName: string; message: string }>
      }>
      saveProject: (payload: {
        defaultName: string
        project: PhotoPainterProjectPayload
      }) => Promise<{
        canceled: boolean
        filePath?: string
      }>
      loadProject: () => Promise<{
        canceled: boolean
        filePath?: string
        project?: PhotoPainterProjectPayload
        error?: string
      }>
    }
  }
}

export {}