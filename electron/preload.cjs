const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopBridge', {
  saveBmp: (payload) => ipcRenderer.invoke('dialog:save-bmp', payload),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  exportBatchBmp: (payload) => ipcRenderer.invoke('dialog:export-batch-bmp', payload),
  saveBmpToDirectory: (payload) => ipcRenderer.invoke('dialog:save-bmp-to-directory', payload),
  saveProject: (payload) => ipcRenderer.invoke('dialog:save-project', payload),
  loadProject: () => ipcRenderer.invoke('dialog:load-project'),
})