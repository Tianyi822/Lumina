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

  export const safeStorage = {
    isEncryptionAvailable() {
      return true
    },
    encryptString(value) {
      return Buffer.from(value, 'utf-8')
    },
    decryptString(buffer) {
      return buffer.toString('utf-8')
    }
  }

  export default {
    app,
    net,
    safeStorage
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

const ssh2StubModule = `
  import { EventEmitter } from 'node:events'
  import { Writable } from 'node:stream'

  class MockSsh2Client extends EventEmitter {
    connect(config) {
      if (this._mockConnectReady) {
        setImmediate(() => this.emit('ready'))
      } else if (this._mockConnectError) {
        setImmediate(() => this.emit('error', new Error(this._mockConnectError)))
      }
    }

    exec(command, callback) {
      this._lastExecCommand = command
      const stream = new EventEmitter()
      stream.stderr = new EventEmitter()

      if (this._mockExecError) {
        setImmediate(() => callback(new Error(this._mockExecError)))
        return
      }

      setImmediate(() => callback(null, stream))

      if (this._mockStdoutData) {
        setImmediate(() => stream.emit('data', Buffer.from(this._mockStdoutData)))
      } else if (this._mockStdoutData !== false) {
        setImmediate(() => stream.emit('data', Buffer.from('mock stdout output\\n')))
      }

      if (this._mockStderrData) {
        setImmediate(() => stream.stderr.emit('data', Buffer.from(this._mockStderrData)))
      }

      setImmediate(() => {
        stream.emit('close', this._mockExitCode ?? 0)
      })
    }

    sftp(callback) {
      if (this._mockSftpError) {
        setImmediate(() => callback(new Error(this._mockSftpError)))
        return
      }

      const self = this
      const sftp = {
        createWriteStream: (filePath, options) => {
          const ws = new Writable({
            write(chunk, enc, cb) { cb() }
          })
          if (self._mockWriteError) {
            setImmediate(() => ws.emit('error', new Error(self._mockWriteError)))
          } else {
            setImmediate(() => ws.emit('close'))
          }
          return ws
        },
        mkdir: (dirPath, options, cb) => {
          // ssh2 真实签名: mkdir(path, attributes?, callback)
          // 调用方可能传 2 个或 3 个参数，兼容处理
          const callbackFn = typeof options === 'function' ? options : cb
          if (self._mockMkdirError) {
            setImmediate(() => callbackFn({ code: self._mockMkdirError }))
          } else {
            setImmediate(() => callbackFn(null))
          }
        },
        end: () => {}
      }
      setImmediate(() => callback(null, sftp))
    }

    end() {}
  }

  export { MockSsh2Client as Client }
`

const ssh2StubUrl = `data:text/javascript,${encodeURIComponent(ssh2StubModule)}`

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

  if (specifier === 'ssh2') {
    return {
      shortCircuit: true,
      url: ssh2StubUrl
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
