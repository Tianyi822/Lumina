import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { PaperContextToolAdapter } from '../adapters/PaperContextToolAdapter'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolResultMetadata } from '../PipelineTypes'

/** 论文能力的上下文数据 */
interface PaperCapabilityContext {
  /** 当前论文 ID */
  paperId?: string
}

/**
 * 论文检索能力
 * 提供论文 OCR 原文和译文的句子级上下文检索工具
 */
export class PaperCapability implements CapabilityUnit {
  id = 'paper'
  displayName = '论文检索'
  description = '检索当前论文的 OCR 原文和译文，提供句子级上下文'
  tags = ['论文', 'OCR', '上下文检索']

  createAdapter(context: unknown): ToolAdapter | null {
    const ctx = context as PaperCapabilityContext
    if (!ctx.paperId) return null
    const adapter = new PaperContextToolAdapter()
    adapter.setPaperId(ctx.paperId)
    return adapter
  }

  describeTools(): ToolDescriptor[] {
    return [
      {
        name: 'paper__search_context',
        description: '按需检索当前论文的 OCR 原文和译文文本',
        tags: this.tags
      }
    ]
  }

  enrichResult(
    _toolName: string,
    _args: Record<string, unknown>,
    result: MCPToolCallResult
  ): ToolResultMetadata {
    return {
      coverage: result.success ? 'medium' : 'low',
      keyFindings: [],
      sourceType: 'paper',
      sourceName: 'paper',
      confidence: result.success ? 0.5 : 0
    }
  }
}
