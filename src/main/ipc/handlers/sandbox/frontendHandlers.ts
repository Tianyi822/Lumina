import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import { frontendSandboxService } from '@main/services/sandbox/frontend'
import type { FrontendSandboxInfo, SandboxData } from '@shared/types/sandbox'
import { normalizeSandboxError } from './shared'

/**
 * 注册前端沙箱补偿处理器
 */
export function registerSandboxFrontendHandlers(): void {
  ipcMain.handle(
    'sandbox:frontend:loadResolved',
    async (_event, sandboxId: string): Promise<SandboxData | null> => {
      try {
        return await frontendSandboxService.loadFrontendSandboxResolved(sandboxId)
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '加载沙箱详情失败')
        logger.error('加载前端沙箱详情失败', 'main', { sandboxId, error: errorMessage })
        throw new Error(errorMessage)
      }
    }
  )

  ipcMain.handle(
    'sandbox:frontend:retryInitialization',
    async (_event, sandboxId: string): Promise<FrontendSandboxInfo> => {
      try {
        return await frontendSandboxService.retryFrontendInitialization(sandboxId)
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '重试前端初始化失败')
        logger.error('重试前端初始化失败', 'main', { sandboxId, error: errorMessage })
        throw new Error(errorMessage)
      }
    }
  )

  ipcMain.handle(
    'sandbox:frontend:rebuildRuntime',
    async (_event, sandboxId: string): Promise<FrontendSandboxInfo> => {
      try {
        return await frontendSandboxService.rebuildFrontendRuntimeContainer(sandboxId)
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '重建前端运行容器失败')
        logger.error('重建前端运行容器失败', 'main', { sandboxId, error: errorMessage })
        throw new Error(errorMessage)
      }
    }
  )

  ipcMain.handle(
    'sandbox:frontend:validateBuild',
    async (_event, sandboxId: string): Promise<FrontendSandboxInfo> => {
      try {
        return await frontendSandboxService.validateFrontendBuild(sandboxId)
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '前端构建校验失败')
        logger.error('前端构建校验失败', 'main', { sandboxId, error: errorMessage })
        throw new Error(errorMessage)
      }
    }
  )
}
