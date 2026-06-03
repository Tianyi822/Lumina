import { ipcMain } from 'electron'
import { capabilityManager } from '@main/services/chat/tools/CapabilityManager'

export function registerCapabilityHandlers(): void {
  ipcMain.handle(
    'capability:add',
    async (_event, sessionId: string, capabilityId: string) => {
      const state = capabilityManager.addCapability(sessionId, capabilityId)
      if (!state) return { success: false, error: '会话不存在' }
      return { success: true, data: state }
    }
  )

  ipcMain.handle('capability:getState', async (_event, sessionId: string) => {
    const state = capabilityManager.getCapabilities(sessionId)
    return { success: true, data: state ?? null }
  })

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
