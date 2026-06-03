import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { PaperWebSearchToolAdapter } from '@main/services/paper-web-search/PaperWebSearchToolAdapter'
import { paperWebSearchService } from '@main/services/paper-web-search'

interface PaperWebCapabilityContext {
  paperId?: string
  enablePaperWebSearch?: boolean
}

export class PaperWebCapability implements CapabilityUnit {
  id = 'paper_web'
  displayName = '学术网页搜索'
  description = '搜索互联网上的学术资料'
  tags = ['联网搜索', '学术搜索']

  createAdapter(context: unknown): ToolAdapter | null {
    const ctx = context as PaperWebCapabilityContext
    if (!ctx.paperId || !ctx.enablePaperWebSearch) return null
    const adapter = new PaperWebSearchToolAdapter(paperWebSearchService)
    adapter.setPaperContext({ paperId: ctx.paperId, fileName: '', userQuestion: '' })
    return adapter
  }

  describeTools(_context: unknown): ToolDescriptor[] {
    return [
      {
        name: 'paper_web__search',
        description: '搜索互联网上的学术资料',
        tags: this.tags
      }
    ]
  }
}
