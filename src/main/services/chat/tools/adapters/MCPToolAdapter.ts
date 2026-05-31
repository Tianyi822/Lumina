import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { MCPService } from '../../../mcp'

/**
 * MCP 工具适配器
 * 薄封装层，将 MCPService 适配为统一的 ToolAdapter 接口
 */
export class MCPToolAdapter implements ToolAdapter {
  private mcpService: MCPService

  constructor(mcpService: MCPService) {
    this.mcpService = mcpService
  }

  async getTools(): Promise<MCPToolReference[]> {
    return this.mcpService.getAllTools().map((tool) => ({
      serverName: tool.serverName,
      toolName: tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>
    }))
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    // toolName 为 function name 格式: "server__tool"，可能是原始名称或 OpenAI 安全名称
    const parts = toolName.split('__')
    const sanitizedServer = parts[0]
    const requestedToolName = parts.slice(1).join('__')

    const originalServer = this.findOriginalServerName(sanitizedServer)
    if (!originalServer) {
      return { success: false, error: `未找到 MCP 服务器: ${sanitizedServer}` }
    }

    const actualToolName = this.findOriginalToolName(originalServer, requestedToolName)
    return this.mcpService.callTool(originalServer, actualToolName, args)
  }

  /**
   * 从规范化后的名称查找原始服务器名称
   */
  private findOriginalServerName(sanitizedServerName: string): string | null {
    const connectedServers = this.mcpService.getConnectedServerNames()
    for (const serverName of connectedServers) {
      const sanitized = serverName.replace(/[^a-zA-Z0-9_-]/g, '-')
      if (serverName === sanitizedServerName || sanitized === sanitizedServerName) {
        return serverName
      }
    }
    return null
  }

  /**
   * 从规范化后的工具名称查找原始工具名称
   */
  private findOriginalToolName(serverName: string, requestedToolName: string): string {
    const tools = this.mcpService.getTools(serverName)
    const matchedTool = tools.find((tool) => {
      const sanitized = tool.name.replace(/[^a-zA-Z0-9_-]/g, '-')
      return tool.name === requestedToolName || sanitized === requestedToolName
    })

    return matchedTool?.name || requestedToolName
  }
}
