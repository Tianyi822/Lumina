import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import { sandboxToolService } from '../../../sandbox'

/**
 * 沙箱工具适配器
 * 薄封装层，将 SandboxToolService 适配为统一的 ToolAdapter 接口
 */
export class SandboxToolAdapter implements ToolAdapter {
  getTools(): MCPToolReference[] {
    return sandboxToolService.getTools().map((tool) => ({
      serverName: tool.serverName || 'sandbox',
      toolName: tool.name.startsWith('sandbox__') ? tool.name.slice('sandbox__'.length) : tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>
    }))
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const fullName = toolName.startsWith('sandbox__') ? toolName : `sandbox__${toolName}`
    return sandboxToolService.callTool(fullName, args)
  }
}
