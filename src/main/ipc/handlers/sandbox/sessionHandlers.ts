import { ipcMain } from 'electron'
import { logger } from '@main/services/logger'
import type { SandboxResult, SandboxSelection } from '@shared/types/sandbox'
import {
  containerSelections,
  sessionContainers,
  getSandboxServices,
  normalizeSandboxError
} from './shared'

/**
 * 注册会话关联处理器
 */
export function registerSandboxSessionHandlers(): void {
  const { dockerService } = getSandboxServices()

  ipcMain.handle(
    'sandbox:selectSandbox',
    async (_event, containerId: string, sessionId?: string): Promise<SandboxResult> => {
      try {
        const containers = await dockerService.listContainers()
        const container = containers.find((item) => item.id === containerId)

        if (!container) {
          return { success: false, error: '容器不存在' }
        }

        const selection: SandboxSelection = {
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

        logger.info('选择沙箱成功', 'main', {
          containerId: containerId.substring(0, 12),
          sessionId
        })

        return { success: true }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '选择沙箱失败')
        logger.error('选择沙箱失败', 'main', { error: errorMessage, containerId })
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'sandbox:deselectSandbox',
    async (_event, containerId: string): Promise<SandboxResult> => {
      try {
        const selection = containerSelections.get(containerId)

        if (selection?.sessionId) {
          sessionContainers.delete(selection.sessionId)
        }

        containerSelections.delete(containerId)

        logger.info('取消选择沙箱成功', 'main', {
          containerId: containerId.substring(0, 12)
        })

        return { success: true }
      } catch (error) {
        const errorMessage = normalizeSandboxError(error, '取消选择沙箱失败')
        logger.error('取消选择沙箱失败', 'main', { error: errorMessage, containerId })
        return { success: false, error: errorMessage }
      }
    }
  )

  ipcMain.handle(
    'sandbox:getSessionSandbox',
    async (_event, sessionId: string): Promise<SandboxSelection | null> => {
      try {
        const containerId = sessionContainers.get(sessionId)
        if (!containerId) {
          return null
        }

        return containerSelections.get(containerId) || null
      } catch (error) {
        logger.error('获取会话沙箱失败', 'main', {
          error: normalizeSandboxError(error, '获取会话沙箱失败'),
          sessionId
        })
        return null
      }
    }
  )
}
