import type { CapabilityUnit, ToolDescriptor } from './CapabilityUnit'
import type { ToolAdapter } from '../UnifiedToolRegistry'
import { PaperWebSearchToolAdapter } from '@main/services/paper-web-search/PaperWebSearchToolAdapter'
import { paperWebSearchService } from '@main/services/paper-web-search'

/** 论文联网搜索能力的上下文数据 */
interface PaperWebCapabilityContext {
  /** 当前论文 ID */
  paperId?: string
  /** 是否启用了论文联网搜索开关 */
  enablePaperWebSearch?: boolean
}

/**
 * 学术网页搜索能力
 * 提供互联网学术资料搜索工具，支持论文、方法、数据集、工具等类型
 */
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

  describeTools(): ToolDescriptor[] {
    return [
      {
        name: 'paper_web__search',
        description: '搜索互联网上的学术资料',
        tags: this.tags
      }
    ]
  }
}
