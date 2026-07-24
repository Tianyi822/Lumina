import type {
  SessionToolConfig,
  ToolRegistrationRule,
  RegistrationContext,
  ToolPipeline
} from './PipelineTypes'
import type { ToolAdapter, ToolCategory } from './UnifiedToolRegistry'

// ========== paper 会话管道 ==========
// 论文会话强制要求执行论文上下文检索

const PAPER_PIPELINE: ToolPipeline = {
  stages: [
    {
      category: 'paper' as ToolCategory,
      execution: 'required'
    }
  ],
  mergeStrategy: 'none'
}

// ========== paper 会话工具注册规则 ==========

/** 检查会话是否关联了论文 */
function hasPaperId(ctx: RegistrationContext): boolean {
  return !!ctx.request.paperId
}

/** 检查用户是否选择了至少一个知识库 */
function hasKnowledgeBases(ctx: RegistrationContext): boolean {
  return (ctx.selectedKnowledgeBases?.length ?? 0) > 0
}

/** 论文会话的工具注册规则（按优先级：论文 > 知识库 > 论文联网搜索 > MCP） */
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
    condition: hasKnowledgeBases,
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
  }
]

// ========== default 会话（空管道） ==========

/** 默认会话（无管道，仅注册选中工具的规则） */
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
  }
]

// ========== 导出配置数组 ==========
// 各会话类型对应的工具注册规则和管道配置

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
