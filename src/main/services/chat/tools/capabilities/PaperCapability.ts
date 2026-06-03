import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { PaperContextToolAdapter } from '../adapters/PaperContextToolAdapter'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolResultMetadata } from '../PipelineTypes'

interface PaperCapabilityContext {
  paperId?: string
}

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

  describeTools(_context: unknown): ToolDescriptor[] {
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
