import { ipcMain, BrowserWindow } from 'electron'
import { getKnowledgeMCPServerService } from '@main/services/knowledge/KnowledgeMCPServerService'
import { logger } from '@main/services/logger'
import type { KnowledgeMCPConfig } from '@shared/types/knowledgeMCP'

/**
 * 初始化知识库 MCP 服务
 */
export function initializeKnowledgeMCP(config?: KnowledgeMCPConfig): void {
  const service = getKnowledgeMCPServerService()

  if (config) {
    service.updateConfig(config)
  }

  logger.info('知识库 MCP 服务初始化完成')
}

/**
 * 通知渲染进程状态变更
 */
function notifyStatusChange(): void {
  const service = getKnowledgeMCPServerService()
  const status = service.getStatus()
  const windows = BrowserWindow.getAllWindows()
  for (const win of windows) {
    if (!win.isDestroyed()) {
      win.webContents.send('knowledge-mcp:statusChange', status)
    }
  }
}

/**
 * 注册知识库 MCP 相关的 IPC 处理程序
 */
export function registerKnowledgeMCPHandlers(): void {
  const service = getKnowledgeMCPServerService()

  // 获取服务状态
  ipcMain.handle('knowledge-mcp:getStatus', () => {
    return service.getStatus()
  })

  // 启动服务
  ipcMain.handle('knowledge-mcp:start', async (_event, port?: number) => {
    if (port !== undefined) {
      service.updateConfig({ port })
    }
    const result = await service.start()
    notifyStatusChange()
    return result
  })

  // 停止服务
  ipcMain.handle('knowledge-mcp:stop', async () => {
    await service.stop()
    notifyStatusChange()
    return { success: true }
  })

  // 获取 MCP 配置 JSON
  ipcMain.handle('knowledge-mcp:getConfig', () => {
    return service.getMCPConfigJSON()
  })

  // 获取本机 IP
  ipcMain.handle('knowledge-mcp:getLocalIP', () => {
    return service.getLocalIP()
  })

  // 更新配置
  ipcMain.handle('knowledge-mcp:updateConfig', (_event, config: Partial<KnowledgeMCPConfig>) => {
    service.updateConfig(config)
    return { success: true }
  })

  // 获取当前配置
  ipcMain.handle('knowledge-mcp:getCurrentConfig', () => {
    return service.getConfig()
  })

  logger.info('知识库 MCP IPC 处理程序注册完成')
}
