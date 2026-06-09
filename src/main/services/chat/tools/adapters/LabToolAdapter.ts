import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import { labToolService } from '../../../lab'

/**
 * 实验室工具适配器
 * 将 LabToolService 适配为统一的 ToolAdapter 接口。
 * 提供命令执行、容器管理、SSH 连接等实验室工具的调用能力。
 */
export class LabToolAdapter implements ToolAdapter {
  /**
   * 获取实验室工具列表（从 LabToolService 获取）
   */
  async getTools(): Promise<MCPToolReference[]> {
    return labToolService.getTools().map((tool) => ({
      serverName: tool.serverName || 'lab',
      toolName: tool.name.startsWith('lab__') ? tool.name.slice('lab__'.length) : tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>
    }))
  }

  /**
   * 执行实验室工具调用
   * 支持进度回调（如命令执行过程中的实时输出）
   * @param onProgress 执行进度回调（可选）
   */
  async execute(
    toolName: string,
    args: Record<string, unknown>,
    onProgress?: (message: string) => void
  ): Promise<MCPToolCallResult> {
    const fullName = toolName.startsWith('lab__') ? toolName : `lab__${toolName}`
    return labToolService.callTool(fullName, args, onProgress)
  }
}
