/* eslint-disable @typescript-eslint/explicit-function-return-type */
import { existsSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const loaderDir = path.dirname(fileURLToPath(import.meta.url))
const projectRoot = path.resolve(loaderDir, '..', '..')

const aliasRoots = {
  '@main/': path.join(projectRoot, 'src', 'main'),
  '@shared/': path.join(projectRoot, 'src', 'shared'),
  '@renderer/': path.join(projectRoot, 'src', 'renderer', 'src')
}

const electronStubModule = `
  import path from 'node:path'
  import { tmpdir } from 'node:os'

  const basePath = path.join(tmpdir(), 'lumina-test')

  export const app = {
    getPath(name) {
      if (name === 'home' || name === 'userData') {
        return basePath
      }
      return basePath
    }
  }

  export const net = {
    fetch(...args) {
      return globalThis.fetch(...args)
    }
  }

  export default {
    app,
    net
  }
`

const electronStubUrl = `data:text/javascript,${encodeURIComponent(electronStubModule)}`

const loggerStubModule = `
  const noop = () => {}
  const noopAsync = async () => ({ success: true })

  export const logger = {
    initialize: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    log: noopAsync,
    setMinLevel: noop,
    getConfig() {
      return {
        minLevel: 0,
        enableConsole: false,
        enableFile: false
      }
    }
  }

  export default {
    logger
  }
`

const loggerStubUrl = `data:text/javascript,${encodeURIComponent(loggerStubModule)}`

const configStubModule = `
  export const configManager = {
    getConfig() {
      return null
    }
  }

  export default {
    configManager
  }
`

const configStubUrl = `data:text/javascript,${encodeURIComponent(configStubModule)}`

function resolveExistingPath(candidateBase) {
  const candidates = [
    candidateBase,
    `${candidateBase}.ts`,
    `${candidateBase}.js`,
    path.join(candidateBase, 'index.ts'),
    path.join(candidateBase, 'index.js')
  ]

  return (
    candidates.find((candidate) => existsSync(candidate) && statSync(candidate).isFile()) || null
  )
}

function resolveAliasPath(baseDir, specifier) {
  const relativePath = specifier.replace(/^[^/]+\//, '')
  return resolveExistingPath(path.join(baseDir, relativePath))
}

function resolveRelativePath(specifier, parentURL) {
  if (!parentURL?.startsWith('file:')) {
    return null
  }

  const parentPath = fileURLToPath(parentURL)
  const parentDir = path.dirname(parentPath)
  return resolveExistingPath(path.resolve(parentDir, specifier))
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'electron') {
    return {
      shortCircuit: true,
      url: electronStubUrl
    }
  }

  if (specifier === '@main/services/logger') {
    return {
      shortCircuit: true,
      url: loggerStubUrl
    }
  }

  if (specifier === '@main/services/config') {
    return {
      shortCircuit: true,
      url: configStubUrl
    }
  }

  for (const [prefix, baseDir] of Object.entries(aliasRoots)) {
    if (!specifier.startsWith(prefix)) {
      continue
    }

    const resolvedPath = resolveAliasPath(baseDir, specifier)
    if (!resolvedPath) {
      break
    }

    return {
      shortCircuit: true,
      url: pathToFileURL(resolvedPath).href
    }
  }

  if (specifier.startsWith('./') || specifier.startsWith('../')) {
    const resolvedPath = resolveRelativePath(specifier, context.parentURL)
    if (resolvedPath) {
      return {
        shortCircuit: true,
        url: pathToFileURL(resolvedPath).href
      }
    }
  }

  return nextResolve(specifier, context)
}
