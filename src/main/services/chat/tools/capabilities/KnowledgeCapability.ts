import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { KnowledgeToolAdapter } from '../adapters/KnowledgeToolAdapter'

interface KnowledgeCapabilityContext {
  selectedKnowledgeBases?: Array<{ id: string; name?: string; documentCount?: number }>
}

export class KnowledgeCapability implements CapabilityUnit {
  id = 'knowledge'
  displayName = '知识库搜索'
  description = '搜索知识库中的文档，支持语义检索'
  tags = ['知识库', '文档搜索']

  createAdapter(context: unknown): ToolAdapter | null {
    const ctx = context as KnowledgeCapabilityContext
    const hasKb = (ctx.selectedKnowledgeBases?.length ?? 0) > 0
    if (!hasKb) return null

    const kbIds = ctx.selectedKnowledgeBases?.map((kb) => kb.id)
    return new KnowledgeToolAdapter(kbIds)
  }

  describeTools(context: unknown): ToolDescriptor[] {
    const ctx = context as KnowledgeCapabilityContext
    const kbCount = ctx.selectedKnowledgeBases?.length ?? 0
    return [
      {
        name: 'knowledge__search',
        description: `搜索知识库${kbCount > 0 ? `（${kbCount} 个已选择）` : ''}`,
        tags: this.tags
      },
      {
        name: 'knowledge__list',
        description: '列出知识库中的文档',
        tags: this.tags
      },
      {
        name: 'knowledge__documents',
        description: '获取知识库文档详情',
        tags: this.tags
      }
    ]
  }
}
