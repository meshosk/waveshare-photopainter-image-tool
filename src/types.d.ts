declare global {
  interface Window {
    desktopBridge?: {
      saveBmp: (payload: { defaultName: string; data: Uint8Array }) => Promise<{
        canceled: boolean
        filePath?: string
      }>
    }
  }
}

export {}