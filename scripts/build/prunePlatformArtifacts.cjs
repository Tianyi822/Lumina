/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/explicit-function-return-type */
const fs = require('fs/promises')
const path = require('path')
const { Arch } = require('builder-util')

const SCOPED_NATIVE_PACKAGES = {
  '@lancedb': {
    packagePattern: /^lancedb-/,
    keepByTarget: {
      'darwin-arm64': ['lancedb-darwin-arm64'],
      'darwin-x64': ['lancedb-darwin-x64'],
      'darwin-universal': ['lancedb-darwin-arm64', 'lancedb-darwin-x64'],
      'linux-arm64': ['lancedb-linux-arm64-gnu', 'lancedb-linux-arm64-musl'],
      'linux-x64': ['lancedb-linux-x64-gnu', 'lancedb-linux-x64-musl'],
      'win32-arm64': ['lancedb-win32-arm64-msvc'],
      'win32-x64': ['lancedb-win32-x64-msvc']
    }
  },
  '@napi-rs': {
    packagePattern: /^canvas-/,
    keepByTarget: {
      'darwin-arm64': ['canvas-darwin-arm64'],
      'darwin-x64': ['canvas-darwin-x64'],
      'darwin-universal': ['canvas-darwin-arm64', 'canvas-darwin-x64'],
      'linux-arm64': ['canvas-linux-arm64-gnu', 'canvas-linux-arm64-musl'],
      'linux-x64': ['canvas-linux-x64-gnu', 'canvas-linux-x64-musl'],
      'win32-arm64': ['canvas-win32-arm64-msvc'],
      'win32-x64': ['canvas-win32-x64-msvc']
    }
  }
}

function getArchName(arch) {
  return typeof arch === 'number' ? Arch[arch] : String(arch)
}

async function pathExists(targetPath) {
  try {
    await fs.access(targetPath)
    return true
  } catch {
    return false
  }
}

async function getResourcesDirs(context) {
  if (context.electronPlatformName !== 'darwin') {
    return [path.join(context.appOutDir, 'resources')]
  }

  const entries = await fs.readdir(context.appOutDir, { withFileTypes: true })
  return entries
    .filter((entry) => entry.isDirectory() && entry.name.endsWith('.app'))
    .map((entry) => path.join(context.appOutDir, entry.name, 'Contents', 'Resources'))
}

async function pruneScopedPackages(rootDir, scopeName, rule, targetKey) {
  const entries = await fs.readdir(rootDir, { withFileTypes: true })
  let removed = 0

  for (const entry of entries) {
    const entryPath = path.join(rootDir, entry.name)

    if (!entry.isDirectory()) {
      continue
    }

    if (entry.name === scopeName) {
      const keepPackages = new Set(rule.keepByTarget[targetKey] ?? [])
      const packageEntries = await fs.readdir(entryPath, { withFileTypes: true })

      for (const packageEntry of packageEntries) {
        if (!packageEntry.isDirectory() || !rule.packagePattern.test(packageEntry.name)) {
          continue
        }

        if (keepPackages.has(packageEntry.name)) {
          continue
        }

        await fs.rm(path.join(entryPath, packageEntry.name), { recursive: true, force: true })
        removed += 1
      }
    }

    removed += await pruneScopedPackages(entryPath, scopeName, rule, targetKey)
  }

  return removed
}

async function pruneNodeModules(nodeModulesDir, targetKey) {
  let removed = 0

  for (const [scopeName, rule] of Object.entries(SCOPED_NATIVE_PACKAGES)) {
    removed += await pruneScopedPackages(nodeModulesDir, scopeName, rule, targetKey)
  }

  return removed
}

exports.default = async function prunePlatformArtifacts(context) {
  const archName = getArchName(context.arch)
  const targetKey = `${context.electronPlatformName}-${archName}`
  const resourcesDirs = await getResourcesDirs(context)
  let removed = 0

  for (const resourcesDir of resourcesDirs) {
    const nodeModulesDir = path.join(resourcesDir, 'app.asar.unpacked', 'node_modules')

    if (!(await pathExists(nodeModulesDir))) {
      continue
    }

    removed += await pruneNodeModules(nodeModulesDir, targetKey)
  }

  if (removed > 0) {
    console.log(
      `[platform-prune] removed ${removed} unused native package directories for ${targetKey}`
    )
  }
}
