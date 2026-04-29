import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import { frontendLabService } from '@main/services/lab/frontend'
import type { FrontendLabInfo, LabData } from '@shared/types/lab'
import { normalizeLabError } from './shared'

/**
 * 注册前端实验室补偿处理器
 */
export function registerLabFrontendHandlers(): void {
  ipcMain.handle(
    'lab:frontend:loadResolved',
    async (_event, labId: string): Promise<LabData | null> => {
      try {
        return await frontendLabService.loadFrontendLabResolved(labId)
      } catch (error) {
        const errorMessage = normalizeLabError(error, '加载实验室详情失败')
        logger.error('加载前端实验室详情失败', 'main', { labId, error: errorMessage })
        throw new Error(errorMessage)
      }
    }
  )

  ipcMain.handle(
    'lab:frontend:retryInitialization',
    async (_event, labId: string): Promise<FrontendLabInfo> => {
      try {
        return await frontendLabService.retryFrontendInitialization(labId)
      } catch (error) {
        const errorMessage = normalizeLabError(error, '重试前端初始化失败')
        logger.error('重试前端初始化失败', 'main', { labId, error: errorMessage })
        throw new Error(errorMessage)
      }
    }
  )

  ipcMain.handle(
    'lab:frontend:rebuildRuntime',
    async (_event, labId: string): Promise<FrontendLabInfo> => {
      try {
        return await frontendLabService.rebuildFrontendRuntimeContainer(labId)
      } catch (error) {
        const errorMessage = normalizeLabError(error, '重建前端运行容器失败')
        logger.error('重建前端运行容器失败', 'main', { labId, error: errorMessage })
        throw new Error(errorMessage)
      }
    }
  )

  ipcMain.handle(
    'lab:frontend:validateBuild',
    async (_event, labId: string): Promise<FrontendLabInfo> => {
      try {
        return await frontendLabService.validateFrontendBuild(labId)
      } catch (error) {
        const errorMessage = normalizeLabError(error, '前端构建校验失败')
        logger.error('前端构建校验失败', 'main', { labId, error: errorMessage })
        throw new Error(errorMessage)
      }
    }
  )
}
