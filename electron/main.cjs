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

const pendingProjectExports = new Map()

const isWhitespace = (char) => char === ' ' || char === '\n' || char === '\r' || char === '\t'

async function* streamTopLevelArrayObjects(filePath, key) {
  const keyToken = `"${key}"`
  const input = fsSync.createReadStream(filePath, { encoding: 'utf8' })
  let buffer = ''
  let cursor = 0
  let state = 'seek-key'
  let objectStart = -1
  let depth = 0
  let inString = false
  let isEscaped = false

  const trimBuffer = (count) => {
    if (count <= 0) {
      return
    }

    buffer = buffer.slice(count)
    cursor = Math.max(0, cursor - count)
    if (objectStart >= 0) {
      objectStart = Math.max(0, objectStart - count)
    }
  }

  for await (const chunk of input) {
    buffer += chunk

    parseLoop: while (cursor < buffer.length) {
      if (state === 'seek-key') {
        const keyIndex = buffer.indexOf(keyToken, cursor)
        if (keyIndex === -1) {
          const keepFrom = Math.max(0, buffer.length - (keyToken.length + 32))
          trimBuffer(keepFrom)
          break parseLoop
        }

        cursor = keyIndex + keyToken.length
        state = 'seek-array-start'
      }

      if (state === 'seek-array-start') {
        while (cursor < buffer.length) {
          const current = buffer[cursor]
          if (current === '[') {
            cursor += 1
            state = 'seek-object'
            continue parseLoop
          }

          if (current === ':' || isWhitespace(current)) {
            cursor += 1
            continue
          }

          throw new Error(`Invalid project file structure near ${key}.`)
        }

        break parseLoop
      }

      if (state === 'seek-object') {
        while (cursor < buffer.length) {
          const current = buffer[cursor]
          if (current === ']') {
            return
          }

          if (current === ',' || isWhitespace(current)) {
            cursor += 1
            continue
          }

          if (current === '{') {
            objectStart = cursor
            depth = 1
            inString = false
            isEscaped = false
            cursor += 1
            state = 'in-object'
            continue parseLoop
          }

          throw new Error(`Unexpected token while reading ${key} array.`)
        }

        break parseLoop
      }

      if (state === 'in-object') {
        while (cursor < buffer.length) {
          const current = buffer[cursor]

          if (inString) {
            if (isEscaped) {
              isEscaped = false
            } else if (current === '\\') {
              isEscaped = true
            } else if (current === '"') {
              inString = false
            }
          } else if (current === '"') {
            inString = true
          } else if (current === '{') {
            depth += 1
          } else if (current === '}') {
            depth -= 1
          }

          cursor += 1

          if (depth === 0) {
            const serialized = buffer.slice(objectStart, cursor)
            state = 'seek-object'
            objectStart = -1
            if (cursor > 1024 * 1024) {
              trimBuffer(cursor)
            }
            yield JSON.parse(serialized)
            continue parseLoop
          }
        }

        if (objectStart > 0) {
          trimBuffer(objectStart)
          objectStart = 0
        }
        break parseLoop
      }
    }
  }

  if (state !== 'seek-object') {
    throw new Error(`Unexpected end of project file while reading ${key}.`)
  }
}

const streamProjectImport = async (webContents, jobId, filePath) => {
  const sendEvent = (payload) => {
    if (!webContents.isDestroyed()) {
      webContents.send('project-import:event', { jobId, filePath, ...payload })
    }
  }

  try {
    sendEvent({ type: 'progress', phase: 'decoding', current: 0, total: undefined, imageName: 'Scanning project file...' })

    let imageIndex = 0
    for await (const value of streamTopLevelArrayObjects(filePath, 'images')) {
      imageIndex += 1
      sendEvent({
        type: 'progress',
        phase: 'decoding',
        current: imageIndex,
        total: undefined,
        imageName: value?.name,
      })
      sendEvent({
        type: 'image',
        phase: 'decoding',
        current: imageIndex,
        total: undefined,
        imageName: value?.name,
        image: {
          hash: value?.hash,
          name: value?.name,
          mimeType: value?.mimeType,
          width: value?.width,
          height: value?.height,
          data: Buffer.from(value?.dataBase64 ?? '', 'base64'),
        },
      })
    }

    let entryIndex = 0
    for await (const value of streamTopLevelArrayObjects(filePath, 'entries')) {
      entryIndex += 1
      sendEvent({
        type: 'progress',
        phase: 'restoring',
        current: entryIndex,
        total: undefined,
        imageName: undefined,
      })
      sendEvent({
        type: 'entry',
        phase: 'restoring',
        current: entryIndex,
        total: undefined,
        entry: value,
      })
    }

    sendEvent({ type: 'complete' })
  } catch (error) {
    sendEvent({
      type: 'error',
      message: error instanceof Error ? error.message : 'Unable to import project file',
    })
  }
}

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

