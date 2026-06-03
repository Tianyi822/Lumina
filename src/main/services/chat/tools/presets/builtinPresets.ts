import type { ConsumerPreset } from './ConsumerPreset'
import type { PipelineContext } from '../PipelineTypes'
import type { ToolCategory } from '../UnifiedToolRegistry'

function paperKnowledgeCondition(ctx: PipelineContext): boolean {
  const paperResults = ctx.stageResults.get('paper' as ToolCategory)
  return (
    !paperResults ||
    paperResults.length === 0 ||
    paperResults.some((r) => r.metadata.coverage === 'low')
  )
}

export const CHAT_PAPER_PRESET: ConsumerPreset = {
  id: 'chat.paper',
  defaultCapabilities: ['paper', 'knowledge'],
  defaultComposition: {
    stages: [
      { capabilityId: 'paper', mode: 'required' },
      {
        capabilityId: 'knowledge',
        mode: 'conditional',
        condition: paperKnowledgeCondition,
        autoTrigger: {
          toolName: 'search',
          queryTransform: (query: string) => ({ query })
        }
      }
    ],
    mergeStrategy: 'smart_merge'
  }
}

export const CHAT_DEFAULT_PRESET: ConsumerPreset = {
  id: 'chat.default',
  defaultCapabilities: [],
  defaultComposition: { stages: [], mergeStrategy: 'none' }
}

export const SESSION_TYPE_TO_PRESET: Record<string, string> = {
  paper: 'chat.paper',
  default: 'chat.default',
  knowledge: 'chat.default',
  tool: 'chat.default'
}
