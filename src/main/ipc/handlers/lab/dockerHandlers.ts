import { ipcMain, shell } from 'electron'
import { logger } from '@main/services/logger'
import type { DockerCheckResult, PlatformType, LabResult } from '@shared/types/lab'
import { execAsync, createErrorResult } from './shared'

function decodeCommandOutput(output: unknown): string {
  if (Buffer.isBuffer(output)) {
    const utf8 = output.toString('utf8')
    if (!utf8.includes('\uFFFD')) {
      return utf8
    }

    try {
      return new TextDecoder('gb18030').decode(output)
    } catch {
      return utf8
    }
  }

  return typeof output === 'string' ? output : ''
}

function getCommandErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error)
  }

  const commandError = error as {
    message?: unknown
    stderr?: unknown
    stdout?: unknown
  }
  const stderr = decodeCommandOutput(commandError.stderr).trim()
  const stdout = decodeCommandOutput(commandError.stdout).trim()
  const details = stderr || stdout
  const message = typeof commandError.message === 'string' ? commandError.message.trim() : ''

  return details || message || String(error)
}

function isUnreadableCommandOutput(message: string): boolean {
  return message.includes('\uFFFD') || message.includes('锟斤拷') || message.includes('���')
}

function isDockerCommandMissing(message: string): boolean {
  return (
    message.includes('command not found') ||
    message.includes('not recognized') ||
    message.includes('ENOENT') ||
    message.includes('不是内部或外部命令') ||
    (message.includes('docker') && isUnreadableCommandOutput(message))
  )
}

/**
 * 注册 Docker 基础处理器
 */
async function checkDockerViaSocket(): Promise<DockerCheckResult | null> {
  try {
    const { getDockerService } = await import('@main/services/lab')
    const svc = getDockerService()
    svc.initialize()
    const result = await svc.checkAvailable()
    if (result.available) {
      logger.info('Docker 检测成功（Socket 直连）', 'main', { version: result.version })
      return { installed: true, version: result.version }
    }
    logger.warn('Docker Socket 不可用，降级尝试 CLI 检测', 'main', { error: result.error })
    return null
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err)
    logger.warn('Docker Socket 检测异常，降级尝试 CLI 检测', 'main', { error: errorMessage })
    return null
  }
}

async function checkDockerViaCli(): Promise<DockerCheckResult> {
  try {
    const { stdout } = await execAsync('docker --version', { timeout: 5000, encoding: 'buffer' })
    const output = decodeCommandOutput(stdout)
    const versionMatch = output.match(/Docker version ([\d.]+)/)
    const version = versionMatch ? versionMatch[1] : output.trim()

    logger.info('Docker 检测成功（CLI）', 'main', { version })

    return {
      installed: true,
      version
    }
  } catch (error) {
    const errorMessage = getCommandErrorMessage(error)

    if (isDockerCommandMissing(errorMessage)) {
      logger.info('Docker 未安装', 'main')
      return {
        installed: false,
        error: 'Docker 未安装'
      }
    }

    logger.warn('Docker 检测失败', 'main', { error: errorMessage })
    return {
      installed: false,
      error: errorMessage
    }
  }
}

export function registerLabDockerHandlers(): void {
  ipcMain.handle('lab:checkDocker', async (): Promise<DockerCheckResult> => {
    // 策略1: dockerode socket 直连（不依赖 PATH，打包后也能工作）
    const socketResult = await checkDockerViaSocket()
    if (socketResult) {
      return socketResult
    }

    // 策略2: exec docker --version（依赖 PATH，作为降级方案）
    return checkDockerViaCli()
  })

  ipcMain.handle('lab:getPlatform', (): PlatformType => {
    return process.platform as PlatformType
  })

  ipcMain.handle('lab:openExternal', async (_event, url: string): Promise<LabResult> => {
    try {
      await shell.openExternal(url)
      logger.info('打开外部链接', 'main', { url })
      return { success: true }
    } catch (error) {
      const result = createErrorResult(error, '打开外部链接失败')
      logger.error('打开外部链接失败', 'main', { url, error: result.error })
      return result
    }
  })
}
