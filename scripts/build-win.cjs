const fs = require('node:fs')
const path = require('node:path')
const { spawnSync } = require('node:child_process')

const projectRoot = path.resolve(__dirname, '..')
const releaseDir = path.join(projectRoot, 'release')

const safeRemove = (targetPath) => {
  fs.rmSync(targetPath, { recursive: true, force: true })
}

const ensureCleanReleaseDir = () => {
  fs.mkdirSync(releaseDir, { recursive: true })

  for (const name of fs.readdirSync(releaseDir)) {
    safeRemove(path.join(releaseDir, name))
  }
}

const runBuild = () => {
  const electronBuilderCli = path.join(projectRoot, 'node_modules', 'electron-builder', 'cli.js')
  const result = spawnSync(
    process.execPath,
    [electronBuilderCli, '--win', 'portable', '--x64', '--publish', 'never'],
    {
      cwd: projectRoot,
      stdio: 'inherit',
      env: {
        ...process.env,
        CSC_IDENTITY_AUTO_DISCOVERY: 'false',
      },
    },
  )

  if (result.error) {
    throw result.error
  }

  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

const keepOnlyExeArtifact = () => {
  const entries = fs.readdirSync(releaseDir, { withFileTypes: true })
  const exeFiles = entries.filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.exe'))

  if (exeFiles.length !== 1) {
    const found = exeFiles.map((entry) => entry.name).join(', ') || 'none'
    throw new Error(`Expected exactly one Windows .exe artifact in release/, found: ${found}`)
  }

  for (const entry of entries) {
    if (entry.name === exeFiles[0].name) {
      continue
    }

    safeRemove(path.join(releaseDir, entry.name))
  }
}

ensureCleanReleaseDir()
runBuild()
keepOnlyExeArtifact()