const resolveAppIconPath = () => {
  const candidates = [
    path.resolve(__dirname, '..', 'build', 'icon.png'),
    path.resolve(__dirname, '..', 'icon.png'),
    path.join(process.resourcesPath, 'app', 'build', 'icon.png'),
    path.join(process.resourcesPath, 'app', 'icon.png'),
    path.join(process.resourcesPath, 'app.asar', 'build', 'icon.png'),
    path.join(process.resourcesPath, 'app.asar', 'icon.png'),
  ]

  const iconPath = pickExistingPath(candidates)
  appendRuntimeLog('app.icon.resolve', { candidates, iconPath })
  return iconPath
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
  const appIconPath = resolveAppIconPath()
  const preloadPath = resolvePreloadPath()

  if (!preloadPath) {
    throw new Error('Missing preload script')
  }

  const window = new BrowserWindow({
    width: 1480,
    height: 960,
    minWidth: 1180,
    minHeight: 820,
    backgroundColor: '#f4efe7',
    title: 'PhotoPainter Converter',
    ...(appIconPath ? { icon: appIconPath } : {}),
    webPreferences: {
      preload: preloadPath,
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

ipcMain.handle('dialog:save-bmp-to-directory', async (_event, payload) => {
  const { folderPath, fileName, data } = payload
  const filePath = path.join(folderPath, fileName)

  try {
    await fs.writeFile(filePath, Buffer.from(data))
    return {
      canceled: false,
      filePath,
    }
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : 'Unknown write error',
    }
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

ipcMain.handle('dialog:begin-save-project-export', async (_event, payload) => {
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

  try {
    const exportedAt = typeof payload?.exportedAt === 'string' ? payload.exportedAt : new Date().toISOString()
    const entriesSerialized = JSON.stringify(Array.isArray(payload?.entries) ? payload.entries : [])
    const prefix = `{"app":"photopainter-converter","exportedAt":${JSON.stringify(exportedAt)},"images":[`
    await fs.writeFile(result.filePath, prefix, 'utf8')
    pendingProjectExports.set(result.filePath, { entriesSerialized })
    return { canceled: false, filePath: result.filePath }
  } catch (error) {
    return {
      canceled: false,
      error: error instanceof Error ? error.message : 'Unable to initialize project export',
    }
  }
})

ipcMain.handle('dialog:append-project-export-image', async (_event, payload) => {
  const filePath = typeof payload?.filePath === 'string' ? payload.filePath : ''
  const state = pendingProjectExports.get(filePath)
  if (!state) {
    return { error: 'Project export session was not initialized.' }
  }

  try {
    const image = payload?.image ?? {}
    const serialized = JSON.stringify({
      hash: image.hash,
      name: image.name,
      mimeType: image.mimeType,
      width: image.width,
      height: image.height,
      dataBase64: Buffer.from(image.data ?? []).toString('base64'),
    })
    await fs.appendFile(filePath, `${payload?.prependComma ? ',' : ''}${serialized}`, 'utf8')
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to append image to project export',
    }
  }
})

ipcMain.handle('dialog:finish-project-export', async (_event, payload) => {
  const filePath = typeof payload?.filePath === 'string' ? payload.filePath : ''
  const state = pendingProjectExports.get(filePath)
  if (!state) {
    return { error: 'Project export session was not initialized.' }
  }

  try {
    await fs.appendFile(filePath, `],"entries":${state.entriesSerialized}}`, 'utf8')
    pendingProjectExports.delete(filePath)
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to finalize project export',
    }
  }
})

ipcMain.handle('dialog:abort-project-export', async (_event, payload) => {
  const filePath = typeof payload?.filePath === 'string' ? payload.filePath : ''
  pendingProjectExports.delete(filePath)

  try {
    if (filePath) {
      await fs.rm(filePath, { force: true })
    }
    return {}
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : 'Unable to clean up failed project export',
    }
  }
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

ipcMain.handle('dialog:start-project-import', async (event) => {
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
  const jobId = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
  void streamProjectImport(event.sender, jobId, filePath)
  return { canceled: false, jobId, filePath }
})

app.whenReady().then(async () => {
  appendRuntimeLog('app.whenReady', {
    userDataPath: app.getPath('userData'),
    appPath: app.getAppPath(),
  })

  const appIconPath = resolveAppIconPath()

  if (process.platform === 'darwin' && appIconPath && app.dock?.setIcon) {
    app.dock.setIcon(appIconPath)
  }

  await createWindow()

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})