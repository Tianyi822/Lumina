import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { WriterToolAdapter } from '../adapters/WriterToolAdapter'
import type { MCPToolCallResult } from '@shared/types/mcp'
import type { ToolResultMetadata } from '../PipelineTypes'
import type { WriterAiRequestContext } from '@shared/types/writer'
import { writerAiRequestContextSchema } from '@shared/schemas/writerSchema'

/** 写作能力的上下文数据 */
interface WriterCapabilityContext {
  writerContext?: WriterAiRequestContext
}

/**
 * 写作编辑能力
 * 仅提供结构化编辑建议工具，不直接修改文档
 */
export class WriterCapability implements CapabilityUnit {
  id = 'writer'
  displayName = '写作编辑'
  description = '对当前写作文档提出结构化编辑建议，不直接保存'
  tags = ['写作', '编辑建议', '文档']

  createAdapter(context: unknown): ToolAdapter | null {
    const ctx = context as WriterCapabilityContext
    if (!ctx.writerContext) return null
    const parsed = writerAiRequestContextSchema.safeParse(ctx.writerContext)
    if (!parsed.success) return null
    return new WriterToolAdapter(parsed.data)
  }

  describeTools(_context: unknown): ToolDescriptor[] {
    return [
      {
        name: 'writer__propose_edits',
        description: '对写作范围内正文提出结构化编辑建议（不保存、不改标题）',
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
      sourceType: 'writer',
      sourceName: 'writer',
      confidence: result.success ? 0.8 : 0
    }
  }
}
