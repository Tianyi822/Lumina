import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import { labToolService } from '../../../lab'

/**
 * 实验室工具适配器
 * 薄封装层，将 LabToolService 适配为统一的 ToolAdapter 接口
 */
export class LabToolAdapter implements ToolAdapter {
  getTools(): MCPToolReference[] {
    return labToolService.getTools().map((tool) => ({
      serverName: tool.serverName || 'lab',
      toolName: tool.name.startsWith('lab__') ? tool.name.slice('lab__'.length) : tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>
    }))
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>,
    onProgress?: (message: string) => void
  ): Promise<MCPToolCallResult> {
    const fullName = toolName.startsWith('lab__') ? toolName : `lab__${toolName}`
    return labToolService.callTool(fullName, args, onProgress)
  }
}
