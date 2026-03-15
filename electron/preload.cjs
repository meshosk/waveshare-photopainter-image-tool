const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopBridge', {
  saveBmp: (payload) => ipcRenderer.invoke('dialog:save-bmp', payload),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  exportBatchBmp: (payload) => ipcRenderer.invoke('dialog:export-batch-bmp', payload),
})