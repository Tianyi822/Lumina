import { ipcMain } from 'electron'
import { capabilityManager } from '@main/services/chat/tools/CapabilityManager'

/**
 * 注册能力系统相关的 IPC 处理程序
 * 处理 AI 能力的动态添加、状态查询和用户响应等操作
 */
export function registerCapabilityHandlers(): void {
  // 为会话添加指定的能力
  ipcMain.handle(
    'capability:add',
    async (_event, sessionId: string, capabilityId: string) => {
      const state = capabilityManager.addCapability(sessionId, capabilityId)
      if (!state) return { success: false, error: '会话不存在' }
      return { success: true, data: state }
    }
  )

  // 获取会话当前已激活的能力状态
  ipcMain.handle('capability:getState', async (_event, sessionId: string) => {
    const state = capabilityManager.getCapabilities(sessionId)
    return { success: true, data: state ?? null }
  })

  // 处理用户对能力建议的响应（接受或拒绝）
  ipcMain.handle(
    'capability:suggestResponse',
    async (_event, sessionId: string, capabilityId: string, accepted: boolean) => {
      if (accepted) {
        const state = capabilityManager.addCapability(sessionId, capabilityId)
        return { success: true, data: state }
      }
      return { success: true, data: null }
    }
  )
}
