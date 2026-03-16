const { app, BrowserWindow, dialog, ipcMain } = require('electron')
const fs = require('node:fs/promises')
const fsSync = require('node:fs')
const os = require('node:os')
const path = require('node:path')

app.commandLine.appendSwitch('enable-gpu-rasterization')
app.commandLine.appendSwitch('enable-zero-copy')
app.commandLine.appendSwitch('ignore-gpu-blocklist')

const FALLBACK_LOG_PATHS = [
  path.join(os.homedir(), 'Library', 'Logs', 'photopainter-converter', 'runtime.log'),
  path.join(os.tmpdir(), 'photopainter-converter-runtime.log'),
]

const getLogFilePath = () => {
  try {
    return path.join(app.getPath('userData'), 'runtime.log')
  } catch {
    return FALLBACK_LOG_PATHS[0]
  }
}

const formatLogEntry = (tag, payload) => {
  const timestamp = new Date().toISOString()
  const content = typeof payload === 'string' ? payload : JSON.stringify(payload)
  return `[${timestamp}] ${tag} ${content}\n`
}

const appendRuntimeLog = (tag, payload) => {
  const targets = [getLogFilePath(), ...FALLBACK_LOG_PATHS]
  const uniqueTargets = [...new Set(targets)]

  try {
    for (const logFilePath of uniqueTargets) {
      fsSync.mkdirSync(path.dirname(logFilePath), { recursive: true })
      fsSync.appendFileSync(logFilePath, formatLogEntry(tag, payload), 'utf8')
    }
  } catch (error) {
    console.error('[runtime-log] failed to write log file', error)
  }
}

appendRuntimeLog('boot.main-module-loaded', {
  pid: process.pid,
  cwd: process.cwd(),
  execPath: process.execPath,
  platform: process.platform,
  versions: process.versions,
})

process.on('uncaughtException', (error) => {
  console.error('[process] uncaughtException', error)
  appendRuntimeLog('process.uncaughtException', {
    message: error?.message,
    stack: error?.stack,
  })
})

process.on('unhandledRejection', (reason) => {
  console.error('[process] unhandledRejection', reason)
  appendRuntimeLog('process.unhandledRejection', {
    reason: String(reason),
  })
})

const pickExistingPath = (candidates) => {
  for (const candidate of candidates) {
    if (fsSync.existsSync(candidate)) {
      return candidate
    }
  }
  return null
}

const resolvePreloadPath = () => {
  const candidates = [
    path.join(__dirname, 'preload.cjs'),
    path.resolve(__dirname, '..', 'electron', 'preload.cjs'),
    path.join(process.resourcesPath, 'app', 'electron', 'preload.cjs'),
    path.join(process.resourcesPath, 'app.asar', 'electron', 'preload.cjs'),
  ]

  const preloadPath = pickExistingPath(candidates)
  appendRuntimeLog('preload.resolve', { candidates, preloadPath })
  return preloadPath
}

