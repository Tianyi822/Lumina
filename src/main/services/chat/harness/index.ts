/**
 * Lumina Agent Harness 公开导出。
 *
 * Harness 是 Agent 运行的受控调度器,以中间件管道包裹核心引擎。
 * 详细设计见 docs/superpowers/specs/2026-07-21-agent-harness-design.md
 *
 * 阶段 A:仅类型与基础设施,未接入主流程。
 */
export type {
  HarnessContext,
  HarnessState,
  HarnessFlags,
  ToolCallRecord,
  IterationRecord,
  BudgetState,
  ToolExecutionResult,
  EngineKind,
  SessionType
} from './HarnessContext'

export type {
  HarnessConfig,
  ResolvedHarnessConfig,
  BudgetConfig,
  RouterConfig,
  ToolSelectionConfig,
  MiddlewareConfig,
  ToolExecutionConfig,
  TraceConfig
} from './config/HarnessConfig'

export { DEFAULT_HARNESS_CONFIG } from './config/defaultConfig'
export { PRESET_OVERRIDES } from './config/presetOverrides'
export { translateLegacyFlags } from './config/requestOverrides'

export type {
  HarnessMiddleware,
  ToolDef,
  ToolCall,
  ToolChoice,
  MutableModelRequest,
  RouteDecision,
  IterationDecision,
  RunOutcome
} from './middleware/types'
