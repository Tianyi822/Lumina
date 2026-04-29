import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import type { LabResult, LabSelection } from '@shared/types/lab'
import { containerSelections, sessionContainers, getLabServices, normalizeLabError } from './shared'

/**
 * 注册会话关联处理器
 */
export function registerLabSessionHandlers(): void {
  const { dockerService } = getLabServices()

  ipcMain.handle(
    'lab:selectLab',
    async (_event, containerId: string, sessionId?: string): Promise<LabResult> => {
      try {
        const containers = await dockerService.listContainers()
        const container = containers.find((item) => item.id === containerId)

        if (!container) {
          return { success: false, error: '容器不存在' }
        }

        const selection: LabSelection = {
          containerId,
          containerName: container.names[0]?.replace(/^\//, '') || containerId.substring(0, 12),
          image: container.image,
          selectedAt: new Date().toISOString(),
          sessionId
        }

        containerSelections.set(containerId, selection)
        if (sessionId) {
          sessionContainers.set(sessionId, containerId)
        }

        logger.info('选择实验室成功', 'main', {
          containerId: containerId.substring(0, 12),
          sessionId
        })

        return { success: true }
      } catch (error) {
        const errorMessage = normalizeLabError(error, '选择实验室失败')
        logger.error('选择实验室失败', 'main', { error: errorMessage, containerId })
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle('lab:deselectLab', async (_event, containerId: string): Promise<LabResult> => {
    try {
      const selection = containerSelections.get(containerId)

      if (selection?.sessionId) {
        sessionContainers.delete(selection.sessionId)
      }

      containerSelections.delete(containerId)

      logger.info('取消选择实验室成功', 'main', {
        containerId: containerId.substring(0, 12)
      })

      return { success: true }
    } catch (error) {
      const errorMessage = normalizeLabError(error, '取消选择实验室失败')
      logger.error('取消选择实验室失败', 'main', { error: errorMessage, containerId })
      return { success: false, error: errorMessage }
    }
  })

  ipcMain.handle(
    'lab:getSessionLab',
    async (_event, sessionId: string): Promise<LabSelection | null> => {
      try {
        const containerId = sessionContainers.get(sessionId)
        if (!containerId) {
          return null
        }

        return containerSelections.get(containerId) || null
      } catch (error) {
        logger.error('获取会话实验室失败', 'main', {
          error: normalizeLabError(error, '获取会话实验室失败'),
          sessionId
        })
        return null
      }
    }
  )
}
