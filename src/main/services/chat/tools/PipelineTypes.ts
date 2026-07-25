import type { ToolCategory } from './UnifiedToolRegistry'
export type { ToolCategory }
import type { ToolAdapter } from './UnifiedToolRegistry'
import type { MCPToolReference } from '../../../types/chat'
import type { ToolCallDefinition, ToolExecutionResult } from './UnifiedToolExecutor'
import type { ChatRequest } from '../../../types/chat'

// ========== 管道阶段 ==========

/** 阶段执行模式：必须执行 / 条件执行 */
type StageExecution = 'required' | 'conditional'

/** 自动触发配置：当模型未调用某类工具时，系统自动生成一次调用 */
interface AutoTriggerConfig {
  /** 要自动触发的工具名称 */
  toolName: string
  /** 根据原始查询和上下文生成自动调用参数的转换函数 */
  queryTransform: (originalQuery: string, ctx: PipelineContext) => Record<string, unknown>
}

/** 管道中的一个执行阶段 */
export interface PipelineStage {
  /** 该阶段处理的工具类别 */
  category: ToolCategory
  /** 执行模式：required（必须执行）或 conditional（条件执行） */
  execution: StageExecution
  /** 条件执行时的判断函数 */
  condition?: (ctx: PipelineContext) => boolean
  /** 自动触发配置（当模型未调用该类别工具时生效） */
  autoTrigger?: AutoTriggerConfig
}

/** 结果合并策略：不合并 / 去重 / 排序 / 智能合并 */
export type ResultMergeStrategy = 'none' | 'dedupe' | 'rank' | 'smart_merge'

/** 工具管道的完整定义 */
export interface ToolPipeline {
  /** 分阶段执行的管道阶段列表 */
  stages: PipelineStage[]
  /** 阶段间结果合并策略（默认 none） */
  mergeStrategy?: ResultMergeStrategy
}

// ========== 管道上下文 ==========

/** 管道执行的上下文数据 */
export interface PipelineContext {
  /** 当前会话标识 */
  sessionId: string
  /** 原始聊天请求 */
  request: ChatRequest
  /** 模型本次发出的工具调用列表 */
  modelToolCalls: import('./UnifiedToolExecutor').ToolCallDefinition[]
  /** 各阶段的执行结果暂存 */
  stageResults: Map<ToolCategory, EnrichedToolResult[]>
  /** 用户原始查询文本 */
  originalQuery: string
}

// ========== 结果增强 ==========

/** 覆盖度级别：高 / 中 / 低 */
export type CoverageLevel = 'high' | 'medium' | 'low'

/** 工具执行结果的元数据（用于后续排序和融合决策） */
export interface ToolResultMetadata {
  /** 内容覆盖度 */
  coverage: CoverageLevel
  /** 关键发现摘要 */
  keyFindings: string[]
  /** 结果来源类别 */
  sourceType: ToolCategory
  /** 来源名称（如论文 ID、服务器名） */
  sourceName: string
  /** 可信度（0-1） */
  confidence: number
  /** 后续使用建议 */
  suggestion?: string
}

/** 携带元数据的增强工具执行结果 */
export interface EnrichedToolResult extends ToolExecutionResult {
  /** 增强的元数据 */
  metadata: ToolResultMetadata
}

// ========== 编排结果 ==========

/** 管道编排的最终执行结果 */
export interface OrchestrationResult {
  /** 所有工具的执行结果列表 */
  results: ToolExecutionResult[]
  /** 实际已执行的工具调用列表（含自动触发） */
  executedToolCalls: ToolCallDefinition[]
  /** 合并后的内容（启用合并策略时不为 null） */
  mergedContent: string | null
  /** 是否需要用户交互 */
  needUserInteraction: boolean
  /** 编排元数据 */
  metadata: {
    /** 实际执行的阶段数 */
    stagesExecuted: number
    /** 自动触发的工具名列表 */
    autoTriggered: string[]
    /** 是否执行了结果合并 */
    merged: boolean
  }
}

// ========== 注册策略 ==========

/** 工具注册评估上下文 */
export interface RegistrationContext {
  /** 原始聊天请求 */
  request: ChatRequest
  /** 会话标识 */
  sessionId: string
  /** 用户选中的知识库引用列表 */
  selectedKnowledgeBases?: import('@shared/types/knowledge').KnowledgeBaseReference[]
  /** 用户选中的 MCP 工具引用列表 */
  selectedTools?: MCPToolReference[]
  /** 各子系统的适配器注册表 */
  adapters: AdapterRegistry
}

/** 适配器注册表（按类别存放各子系统适配器） */
export interface AdapterRegistry {
  lab: ToolAdapter | null
  knowledge: ToolAdapter
  paperContext: ToolAdapter
  paperWebSearch: ToolAdapter | null
  mcp: ToolAdapter | null
}

/** 工具注册规则：定义在什么条件下注册哪个适配器的工具 */
export interface ToolRegistrationRule {
  /** 工具类别 */
  category: ToolCategory
  /** 基础优先级（越小越优先，注册后会被使用频率动态调整） */
  basePriority: number
  /** 条件函数：满足条件才注册该类别工具 */
  condition: (context: RegistrationContext) => boolean
  /** 解析适配器实例 */
  adapterResolver: (context: RegistrationContext) => ToolAdapter | null
  /** 可选：注册前对适配器进行配置 */
  configureAdapter?: (adapter: ToolAdapter, context: RegistrationContext) => void
}

/** 一种会话类型对应的工具配置（管道 + 注册规则） */
export interface SessionToolConfig {
  /** 会话类型标识 */
  sessionType: string
  /** 工具执行管道 */
  pipeline: ToolPipeline
  /** 工具注册规则列表 */
  toolRules: ToolRegistrationRule[]
}

// ========== 能力组合 ==========

/** 能力编排模式：必须 / 条件 / 按需 */
type CompositionMode = 'required' | 'conditional' | 'on_demand'

/** 自动触发定义 */
interface AutoTriggerDef {
  /** 要自动触发的工具名称 */
  toolName: string
  /** 根据查询和上下文生成参数的转换函数 */
  queryTransform: (query: string, ctx: PipelineContext) => Record<string, unknown>
}

/** 能力编排中的一个阶段 */
export interface CompositionStage {
  /** 能力 ID */
  capabilityId: string
  /** 编排模式 */
  mode: CompositionMode
  /** 条件执行时的判断函数 */
  condition?: (ctx: PipelineContext) => boolean
  /** 自动触发配置 */
  autoTrigger?: AutoTriggerDef
}

/** 能力组合定义 */
export interface CapabilityComposition {
  /** 各阶段的编排定义 */
  stages: CompositionStage[]
  /** 结果合并策略 */
  mergeStrategy?: ResultMergeStrategy
}

// ========== 语义绑定 ==========

/** 论文语义上下文（用于增强知识库搜索的相关性） */
export interface PaperSemanticContext {
  /** 论文 ID */
  paperId: string
  /** 论文标题 */
  title: string
  /** 从标题提取的关键词列表 */
  keywords: string[]
  /** 论文摘要 */
  abstract?: string
}
