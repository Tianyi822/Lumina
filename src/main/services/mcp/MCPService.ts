import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { SSEClientTransport } from '@modelcontextprotocol/sdk/client/sse.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'
import { logger } from '@main/services/logger'
import {
  MCPServerConfig,
  MCPTool,
  MCPConnectionStatus,
  MCPConnectResult,
  MCPToolCallResult
} from '@main/types/mcp'

/**
 * MCP 客户端连接信息
 */
interface MCPClientConnection {
  client: Client
  config: MCPServerConfig
  tools: MCPTool[]
  connected: boolean
  error?: string
}

/**
 * MCP 服务管理器
 * 负责 MCP 服务器的连接、断开、工具管理等
 */
export class MCPService {
  private connections: Map<string, MCPClientConnection> = new Map()
  private onStatusChangeCallback:
    | ((serverName: string, status: MCPConnectionStatus) => void)
    | null = null

  /**
   * 设置状态变更回调
   */
  setOnStatusChange(callback: (serverName: string, status: MCPConnectionStatus) => void): void {
    this.onStatusChangeCallback = callback
  }

  /**
   * 创建传输层
   */
  private createTransport(
    config: MCPServerConfig
  ): StdioClientTransport | SSEClientTransport | StreamableHTTPClientTransport {
    switch (config.transport) {
      case 'stdio':
        if (!config.command) {
          throw new Error('stdio 传输类型需要指定 command')
        }
        return new StdioClientTransport({
          command: config.command,
          args: config.args,
          env: config.env
        })

      case 'sse':
        if (!config.url) {
          throw new Error('SSE 传输类型需要指定 url')
        }
        return new SSEClientTransport(new URL(config.url), {
          requestInit: config.headers ? { headers: config.headers } : undefined
        })

      case 'streamableHttp':
        if (!config.url) {
          throw new Error('streamableHttp 传输类型需要指定 url')
        }
        return new StreamableHTTPClientTransport(new URL(config.url), {
          requestInit: config.headers ? { headers: config.headers } : undefined
        })

      default:
        throw new Error(`不支持的传输类型: ${config.transport}`)
    }
  }

  /**
   * 连接到 MCP 服务器
   */
  async connect(config: MCPServerConfig): Promise<MCPConnectResult> {
    const serverName = config.name

    // 如果已连接，先断开
    if (this.connections.has(serverName)) {
      await this.disconnect(serverName)
    }

    try {
      logger.info(`正在连接 MCP 服务器: ${serverName}`)

      const client = new Client({
        name: 'sparrow-manus',
        version: '1.0.0'
      })

      const transport = this.createTransport(config)
      await client.connect(transport)

      // 获取工具列表
      const toolsResult = await client.listTools()
      const tools: MCPTool[] = (toolsResult.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as MCPTool['inputSchema'],
        serverName
      }))

      const connection: MCPClientConnection = {
        client,
        config,
        tools,
        connected: true
      }

      this.connections.set(serverName, connection)

      logger.info(`MCP 服务器连接成功: ${serverName}, 工具数量: ${tools.length}`)

      // 触发状态变更
      this.notifyStatusChange(serverName)

      return {
        success: true,
        serverName,
        tools
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`MCP 服务器连接失败: ${serverName} - ${errorMessage}`, 'main')

      // 记录失败状态
      this.connections.set(serverName, {
        client: new Client({ name: 'sparrow-manus', version: '1.0.0' }),
        config,
        tools: [],
        connected: false,
        error: errorMessage
      })

      this.notifyStatusChange(serverName)

