/**
 * 工具描述详细程度
 */
export type ToolDescriptionLevel = 'basic' | 'detailed' | 'minimal'

/**
 * 提示词配置
 */
export interface PromptConfig {
  /** 是否启用增强版提示词 */
  enableEnhancedPrompt?: boolean
  /** 工具描述详细程度 */
  toolDescriptionLevel?: ToolDescriptionLevel
  /** Few-shot 示例数量 (0-5) */
  fewShotCount?: number
  /** 自定义系统提示词（覆盖默认提示词） */
  customSystemPrompt?: string
  /** 是否启用提示词缓存 */
  enablePromptCache?: boolean
  /** 缓存最大条目数 */
  cacheMaxSize?: number
  /** 缓存过期时间（小时） */
  cacheTTLHours?: number
  /** 是否启用动态示例 */
  enableDynamicExamples?: boolean
  /** 自动提取间隔（天） */
  autoExtractIntervalDays?: number
  /** 动态示例最小质量分数 */
  dynamicExampleMinQuality?: number
  /** 最大静态示例数量 */
  maxStaticExamples?: number
  /** 是否启用提示词优化 */
  enablePromptOptimization?: boolean
  /** 优化激进程度 */
  optimizationAggressiveness?: 'conservative' | 'balanced' | 'aggressive'
}

/**
 * LLM 配置项
 */
export interface LLMConfig {
  base_url: string
  api_key: string
  model_name: string
  temperature: number
  max_tokens: number
}

/**
 * LLM 配置集合
 */
export interface LLMConfigs {
  [key: string]: LLMConfig
}

/**
 * 主题颜色配置
 */
export interface ThemeColors {
  /** 主背景色 */
  background: string
  /** 次级背景色 */
  backgroundSecondary: string
  /** 主文字颜色 */
  text: string
  /** 次级文字颜色 */
  textSecondary: string
  /** 强调色 */
  accent: string
  /** 边框颜色 */
  border: string
}

/**
 * 主题配置
 */
export interface ThemeConfig {
  /** 主题名称 */
  name: string
  /** 主题颜色 */
  colors?: ThemeColors
}

// MCP 相关类型已移至 @shared/types/mcp.ts，避免重复定义
import type { MCPServerConfig, MCPTransportType } from './mcp'

// 重新导出以保持向后兼容
export type { MCPServerConfig, MCPTransportType }

/**
 * MCP 服务器配置集合
 */
export interface MCPServers {
  [key: string]: MCPServerConfig
}

/**
 * 应用配置
 */
export interface AppConfig {
  theme: ThemeConfig
  llm_configs: LLMConfigs
  default_model: string
  compression_threshold: number
  enable_auto_compression: boolean
  mcpServers: MCPServers
  /** 提示词配置 */
  promptConfig?: PromptConfig
}

/**
 * 配置加载结果
 */
export interface ConfigLoadResult {
  success: boolean
  config: AppConfig | null
  error?: string
}
