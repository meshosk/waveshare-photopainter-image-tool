const { contextBridge, ipcRenderer } = require('electron')

const onProjectImportEvent = (callback) => {
  const listener = (_event, payload) => callback(payload)
  ipcRenderer.on('project-import:event', listener)
  return () => {
    ipcRenderer.removeListener('project-import:event', listener)
  }
}

contextBridge.exposeInMainWorld('desktopBridge', {
  saveBmp: (payload) => ipcRenderer.invoke('dialog:save-bmp', payload),
  selectDirectory: () => ipcRenderer.invoke('dialog:select-directory'),
  exportBatchBmp: (payload) => ipcRenderer.invoke('dialog:export-batch-bmp', payload),
  saveBmpToDirectory: (payload) => ipcRenderer.invoke('dialog:save-bmp-to-directory', payload),
  saveProject: (payload) => ipcRenderer.invoke('dialog:save-project', payload),
  beginSaveProjectExport: (payload) => ipcRenderer.invoke('dialog:begin-save-project-export', payload),
  appendProjectExportImage: (payload) => ipcRenderer.invoke('dialog:append-project-export-image', payload),
  finishProjectExport: (payload) => ipcRenderer.invoke('dialog:finish-project-export', payload),
  abortProjectExport: (payload) => ipcRenderer.invoke('dialog:abort-project-export', payload),
  startProjectImport: () => ipcRenderer.invoke('dialog:start-project-import'),
  onProjectImportEvent,
  loadProject: () => ipcRenderer.invoke('dialog:load-project'),
})