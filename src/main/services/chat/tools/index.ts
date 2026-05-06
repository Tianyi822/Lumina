export {
  ToolDescriptionEnhancer,
  enhanceToolDescription,
  enhanceToolDescriptions,
  toolDescriptionEnhancer
} from './ToolDescriptionEnhancer'

// 统一工具注册表 + 适配器（阶段四）
export { UnifiedToolRegistry } from './UnifiedToolRegistry'
export type { ToolAdapter, ToolCategory, RegisteredTool } from './UnifiedToolRegistry'
export { LabToolAdapter } from './adapters/LabToolAdapter'
export { KnowledgeToolAdapter } from './adapters/KnowledgeToolAdapter'
export { MCPToolAdapter } from './adapters/MCPToolAdapter'

// 统一工具执行器（阶段五：合并 ToolExecutor + ToolCallScheduler）
export { UnifiedToolExecutor } from './UnifiedToolExecutor'
export type { ToolCallDefinition, UnifiedToolExecutorOptions } from './UnifiedToolExecutor'

// 工具统计收集器（阶段六）
export { ToolStatsCollector, toolStatsCollector } from './ToolStatsCollector'
