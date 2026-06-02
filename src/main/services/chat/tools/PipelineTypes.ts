import type { ToolCategory } from './UnifiedToolRegistry'
import type { ToolAdapter } from './UnifiedToolRegistry'
import type { MCPToolReference } from '../../../types/chat'
import type { ToolExecutionResult } from './UnifiedToolExecutor'
import type { ChatRequest } from '../../../types/chat'

// ========== 管道阶段 ==========

export type StageExecution = 'required' | 'conditional'

export interface AutoTriggerConfig {
  toolName: string
  queryTransform: (originalQuery: string, ctx: PipelineContext) => Record<string, unknown>
}

export interface PipelineStage {
  category: ToolCategory
  execution: StageExecution
  condition?: (ctx: PipelineContext) => boolean
  autoTrigger?: AutoTriggerConfig
}

export type ResultMergeStrategy = 'none' | 'dedupe' | 'rank' | 'smart_merge'

export interface ToolPipeline {
  stages: PipelineStage[]
  mergeStrategy?: ResultMergeStrategy
}

// ========== 管道上下文 ==========

export interface PipelineContext {
  sessionId: string
  request: ChatRequest
  modelToolCalls: import('./UnifiedToolExecutor').ToolCallDefinition[]
  stageResults: Map<ToolCategory, EnrichedToolResult[]>
  originalQuery: string
}

// ========== 结果增强 ==========

export type CoverageLevel = 'high' | 'medium' | 'low'

export interface ToolResultMetadata {
  coverage: CoverageLevel
  keyFindings: string[]
  sourceType: ToolCategory
  sourceName: string
  confidence: number
  suggestion?: string
}

export interface EnrichedToolResult extends ToolExecutionResult {
  metadata: ToolResultMetadata
}

// ========== 编排结果 ==========

export interface OrchestrationResult {
  results: ToolExecutionResult[]
  mergedContent: string | null
  metadata: {
    stagesExecuted: number
    autoTriggered: string[]
    merged: boolean
  }
}

// ========== 注册策略 ==========

export interface RegistrationContext {
  request: ChatRequest
  sessionId: string
  selectedKnowledgeBases?: import('@shared/types/knowledge').KnowledgeBaseReference[]
  selectedTools?: MCPToolReference[]
  adapters: AdapterRegistry
}

export interface AdapterRegistry {
  lab: ToolAdapter | null
  knowledge: ToolAdapter
  paperContext: ToolAdapter
  paperWebSearch: ToolAdapter | null
  mcp: ToolAdapter | null
}

export interface ToolRegistrationRule {
  category: ToolCategory
  basePriority: number
  condition: (context: RegistrationContext) => boolean
  adapterResolver: (context: RegistrationContext) => ToolAdapter | null
  configureAdapter?: (adapter: ToolAdapter, context: RegistrationContext) => void
}

export interface SessionToolConfig {
  sessionType: string
  pipeline: ToolPipeline
  toolRules: ToolRegistrationRule[]
}

// ========== 语义绑定 ==========

export interface PaperSemanticContext {
  paperId: string
  title: string
  keywords: string[]
  domain: string
  abstract?: string
}