      return {
        success: false,
        serverName,
        error: errorMessage
      }
    }
  }

  /**
   * 断开 MCP 服务器连接
   */
  async disconnect(serverName: string): Promise<void> {
    const connection = this.connections.get(serverName)
    if (connection) {
      try {
        if (connection.connected) {
          await connection.client.close()
        }
        logger.info(`MCP 服务器已断开: ${serverName}`)
      } catch (error) {
        logger.error(
          `断开 MCP 服务器失败: ${serverName} - ${error instanceof Error ? error.message : String(error)}`,
          'main'
        )
      } finally {
        this.connections.delete(serverName)
        this.notifyStatusChange(serverName)
      }
    }
  }

  /**
   * 重新连接服务器
   */
  async reconnect(serverName: string): Promise<MCPConnectResult> {
    const connection = this.connections.get(serverName)
    if (!connection) {
      return {
        success: false,
        serverName,
        error: '服务器未找到'
      }
    }

    return this.connect(connection.config)
  }

  /**
   * 获取指定服务器的工具列表
   */
  getTools(serverName: string): MCPTool[] {
    const connection = this.connections.get(serverName)
    if (connection && connection.connected) {
      return connection.tools
    }
    return []
  }

  /**
   * 获取所有已连接服务器的工具列表
   */
  getAllTools(): MCPTool[] {
    const allTools: MCPTool[] = []
    for (const connection of this.connections.values()) {
      if (connection.connected) {
        allTools.push(...connection.tools)
      }
    }
    return allTools
  }

  /**
   * 按服务器分组获取工具
   */
  getToolsByServer(): Map<string, MCPTool[]> {
    const toolsByServer = new Map<string, MCPTool[]>()
    for (const [serverName, connection] of this.connections.entries()) {
      if (connection.connected) {
        toolsByServer.set(serverName, connection.tools)
      }
    }
    return toolsByServer
  }

  /**
   * 调用工具
   */
  async callTool(
    serverName: string,
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    const connection = this.connections.get(serverName)
    if (!connection) {
      return {
        success: false,
        error: `服务器未连接: ${serverName}`
      }
    }

    if (!connection.connected) {
      return {
        success: false,
        error: `服务器连接已断开: ${serverName}`
      }
    }

    try {
      logger.info(`调用 MCP 工具: ${serverName}/${toolName}`)
      const result = await connection.client.callTool({
        name: toolName,
        arguments: args
      })

      return {
        success: true,
        content: result.content
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`MCP 工具调用失败: ${serverName}/${toolName} - ${errorMessage}`, 'main')
      return {
        success: false,
        error: errorMessage
      }
    }
  }

  /**
   * 获取连接状态
   */
  getConnectionStatus(serverName?: string): MCPConnectionStatus[] {
    if (serverName) {
      const connection = this.connections.get(serverName)
      if (connection) {
        return [
          {
            serverName,
            connected: connection.connected,
            error: connection.error,
            tools: connection.tools
          }
        ]
      }
      return []
    }

    const statuses: MCPConnectionStatus[] = []
    for (const [name, connection] of this.connections.entries()) {
      statuses.push({
        serverName: name,
        connected: connection.connected,
        error: connection.error,
        tools: connection.tools
      })
    }
    return statuses
  }

  /**
   * 测试连接（不保持连接）
   */
  async testConnection(config: MCPServerConfig): Promise<MCPConnectResult> {
    try {
      logger.info(`测试 MCP 服务器连接: ${config.name}`)

      const client = new Client({
        name: 'sparrow-manus-test',
        version: '1.0.0'
      })

      const transport = this.createTransport(config)
      await client.connect(transport)

      // 获取工具列表验证连接
      const toolsResult = await client.listTools()
      const tools: MCPTool[] = (toolsResult.tools || []).map((tool) => ({
        name: tool.name,
        description: tool.description || '',
        inputSchema: tool.inputSchema as MCPTool['inputSchema'],
        serverName: config.name
      }))

      // 关闭测试连接
      await client.close()

      logger.info(`MCP 服务器连接测试成功: ${config.name}`)

      return {
        success: true,
        serverName: config.name,
        tools
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error(`MCP 服务器连接测试失败: ${config.name} - ${errorMessage}`, 'main')
      return {
        success: false,
        serverName: config.name,
        error: errorMessage
      }
    }
  }

  /**
   * 断开所有连接
   */
  async disconnectAll(): Promise<void> {
    const serverNames = Array.from(this.connections.keys())
    for (const serverName of serverNames) {
      await this.disconnect(serverName)
    }
  }

  /**
   * 获取已连接的服务器名称列表
   */
  getConnectedServerNames(): string[] {
    const connected: string[] = []
    for (const [name, connection] of this.connections.entries()) {
      if (connection.connected) {
        connected.push(name)
      }
    }
    return connected
  }

  /**
   * 检查服务器是否已连接
   */
  isConnected(serverName: string): boolean {
    const connection = this.connections.get(serverName)
    return connection?.connected ?? false
  }

  /**
   * 通知状态变更
   */
  private notifyStatusChange(serverName: string): void {
    if (this.onStatusChangeCallback) {
      const status = this.getConnectionStatus(serverName)[0]
      if (status) {
        this.onStatusChangeCallback(serverName, status)
      }
    }
  }
}
