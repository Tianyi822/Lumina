import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import { knowledgeToolService } from '../../../knowledge'

/**
 * 知识库工具适配器
 * 薄封装层，将 KnowledgeToolService 适配为统一的 ToolAdapter 接口
 */
export class KnowledgeToolAdapter implements ToolAdapter {
  private kbIds?: string[]

  constructor(kbIds?: string[]) {
    this.kbIds = kbIds
  }

  /** 更新知识库 ID 列表（切换会话时使用） */
  setKnowledgeBaseIds(kbIds: string[] | undefined): void {
    this.kbIds = kbIds
  }

  getTools(): MCPToolReference[] {
    return knowledgeToolService.getTools(this.kbIds).map((tool) => ({
      serverName: tool.serverName || 'knowledge',
      toolName: tool.name.startsWith('knowledge__')
        ? tool.name.slice('knowledge__'.length)
        : tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>
    }))
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const fullName = toolName.startsWith('knowledge__') ? toolName : `knowledge__${toolName}`
    return knowledgeToolService.callTool(fullName, args, this.kbIds)
  }
}
