const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')

const createWindow = async () => {
  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 820,
    backgroundColor: '#f4efe7',
    title: 'PhotoPainter Converter',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'))
}

ipcMain.handle('dialog:save-bmp', async (_event, payload) => {
  const { defaultName, data } = payload
  const result = await dialog.showSaveDialog({
    title: 'Export PhotoPainter BMP',
    defaultPath: defaultName,
    filters: [{ name: 'Bitmap image', extensions: ['bmp'] }],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  await fs.writeFile(result.filePath, Buffer.from(data))
  return { canceled: false, filePath: result.filePath }
})

app.whenReady().then(async () => {
  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})