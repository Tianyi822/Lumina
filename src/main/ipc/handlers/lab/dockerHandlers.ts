import { ipcMain, shell } from 'electron'
import { logger } from '@main/services/logger'
import type { DockerStatus, PlatformType, LabResult } from '@shared/types/lab'
import { DOCKER_VERSION_TIMEOUT } from '@main/constants/timeouts'
import { execAsync, createErrorResult, getLabServices } from './shared'

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

/**
 * 注册 Docker 基础处理器
 */
export function registerLabDockerHandlers(): void {
  ipcMain.handle('lab:checkDocker', async (): Promise<DockerStatus> => {
    const { dockerService } = getLabServices()

    // 1. 优先通过 dockerode 检测 daemon 是否可用
    const daemonResult = await dockerService.checkAvailable()
    if (daemonResult.available) {
      logger.info('Docker daemon 可用', 'main', { version: daemonResult.version })
      return {
        available: true,
        installed: true,
        version: daemonResult.version
      }
    }

    // 2. daemon 不可用，回退 CLI 检测判断是否已安装
    logger.info('Docker daemon 不可用，回退 CLI 检测', 'main', {
      daemonError: daemonResult.error
    })

    try {
      const { stdout } = await execAsync('docker --version', {
        timeout: DOCKER_VERSION_TIMEOUT,
        encoding: 'buffer'
      })
      const output = decodeCommandOutput(stdout)
      const versionMatch = output.match(/Docker version ([\d.]+)/)
      const version = versionMatch ? versionMatch[1] : output.trim()

      logger.info('Docker CLI 已安装但 daemon 未启动', 'main', { version })
      return {
        available: false,
        installed: true,
        version,
        error: 'Docker 未启动'
      }
    } catch (error) {
      const errorMessage = getCommandErrorMessage(error)

      logger.info('Docker 未安装', 'main', { error: errorMessage })
      return {
        available: false,
        installed: false,
        error: 'Docker 未安装'
      }
    }
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
