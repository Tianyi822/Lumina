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
      win.webContents.send('mcp:statusChange', { serverName, status })
    }
  })

  // 自动连接已启用的服务器
  autoConnectEnabledServers()

  logger.info('MCP 服务初始化完成')
}

// 自动连接所有已启用的 MCP 服务器
async function autoConnectEnabledServers(): Promise<void> {
  const enabledConfigs = mcpConfigManager.getEnabledConfigs()
  for (const config of enabledConfigs) {
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
    return mcpConfigManager.listConfigs()
  })

  // 获取单个 MCP 服务器配置
  ipcMain.handle('mcp:getConfig', (_event, name: string) => {
    return mcpConfigManager.getConfig(name)
  })

  // 保存 MCP 服务器配置
  ipcMain.handle('mcp:saveConfig', (_event, config: MCPServerConfig) => {
    return mcpConfigManager.saveConfig(config)
  })

  // 删除 MCP 服务器配置，先断开连接再删除配置
  ipcMain.handle('mcp:deleteConfig', async (_event, name: string) => {
    // 先断开连接
    await mcpService.disconnect(name)
    return mcpConfigManager.deleteConfig(name)
  })

  // 批量导入 MCP 配置，支持导入 JSON 格式的配置文件
  ipcMain.handle('mcp:importConfigs', (_event, jsonContent: string) => {
    return mcpConfigManager.importFromJson(jsonContent)
  })

  // 导出所有 MCP 配置到 JSON 格式
  ipcMain.handle('mcp:exportConfigs', () => {
    return mcpConfigManager.exportConfigs()
  })

  // 连接指定的 MCP 服务器
  ipcMain.handle('mcp:connect', async (_event, name: string) => {
    const config = mcpConfigManager.getConfig(name)
    if (!config) {
      return {
        success: false,
        serverName: name,
        error: '配置不存在'
      }
    }
    return mcpService.connect(config)
  })

  // 断开指定 MCP 服务器的连接
  ipcMain.handle('mcp:disconnect', async (_event, name: string) => {
    await mcpService.disconnect(name)
    return { success: true }
  })

  // 重连指定的 MCP 服务器
  ipcMain.handle('mcp:reconnect', async (_event, name: string) => {
    return mcpService.reconnect(name)
  })

  // 获取连接状态，可以获取单个服务器的状态或所有服务器的状态
  ipcMain.handle('mcp:getStatus', (_event, serverName?: string) => {
    return mcpService.getConnectionStatus(serverName)
  })

  // 获取工具列表，可以获取单个服务器的工具或所有服务器的工具
  ipcMain.handle('mcp:listTools', (_event, serverName?: string) => {
    if (serverName) {
      return mcpService.getTools(serverName)
    }
    return mcpService.getAllTools()
  })

  // 按服务器分组获取工具，返回按服务器名称分组的工具列表
  ipcMain.handle('mcp:listToolsByServer', () => {
    const toolsByServer = mcpService.getToolsByServer()
    // 将 Map 转换为普通对象以便 IPC 传输
    const result: Record<string, unknown[]> = {}
    for (const [serverName, tools] of toolsByServer.entries()) {
      result[serverName] = tools
    }
    return result
  })

  // 调用 MCP 工具，执行工具并返回结果
  ipcMain.handle('mcp:callTool', async (_event, params: MCPToolCallParams) => {
    return mcpService.callTool(params.serverName, params.toolName, params.args)
  })

  // 测试 MCP 连接，验证配置是否正确
  ipcMain.handle('mcp:testConnection', async (_event, config: MCPServerConfig) => {
    return mcpService.testConnection(config)
  })

  // 连接所有已启用的 MCP 服务器
  ipcMain.handle('mcp:connectAll', async () => {
    const enabledConfigs = mcpConfigManager.getEnabledConfigs()
    const results: Awaited<ReturnType<typeof mcpService.connect>>[] = []
    for (const config of enabledConfigs) {
      const result = await mcpService.connect(config)
      results.push(result)
    }
    return results
  })

  // 断开所有 MCP 服务器的连接
  ipcMain.handle('mcp:disconnectAll', async () => {
    await mcpService.disconnectAll()
    return { success: true }
  })

  // 获取已连接的服务器名称列表
  ipcMain.handle('mcp:getConnectedServers', () => {
    return mcpService.getConnectedServerNames()
  })

  logger.info('MCP IPC 处理程序注册完成')
}
