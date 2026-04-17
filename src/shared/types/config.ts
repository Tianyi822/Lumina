import type { PromptVariable } from './prompt'

/**
 * 定义嵌入模型支持的提供商类型
 */
export type EmbeddingProviderType = 'openai' | 'aliyun' | 'ollama' | 'custom'

/**
 * 嵌入模型的配置信息
 */
export interface EmbeddingConfig {
  /** 模型服务提供商 */
  provider?: 'openai' | 'aliyun' | 'ollama' | 'custom'
  /** API 基础地址，需要兼容 OpenAI 接口格式 */
  baseUrl: string
  /** 调用 API 需要的密钥 */
  apiKey?: string
  /** 使用的模型名称 */
  model: string
  /** 模型生成的向量维度 */
  dimensions: number
  /** 该配置是否启用 */
  enabled?: boolean
  /** 模型显示的名称 */
  displayName?: string
  /** 配置创建的时间 */
  createdAt?: string
}

/**
 * 预定义的嵌入模型模板
 * 供用户快速选择常用的模型配置
 */
export interface PresetEmbeddingModel {
  id: string
  name: string
  dimension: number
  config: Partial<EmbeddingConfig>
}

/**
 * 多个嵌入模型配置的集合
 */
export interface EmbeddingConfigs {
  [modelId: string]: EmbeddingConfig
}

/**
 * 工具描述的详细程度
 * 控制传递给模型的工具描述信息量
 */
export type ToolDescriptionLevel = 'basic' | 'detailed' | 'minimal'

/**
 * 缓存配置接口
 */
export interface CacheConfig {
  /** 是否启用缓存 */
  enabled: boolean
  /** 系统提示词缓存的最大数量 */
  systemPromptMaxSize: number
  /** 系统提示词缓存的有效时间，单位小时 */
  systemPromptTTL: number
  /** 工具描述缓存的最大数量 */
  toolDescriptionMaxSize: number
  /** 工具描述缓存的有效时间，单位小时 */
  toolDescriptionTTL: number
  /** 示例格式化缓存的最大数量 */
  exampleFormattingMaxSize: number
  /** 示例格式化缓存的有效时间，单位小时 */
  exampleFormattingTTL: number
  /** 是否启用缓存命中率监控 */
  enableMetrics: boolean
  /** 监控数据保留的最大快照数 */
  maxMetricsSnapshots: number
}

/**
 * 提示词生成的相关配置
 * 影响聊天时发送给模型的系统提示词内容
 */
export interface PromptConfig {
  /** 是否使用增强版的提示词生成逻辑 */
  enableEnhancedPrompt?: boolean
  /** 工具描述的详细程度 */
  toolDescriptionLevel?: ToolDescriptionLevel
  /** Few-shot 示例的数量，范围 0 到 5 */
  fewShotCount?: number
  /** 自定义的系统提示词，会覆盖默认生成的提示词 */
  customSystemPrompt?: string
  /** 是否启用提示词缓存，减少重复构建的开销 */
  enablePromptCache?: boolean
  /** 详细的缓存配置 */
  cacheConfig?: CacheConfig
  /** 是否启用动态 Few-shot 示例 */
  enableDynamicExamples?: boolean
  /** 自动提取动态示例的间隔天数 */
  autoExtractIntervalDays?: number
  /** 动态示例的最低质量分数要求 */
  dynamicExampleMinQuality?: number
  /** 最大动态示例数量 */
  maxDynamicExamples?: number
  /** 是否启用提示词优化 */
  enablePromptOptimization?: boolean
  /** 提示词优化的激进程度 */
  optimizationAggressiveness?: 'conservative' | 'balanced' | 'aggressive'
  /** 是否启用工具描述智能适配 */
  enableToolDescriptionAdaptation?: boolean
  /** 用户自定义提示词变量 */
  customVariables?: PromptVariable[]
}

/**
 * 单个 LLM 模型的配置项
 */
export interface LLMConfig {
  base_url: string
  api_key: string
  model_name: string
  temperature: number
  max_tokens: number
}

/**
 * LLM 配置对象的完整结构
 * 包含多个模型配置和一些全局设置
 */
export interface LLMConfigObject {
  default_model: string
  compression_threshold: number
  enable_auto_compression: boolean
  models: LLMConfig[]
}

/**
 * 界面主题配置
 * 主题颜色由 CSS 主题文件管理（见 src/renderer/src/themes/ 目录）
 */
export type ThemeMode = 'manual' | 'system'

export interface ThemeConfig {
  /** 主题的名称（对应 CSS 主题文件的 data-theme 属性值） */
  name: string
  /** 主题切换模式：手动选择或跟随系统 */
  mode?: ThemeMode
}

// MCP 相关类型已移至 @shared/types/mcp.ts，避免重复定义
import type { MCPServerConfig, MCPTransportType } from './mcp'

// 知识库 MCP 服务配置
import type { KnowledgeMCPConfig } from './knowledgeMCP'

// 重新导出以保持向后兼容
export type { MCPServerConfig, MCPTransportType }

/**
 * OCR 服务提供商标识
 */
export type OcrProviderId = 'glm-ocr'

/**
 * OCR 服务提供商预设
 */
export interface OcrProviderPreset {
  id: OcrProviderId
  label: string
  modelName: string
  url: string
  concurrency: number
}

/**
 * 可选的 OCR 服务提供商列表
 */
export const OCR_PROVIDER_PRESETS: OcrProviderPreset[] = [
  {
    id: 'glm-ocr',
    label: 'GLM-OCR',
    modelName: 'glm-ocr',
    url: 'https://open.bigmodel.cn/api/paas/v4/layout_parsing',
    concurrency: 2
  }
]

export const DEFAULT_OCR_PROVIDER: OcrProviderId = 'glm-ocr'

/**
 * 根据 provider ID 获取预设配置
 */
export function getOcrProviderPreset(providerId: OcrProviderId): OcrProviderPreset | undefined {
  return OCR_PROVIDER_PRESETS.find((p) => p.id === providerId)
}

/**
 * 论文 OCR 配置
 */
export interface PaperOcrConfig {
  /** API Key */
  apiKey?: string
  /** 当前选择的 OCR 服务提供商 */
  provider: OcrProviderId
}

/**
 * 论文阅读配置
 * 包含 OCR 服务和翻译模型配置
 */
export interface PaperReaderConfig {
  /** OCR 服务配置 */
  ocr: PaperOcrConfig
  /** 翻译使用的模型名称；空或未设置表示使用默认模型 */
  translationModel?: string
}

/**
 * MCP 服务器配置的集合
 */
export interface MCPServers {
  [key: string]: MCPServerConfig
}

/**
 * 应用的完整配置
 */
export interface AppConfig {
  theme: ThemeConfig
  llm_config: LLMConfigObject
  mcpServers: MCPServers
  /** 提示词生成相关的配置 */
  promptConfig?: PromptConfig
  /** 知识库使用的嵌入模型配置集合 */
  embeddingModels?: EmbeddingConfigs
  /** 知识库 MCP 服务配置 */
  knowledgeMCP?: KnowledgeMCPConfig
  /** 论文阅读配置（含 OCR 与翻译模型） */
  paperReader?: PaperReaderConfig
}

/**
 * 配置加载操作的结果
 */
export interface ConfigLoadResult {
  /** 配置是否加载成功 */
  success: boolean
  /** 加载到的配置数据 */
  config: AppConfig | null
  /** 加载失败时的错误信息 */
  error?: string
}
