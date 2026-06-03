import type { ToolAdapter } from '../UnifiedToolRegistry'
import type { MCPToolReference } from '../../../../types/chat'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolResultMetadata } from '../PipelineTypes'
import {
  paperContextSearchToolService,
  type PaperContextSearchArgs
} from '../../../paper/PaperContextSearchToolService'

const PAPER_CONTEXT_SEARCH_TOOL: MCPToolReference = {
  serverName: 'paper',
  toolName: 'search_context',
  description:
    '按需检索当前论文的 OCR 原文和译文文本。必须用于论文内容问答、选中文本解释、无选区问题定位上下文；返回句子级相关上下文，不会读取整篇论文。',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: '用户问题或需要检索的关键词。没有选中文本时必须提供用户问题。'
      },
      selectedText: {
        type: 'string',
        description: '用户从原文或译文中选中的文本。若有选区，应原样传入。'
      },
      source: {
        type: 'string',
        enum: ['original', 'translation', 'both'],
        description: '检索来源：original 原文，translation 译文，both 同时检索。默认 both。'
      },
      maxIterations: {
        type: 'number',
        description: '关键词递归搜索最大轮数，默认 10，最大 10。'
      },
      limit: {
        type: 'number',
        description: '最多返回的相关句子数量，默认 12，最大 24。'
      }
    },
    required: ['query']
  }
}

export class PaperContextToolAdapter implements ToolAdapter {
  private paperId?: string

  setPaperId(paperId: string | undefined): void {
    this.paperId = paperId
  }

  async getTools(): Promise<MCPToolReference[]> {
    return [PAPER_CONTEXT_SEARCH_TOOL]
  }

  async execute(toolName: string, args: Record<string, unknown>): Promise<MCPToolCallResult> {
    const normalizedToolName = toolName.startsWith('paper__')
      ? toolName.slice('paper__'.length)
      : toolName

    if (normalizedToolName !== 'search_context') {
      return {
        success: false,
        error: `未知的论文工具: ${toolName}，当前仅支持 search_context`
      }
    }

    if (!this.paperId) {
      return {
        success: false,
        error: '论文 ID 未设置，无法检索论文上下文'
      }
    }

    return paperContextSearchToolService.search(this.paperId, args as PaperContextSearchArgs)
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

    const sectionCount = (content.match(/^##\s/gm) || []).length
    const contentLength = content.length

    let coverage: 'high' | 'medium' | 'low'
    if (!result.success) {
      coverage = 'low'
    } else if (sectionCount >= 3 && contentLength > 1000) {
      coverage = 'high'
    } else if (sectionCount >= 1 && contentLength > 300) {
      coverage = 'medium'
    } else {
      coverage = 'low'
    }

    const keyFindings = content
      .split('\n')
      .filter((line) => line.trim().startsWith('- ') || line.trim().startsWith('• '))
      .slice(0, 5)

    return {
      coverage,
      keyFindings,
      sourceType: 'paper',
      sourceName: this.paperId ?? 'unknown',
      confidence: result.success ? Math.min((sectionCount + 1) / 4, 1) : 0,
      suggestion:
        coverage === 'low' && result.success
          ? '论文中未找到相关内容，建议搜索知识库补充'
          : undefined
    }
  }
}
