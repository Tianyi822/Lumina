import type {
  SessionToolConfig,
  ToolRegistrationRule,
  RegistrationContext,
  PipelineContext,
  ToolPipeline
} from './PipelineTypes'
import type { ToolAdapter, ToolCategory } from './UnifiedToolRegistry'

// ========== paper 会话管道 ==========

const PAPER_PIPELINE: ToolPipeline = {
  stages: [
    {
      category: 'paper' as ToolCategory,
      execution: 'required'
    },
    {
      category: 'knowledge' as ToolCategory,
      execution: 'conditional',
      condition: (ctx: PipelineContext) => {
        const paperResults = ctx.stageResults.get('paper' as ToolCategory)
        return (
          !paperResults ||
          paperResults.length === 0 ||
          paperResults.some((r) => r.metadata.coverage === 'low')
        )
      },
      autoTrigger: {
        toolName: 'search',
        queryTransform: (originalQuery: string) => ({ query: originalQuery })
      }
    }
  ],
  mergeStrategy: 'smart_merge'
}

// ========== paper 会话工具注册规则 ==========

function hasPaperId(ctx: RegistrationContext): boolean {
  return !!ctx.request.paperId
}

function hasKnowledgeBases(ctx: RegistrationContext): boolean {
  return (ctx.selectedKnowledgeBases?.length ?? 0) > 0
}

const PAPER_TOOL_RULES: ToolRegistrationRule[] = [
  {
    category: 'paper' as ToolCategory,
    basePriority: 10,
    condition: hasPaperId,
    adapterResolver: (ctx: RegistrationContext) => ctx.adapters.paperContext,
    configureAdapter: (adapter: ToolAdapter, ctx: RegistrationContext) => {
      if (ctx.request.paperId) {
        ;(adapter as unknown as { setPaperId: (id: string) => void }).setPaperId(
          ctx.request.paperId
        )
      }
    }
  },
  {
    category: 'knowledge' as ToolCategory,
    basePriority: 20,
    condition: (ctx: RegistrationContext) => hasPaperId(ctx) || hasKnowledgeBases(ctx),
    adapterResolver: (ctx: RegistrationContext) => ctx.adapters.knowledge,
    configureAdapter: (adapter: ToolAdapter, ctx: RegistrationContext) => {
      const kbAdapter = adapter as unknown as {
        setKnowledgeBaseIds: (ids: string[] | undefined) => void
        setSemanticContext?: (ctx: unknown) => void
      }
      const userKbIds = ctx.selectedKnowledgeBases?.map((kb) => kb.id) ?? []
      kbAdapter.setKnowledgeBaseIds(userKbIds.length > 0 ? userKbIds : undefined)
      if (ctx.request.paperId && kbAdapter.setSemanticContext) {
        kbAdapter.setSemanticContext({
          paperId: ctx.request.paperId,
          title: '',
          keywords: [],
          domain: '综合'
        })
      }
    }
  },
  {
    category: 'paper_web' as ToolCategory,
    basePriority: 30,
    condition: (ctx: RegistrationContext) =>
      hasPaperId(ctx) && ctx.request.enablePaperWebSearch === true,
    adapterResolver: (ctx: RegistrationContext) => ctx.adapters.paperWebSearch
  },
  {
    category: 'mcp' as ToolCategory,
    basePriority: 40,
    condition: (ctx: RegistrationContext) => (ctx.selectedTools?.length ?? 0) > 0,
    adapterResolver: (ctx: RegistrationContext) => ctx.adapters.mcp
  },
  {
    category: 'lab' as ToolCategory,
    basePriority: 50,
    condition: (ctx: RegistrationContext) => ctx.request.enableLabTools === true,
    adapterResolver: (ctx: RegistrationContext) => ctx.adapters.lab
  }
]

// ========== default 会话（空管道） ==========

const DEFAULT_PIPELINE: ToolPipeline = {
  stages: []
}

const DEFAULT_TOOL_RULES: ToolRegistrationRule[] = [
  {
    category: 'knowledge' as ToolCategory,
    basePriority: 20,
    condition: (ctx: RegistrationContext) => hasKnowledgeBases(ctx),
    adapterResolver: (ctx: RegistrationContext) => ctx.adapters.knowledge,
    configureAdapter: (adapter: ToolAdapter, ctx: RegistrationContext) => {
      const kbAdapter = adapter as unknown as {
        setKnowledgeBaseIds: (ids: string[] | undefined) => void
      }
      const userKbIds = ctx.selectedKnowledgeBases?.map((kb) => kb.id) ?? []
      kbAdapter.setKnowledgeBaseIds(userKbIds.length > 0 ? userKbIds : undefined)
    }
  },
  {
    category: 'mcp' as ToolCategory,
    basePriority: 40,
    condition: (ctx: RegistrationContext) => (ctx.selectedTools?.length ?? 0) > 0,
    adapterResolver: (ctx: RegistrationContext) => ctx.adapters.mcp
  },
  {
    category: 'lab' as ToolCategory,
    basePriority: 50,
    condition: (ctx: RegistrationContext) => ctx.request.enableLabTools === true,
    adapterResolver: (ctx: RegistrationContext) => ctx.adapters.lab
  }
]

// ========== 导出配置数组 ==========

export const SESSION_TOOL_CONFIGS: SessionToolConfig[] = [
  {
    sessionType: 'paper',
    pipeline: PAPER_PIPELINE,
    toolRules: PAPER_TOOL_RULES
  },
  {
    sessionType: 'default',
    pipeline: DEFAULT_PIPELINE,
    toolRules: DEFAULT_TOOL_RULES
  }
]
