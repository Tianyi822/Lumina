import type { ToolAdapter } from '../chat/tools/UnifiedToolRegistry'
import type { MCPToolReference } from '@shared/types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type {
  PaperWebSearchContext,
  PaperWebSearchOutput,
  PaperWebSearchResultItem,
  PaperWebSearchToolInput
} from '@shared/types/paper-web-search'
import type { PaperWebSearchService } from './PaperWebSearchService'

/**
 * 论文网页搜索工具定义
 */
const PAPER_WEB_SEARCH_TOOL: MCPToolReference = {
  serverName: 'paper_web',
  toolName: 'search',
  description:
    '搜索互联网上的学术资料，包括论文、方法、数据集、工具、引用和最新进展。适用于需要获取学术领域最新信息或查找具体学术资源的场景。',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '搜索关键词，应包含论文标题、作者、关键词等具体信息'
      },
      reason: {
        type: 'string',
        description: '搜索此内容的原因或意图，帮助系统理解上下文'
      },
      target: {
        type: 'string',
        enum: ['paper', 'method', 'dataset', 'tool', 'citation', 'recent_progress'],
        description:
          '搜索目标类型：paper（论文）、method（方法）、dataset（数据集）、tool（工具）、citation（引用）、recent_progress（最新进展）'
      },
      recency: {
        type: 'string',
        enum: ['any', 'recent'],
        description: '时效性要求：any（不限）、recent（近期）'
      }
    },
    required: ['query', 'reason']
  }
}

/**
 * 论文网页搜索工具适配器
 * 将论文网页搜索服务包装为统一的 ToolAdapter 接口，供 ReAct 循环使用
 */
export class PaperWebSearchToolAdapter implements ToolAdapter {
  private paperContext: PaperWebSearchContext | null = null
  private readonly service: PaperWebSearchService

  constructor(service: PaperWebSearchService) {
    this.service = service
  }

  /**
   * 设置当前论文上下文
   */
  setPaperContext(context: PaperWebSearchContext | null): void {
    this.paperContext = context
  }

  /**
   * 获取该适配器提供的工具列表
   */
  getTools(): MCPToolReference[] {
    return [PAPER_WEB_SEARCH_TOOL]
  }

  /**
   * 执行论文网页搜索工具调用
   */
  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const normalizedToolName = toolName.startsWith('paper_web__')
      ? toolName.slice('paper_web__'.length)
      : toolName

    if (normalizedToolName !== 'search') {
      return {
        success: false,
        error: `未知的工具名称: ${toolName}，当前仅支持 search`
      }
    }

    // 验证必需参数
    const query = args.query
    const reason = args.reason
    if (typeof query !== 'string' || !query.trim()) {
      return {
        success: false,
        error: '缺少必需的参数: query（搜索关键词）'
      }
    }
    if (typeof reason !== 'string' || !reason.trim()) {
      return {
        success: false,
        error: '缺少必需的参数: reason（搜索原因）'
      }
    }

    // 检查论文上下文是否已设置
    if (!this.paperContext) {
      return {
        success: false,
        error: '论文上下文未设置，无法执行搜索。请先设置论文上下文后再调用。'
      }
    }

    // 调用搜索服务
    const input: PaperWebSearchToolInput = {
      query,
      reason,
      target: args.target as PaperWebSearchToolInput['target'],
      recency: args.recency as PaperWebSearchToolInput['recency'],
      paperContext: this.paperContext
    }
    const result = await this.service.search(input)

    // 将 PaperWebSearchOutput 转换为 MCPToolCallResult
    return this.transformResult(result)
  }

  /**
   * 将搜索输出结果转换为统一的工具调用结果格式
   */
  private transformResult(output: PaperWebSearchOutput): MCPToolCallResult {
    if (!output.success) {
      return {
        success: false,
        error: output.error || '搜索执行失败'
      }
    }

    const results = output.results.map((item: PaperWebSearchResultItem) => ({
      title: item.title,
      url: item.url,
      source: item.source,
      publishedDate: item.publishedDate,
      summary: item.summary,
      snippet: item.snippet,
      relevanceScore: item.relevanceScore
    }))

    return {
      success: true,
      content: {
        query: output.query,
        quality: output.quality,
        resultCount: output.results.length,
        elapsedMs: output.elapsedMs,
        results,
        warnings: output.warnings
      }
    }
  }
}
