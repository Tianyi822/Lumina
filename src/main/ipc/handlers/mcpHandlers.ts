import { ipcMain, BrowserWindow } from 'electron'
import { mcpConfigManager, mcpService } from '@main/services/mcp'
import { logger } from '@main/services/logger'
import { MCPServerConfig, MCPToolCallParams } from '@main/types/mcp'

// 初始化 MCP 服务，包括配置管理、状态变更回调和自动连接已启用的服务器
export function initializeMCP(): void {
  // 初始化配置管理器
  mcpConfigManager.initialize()

  // 设置状态变更回调，通知渲染进程
  mcpService.setOnStatusChange((serverName, status) => {
    const windows = BrowserWindow.getAllWindows()
    for (const win of windows) {
      if (!win.isDestroyed()) {
        win.webContents.send('mcp:statusChange', { serverName, status })
      }
    }
  })

  // 自动连接已启用的服务器
  autoConnectEnabledServers()

  logger.info('MCP 服务初始化完成')
}

// 自动连接所有已配置的 MCP 服务器
async function autoConnectEnabledServers(): Promise<void> {
  const allConfigs = mcpConfigManager.listConfigs()
  for (const config of allConfigs) {
    try {
      await mcpService.connect(config)
    } catch (error) {
      logger.error(
        `自动连接 MCP 服务器失败: ${config.name} - ${error instanceof Error ? error.message : String(error)}`,
        'main'
      )
    }
  }
}

// 注册 MCP 相关的 IPC 处理程序，处理服务器配置、连接、工具调用等操作
export function registerMCPHandlers(): void {
  // 获取所有 MCP 服务器配置
  ipcMain.handle('mcp:listConfigs', () => {
    try {
      const data = mcpConfigManager.listConfigs()
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 MCP 配置列表失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 获取单个 MCP 服务器配置
  ipcMain.handle('mcp:getConfig', (_event, name: string) => {
    try {
      const data = mcpConfigManager.getConfig(name)
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 MCP 配置失败', 'main', { serverName: name, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 保存 MCP 服务器配置
  ipcMain.handle('mcp:saveConfig', (_event, config: MCPServerConfig) => {
    try {
      if (!config || typeof config !== 'object') {
        return { success: false, error: '配置参数无效' }
      }
      if (!config.name || typeof config.name !== 'string') {
        return { success: false, error: '配置名称不能为空' }
      }
      return mcpConfigManager.saveConfig(config)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('保存 MCP 配置失败', 'main', { serverName: config.name, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 删除 MCP 服务器配置，先断开连接再删除配置
  ipcMain.handle('mcp:deleteConfig', async (_event, name: string) => {
    try {
      // 先断开连接
      await mcpService.disconnect(name)
      return mcpConfigManager.deleteConfig(name)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除 MCP 配置失败', 'main', { serverName: name, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 批量导入 MCP 配置，支持导入 JSON 格式的配置文件
  ipcMain.handle('mcp:importConfigs', (_event, jsonContent: string) => {
    try {
      if (typeof jsonContent !== 'string' || !jsonContent.trim()) {
        return { success: false, error: '导入内容不能为空' }
      }
      return mcpConfigManager.importFromJson(jsonContent)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('导入 MCP 配置失败', 'main', { error: errorMessage })
      return { success: false, imported: 0, errors: [errorMessage] }
    }
  })

  // 导出所有 MCP 配置到 JSON 格式
  ipcMain.handle('mcp:exportConfigs', () => {
    try {
      const data = mcpConfigManager.exportConfigs()
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('导出 MCP 配置失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 连接指定的 MCP 服务器
  ipcMain.handle('mcp:connect', async (_event, name: string) => {
    try {
      const config = mcpConfigManager.getConfig(name)
      if (!config) {
        return {
          success: false,
          serverName: name,
          error: '配置不存在'
        }
      }
      return mcpService.connect(config)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('连接 MCP 服务器失败', 'main', { serverName: name, error: errorMessage })
      return { success: false, serverName: name, error: errorMessage }
    }
  })

  // 断开指定 MCP 服务器的连接
  ipcMain.handle('mcp:disconnect', async (_event, name: string) => {
    try {
      await mcpService.disconnect(name)
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('断开 MCP 服务器连接失败', 'main', { serverName: name, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 重连指定的 MCP 服务器
  ipcMain.handle('mcp:reconnect', async (_event, name: string) => {
    try {
      return mcpService.reconnect(name)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('重连 MCP 服务器失败', 'main', { serverName: name, error: errorMessage })
      return { success: false, serverName: name, error: errorMessage }
    }
  })

  // 获取连接状态，可以获取单个服务器的状态或所有服务器的状态
  ipcMain.handle('mcp:getStatus', (_event, serverName?: string) => {
    try {
      const data = mcpService.getConnectionStatus(serverName)
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 MCP 连接状态失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 获取工具列表，可以获取单个服务器的工具或所有服务器的工具
  ipcMain.handle('mcp:listTools', (_event, serverName?: string) => {
    try {
      if (serverName) {
        const data = mcpService.getTools(serverName)
        return { success: true, data }
      }
      const data = mcpService.getAllTools()
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取 MCP 工具列表失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 按服务器分组获取工具，返回按服务器名称分组的工具列表
  ipcMain.handle('mcp:listToolsByServer', () => {
    try {
      const toolsByServer = mcpService.getToolsByServer()
      // 将 Map 转换为普通对象以便 IPC 传输
      const data: Record<string, unknown[]> = {}
      for (const [serverName, tools] of toolsByServer.entries()) {
        data[serverName] = tools
      }
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('按服务器分组获取 MCP 工具失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 调用 MCP 工具，执行工具并返回结果
  ipcMain.handle('mcp:callTool', async (_event, params: MCPToolCallParams) => {
    try {
      return mcpService.callTool(params.serverName, params.toolName, params.args)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('调用 MCP 工具失败', 'main', {
        serverName: params.serverName,
        toolName: params.toolName,
        error: errorMessage
      })
      return { success: false, error: errorMessage }
    }
  })

  // 测试 MCP 连接，验证配置是否正确
  ipcMain.handle('mcp:testConnection', async (_event, config: MCPServerConfig) => {
    try {
      return mcpService.testConnection(config)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('测试 MCP 连接失败', 'main', { serverName: config.name, error: errorMessage })
      return { success: false, serverName: config.name, error: errorMessage }
    }
  })

  // 连接所有已配置的 MCP 服务器
  ipcMain.handle('mcp:connectAll', async () => {
    try {
      const allConfigs = mcpConfigManager.listConfigs()
      const results: Awaited<ReturnType<typeof mcpService.connect>>[] = []
      for (const config of allConfigs) {
        try {
          const result = await mcpService.connect(config)
          results.push(result)
        } catch (error) {
          results.push({
            success: false,
            serverName: config.name,
            error: error instanceof Error ? error.message : String(error)
          })
        }
      }
      return { success: true, data: results }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('连接所有 MCP 服务器失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 断开所有 MCP 服务器的连接
  ipcMain.handle('mcp:disconnectAll', async () => {
    try {
      await mcpService.disconnectAll()
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('断开所有 MCP 服务器连接失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  // 获取已连接的服务器名称列表
  ipcMain.handle('mcp:getConnectedServers', () => {
    try {
      const data = mcpService.getConnectedServerNames()
      return { success: true, data }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('获取已连接的 MCP 服务器列表失败', 'main', { error: errorMessage })
      return { success: false, error: errorMessage }
    }
  })

  logger.info('MCP IPC 处理程序注册完成')
}
