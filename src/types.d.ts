declare global {
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
    }
  }
}

export {}