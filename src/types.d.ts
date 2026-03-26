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
      saveBmpToDirectory: (payload: {
        folderPath: string
        fileName: string
        data: Uint8Array
      }) => Promise<{
        canceled: boolean
        filePath?: string
        error?: string
      }>
      saveProject: (payload: {
        defaultName: string
        project: PhotoPainterProjectPayload
      }) => Promise<{
        canceled: boolean
        filePath?: string
      }>
      beginSaveProjectExport: (payload: {
        defaultName: string
        exportedAt: string
        entries: PhotoPainterProjectPayload['entries']
      }) => Promise<{
        canceled: boolean
        filePath?: string
        error?: string
      }>
      appendProjectExportImage: (payload: {
        filePath: string
        prependComma: boolean
        image: {
          hash: string
          name: string
          mimeType: string
          width: number
          height: number
          data: Uint8Array
        }
      }) => Promise<{
        error?: string
      }>
      finishProjectExport: (payload: {
        filePath: string
      }) => Promise<{
        error?: string
      }>
      abortProjectExport?: (payload: {
        filePath: string
      }) => Promise<{
        error?: string
      }>
      startProjectImport: () => Promise<{
        canceled: boolean
        jobId?: string
        filePath?: string
        error?: string
      }>
      onProjectImportEvent: (callback: (payload: {
        jobId: string
        type: 'progress' | 'image' | 'entry' | 'complete' | 'error'
        phase?: 'decoding' | 'restoring'
        current?: number
        total?: number
        imageName?: string
        image?: {
          hash: string
          name: string
          mimeType: string
          width: number
          height: number
          data: Uint8Array
        }
        entry?: PhotoPainterProjectPayload['entries'][number]
        filePath?: string
        message?: string
      }) => void) => () => void
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