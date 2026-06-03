import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolResultMetadata, PaperSemanticContext } from '../PipelineTypes'
import { knowledgeToolService } from '../../../knowledge'

/**
 * 知识库工具适配器
 * 薄封装层，将 KnowledgeToolService 适配为统一的 ToolAdapter 接口
 */
export class KnowledgeToolAdapter implements ToolAdapter {
  private kbIds?: string[]
  private semanticContext?: PaperSemanticContext

  constructor(kbIds?: string[]) {
    this.kbIds = kbIds
  }

  /** 更新知识库 ID 列表（切换会话时使用） */
  setKnowledgeBaseIds(kbIds: string[] | undefined): void {
    this.kbIds = kbIds
  }

  /** 设置论文语义上下文，用于增强搜索相关性 */
  setSemanticContext(ctx: PaperSemanticContext | undefined): void {
    this.semanticContext = ctx
  }

  async getTools(): Promise<MCPToolReference[]> {
    return (await knowledgeToolService.getTools(this.kbIds)).map((tool) => ({
      serverName: tool.serverName || 'knowledge',
      toolName: tool.name.startsWith('knowledge__')
        ? tool.name.slice('knowledge__'.length)
        : tool.name,
      description: tool.description,
      inputSchema: tool.inputSchema as Record<string, unknown>
    }))
  }

  async execute(
    toolName: string,
    args: Record<string, unknown>
  ): Promise<MCPToolCallResult> {
    const fullName = toolName.startsWith('knowledge__') ? toolName : `knowledge__${toolName}`

    // 搜索时注入论文语义上下文
    const searchArgs = { ...args }
    if (
      this.semanticContext &&
      (toolName === 'search' || toolName === 'knowledge__search')
    ) {
      searchArgs.paperContext = {
        keywords: this.semanticContext.keywords
      }
    }

    return knowledgeToolService.callTool(fullName, searchArgs, this.kbIds)
  }

  enrichResult(
    _toolName: string,
    _args: Record<string, unknown>,
    result: MCPToolCallResult
  ): ToolResultMetadata {
    const content =
      typeof result.content === 'string'
        ? result.content
        : JSON.stringify(result.content ?? '')

    const hitCount = (content.match(/\[来源[：:]/g) || []).length
    const contentLength = content.length

    let coverage: 'high' | 'medium' | 'low'
    if (!result.success) {
      coverage = 'low'
    } else if (hitCount >= 3 && contentLength > 800) {
      coverage = 'high'
    } else if (hitCount >= 1 && contentLength > 200) {
      coverage = 'medium'
    } else {
      coverage = 'low'
    }

    return {
      coverage,
      keyFindings: [],
      sourceType: 'knowledge',
      sourceName: this.kbIds?.join(', ') ?? 'unknown',
      confidence: result.success ? Math.min((hitCount + 1) / 4, 1) : 0
    }
  }
}
