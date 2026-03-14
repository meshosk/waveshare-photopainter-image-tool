const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('desktopBridge', {
  saveBmp: (payload) => ipcRenderer.invoke('dialog:save-bmp', payload),
})