const resolveRendererIndexPath = () => {
  const candidates = [
    path.resolve(__dirname, '..', 'dist', 'index.html'),
    path.join(app.getAppPath(), 'dist', 'index.html'),
    path.join(process.resourcesPath, 'app', 'dist', 'index.html'),
    path.join(process.resourcesPath, 'app.asar', 'dist', 'index.html'),
  ]

  const indexPath = pickExistingPath(candidates)
  appendRuntimeLog('renderer.index.resolve', { candidates, indexPath })
  return indexPath
}

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

  window.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL) => {
    const payload = { errorCode, errorDescription, validatedURL }
    console.error('[renderer] did-fail-load', payload)
    appendRuntimeLog('renderer.did-fail-load', payload)

    dialog.showErrorBox(
      'Renderer Failed To Load',
      `The app UI failed to load.\n\nError: ${errorDescription} (${errorCode})\nURL: ${validatedURL}\n\nRuntime log: ${getLogFilePath()}`,
    )
  })

  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[renderer] render-process-gone', details)
    appendRuntimeLog('renderer.render-process-gone', details)
  })

  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level <= 2) {
      const payload = { level, message, line, sourceId }
      console.error('[renderer] console', payload)
      appendRuntimeLog('renderer.console', payload)
    }
  })

  const indexPath = resolveRendererIndexPath()
  const indexExists = Boolean(indexPath)

  appendRuntimeLog('renderer.entry.check', {
    indexPath,
    indexExists,
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath,
    dirname: __dirname,
  })

  if (!indexExists) {
    dialog.showErrorBox(
      'Renderer Entry Missing',
      `Cannot find renderer entry file.\n\nResolved path: ${String(indexPath)}\n\nappPath: ${app.getAppPath()}\nresourcesPath: ${process.resourcesPath}\n__dirname: ${__dirname}`,
    )
    throw new Error(`Missing renderer entry: ${indexPath}`)
  }

  window.webContents.on('did-finish-load', () => {
    appendRuntimeLog('renderer.did-finish-load', {
      url: window.webContents.getURL(),
      title: window.getTitle(),
    })
  })

  appendRuntimeLog('renderer.loadFile', { indexPath })

  try {
    await window.loadFile(indexPath)
  } catch (error) {
    appendRuntimeLog('renderer.loadFile.error', {
      message: error?.message,
      stack: error?.stack,
      indexPath,
    })

    dialog.showErrorBox(
      'Failed To Open Renderer Entry',
      `Could not open renderer entry file.\n\nPath: ${indexPath}\n\nError: ${error?.message ?? 'Unknown error'}\n\nRuntime log: ${getLogFilePath()}`,
    )

    throw error
  }
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

ipcMain.handle('dialog:select-directory', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Select export folder',
    properties: ['openDirectory', 'createDirectory'],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  return {
    canceled: false,
    folderPath: result.filePaths[0],
  }
})

ipcMain.handle('dialog:export-batch-bmp', async (_event, payload) => {
  const { folderPath, files } = payload
  const failed = []
  let savedCount = 0

  for (const file of files) {
    const destination = path.join(folderPath, file.fileName)
    try {
      await fs.writeFile(destination, Buffer.from(file.data))
      savedCount += 1
    } catch (error) {
      failed.push({
        fileName: file.fileName,
        message: error instanceof Error ? error.message : 'Unknown write error',
      })
    }
  }

  return {
    canceled: false,
    folderPath,
    savedCount,
    failed,
  }
})

ipcMain.handle('dialog:save-project', async (_event, payload) => {
  const defaultName =
    typeof payload?.defaultName === 'string' && payload.defaultName.trim()
      ? payload.defaultName
      : 'project.photopaint'

  const result = await dialog.showSaveDialog({
    title: 'Save PhotoPainter project',
    defaultPath: defaultName,
    filters: [
      { name: 'PhotoPainter project', extensions: ['photopaint'] },
      { name: 'JSON', extensions: ['json'] },
    ],
  })

  if (result.canceled || !result.filePath) {
    return { canceled: true }
  }

  const serialized = JSON.stringify(payload?.project ?? {}, null, 2)
  await fs.writeFile(result.filePath, serialized, 'utf8')
  return { canceled: false, filePath: result.filePath }
})

ipcMain.handle('dialog:load-project', async () => {
  const result = await dialog.showOpenDialog({
    title: 'Open PhotoPainter project',
    properties: ['openFile'],
    filters: [
      { name: 'PhotoPainter project', extensions: ['photopaint', 'json'] },
      { name: 'All files', extensions: ['*'] },
    ],
  })

  if (result.canceled || result.filePaths.length === 0) {
    return { canceled: true }
  }

  const filePath = result.filePaths[0]

  try {
    const text = await fs.readFile(filePath, 'utf8')
    const project = JSON.parse(text)
    return { canceled: false, filePath, project }
  } catch (error) {
    return {
      canceled: false,
      filePath,
      error: error instanceof Error ? error.message : 'Unable to parse project file',
    }
  }
})

app.whenReady().then(async () => {
  appendRuntimeLog('app.whenReady', {
    userDataPath: app.getPath('userData'),
    appPath: app.getAppPath(),
  })

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