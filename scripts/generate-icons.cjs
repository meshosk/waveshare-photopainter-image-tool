const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const pngToIcoModule = require('png-to-ico')
const pngToIco = pngToIcoModule.default ?? pngToIcoModule

const rootDir = path.resolve(__dirname, '..')
const sourceIconPath = path.join(rootDir, 'icon.png')
const buildDir = path.join(rootDir, 'build')
const pngOutputPath = path.join(buildDir, 'icon.png')
const icoOutputPath = path.join(buildDir, 'icon.ico')
const icnsOutputPath = path.join(buildDir, 'icon.icns')

const iconsetEntries = [
  ['icon_16x16.png', 16],
  ['icon_16x16@2x.png', 32],
  ['icon_32x32.png', 32],
  ['icon_32x32@2x.png', 64],
  ['icon_128x128.png', 128],
  ['icon_128x128@2x.png', 256],
  ['icon_256x256.png', 256],
  ['icon_256x256@2x.png', 512],
  ['icon_512x512.png', 512],
  ['icon_512x512@2x.png', 1024],
]

const ensureSourceIcon = () => {
  if (!fs.existsSync(sourceIconPath)) {
    throw new Error(`Missing source icon: ${sourceIconPath}`)
  }
}

const ensureBuildDir = () => {
  fs.mkdirSync(buildDir, { recursive: true })
}

const run = (command, args) => {
  execFileSync(command, args, { stdio: 'inherit' })
}

const generatePngAsset = () => {
  fs.copyFileSync(sourceIconPath, pngOutputPath)
}

const generateWindowsIcon = async () => {
  const buffer = await pngToIco(sourceIconPath)
  fs.writeFileSync(icoOutputPath, buffer)
}

const generateMacIcon = () => {
  if (process.platform !== 'darwin') {
    return
  }

  const iconsetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'photopainter-iconset-'))

  try {
    for (const [fileName, size] of iconsetEntries) {
      run('sips', ['-z', String(size), String(size), sourceIconPath, '--out', path.join(iconsetDir, fileName)])
    }

    run('iconutil', ['-c', 'icns', iconsetDir, '-o', icnsOutputPath])
  } finally {
    fs.rmSync(iconsetDir, { recursive: true, force: true })
  }
}

module.exports = async () => {
  ensureSourceIcon()
  ensureBuildDir()
  generatePngAsset()
  await generateWindowsIcon()
  generateMacIcon()
}

if (require.main === module) {
  module.exports().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}