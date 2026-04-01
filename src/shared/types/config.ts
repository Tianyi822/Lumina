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
 * 语音识别服务提供商类型
 */
export type VoiceRecognitionProvider = 'aliyun'

/**
 * 语音识别配置
 */
export interface VoiceRecognitionConfig {
  /** 服务提供商 */
  provider: VoiceRecognitionProvider
  /** 阿里云 AccessKey ID */
  accessKeyId?: string
  /** 阿里云 AccessKey Secret */
  accessKeySecret?: string
  /** 服务鉴权 Token */
  token?: string
  /** 项目 Appkey */
  appkey?: string
  /** 是否启用语音识别功能 */
  enabled?: boolean
}

/**
 * 阿里云妙笔 PPT 配置
 */
export interface AliyunMiaobiConfig {
  /** 阿里云 AccessKey ID */
  accessKeyId: string
  /** 阿里云 AccessKey Secret */
  accessKeySecret: string
  /** 百炼业务空间 ID */
  workspaceId: string
}

/**
 * 视频生成服务提供商类型
 */
export type VideoGenerationProvider = 'zhipu'

/**
 * 视频分辨率
 */
export type VideoSize = '1920x1080' | '1080x1920' | '1280x720'

/**
 * 视频生成质量
 */
export type VideoQuality = 'quality' | 'speed'

/**
 * 视频生成配置
 */
export interface VideoGenerationConfig {
  /** 是否启用视频生成功能 */
  enabled: boolean
  /** 服务提供商 */
  provider: VideoGenerationProvider
  /** 服务基础地址 */
  baseUrl: string
  /** 调用 API 所需的密钥 */
  apiKey?: string
  /** 视频生成模型名称 */
  model: string
  /** 默认分辨率 */
  defaultSize: VideoSize
  /** 默认质量 */
  defaultQuality: VideoQuality
  /** 默认是否生成音频 */
  defaultWithAudio: boolean
  /** 轮询间隔 */
  pollIntervalMs?: number
  /** 请求超时时间 */
  requestTimeoutMs?: number
}

export const DEFAULT_VIDEO_GENERATION_BASE_URL = 'https://open.bigmodel.cn'
export const DEFAULT_VIDEO_GENERATION_MODEL = 'cogvideox-3'
export const DEFAULT_VIDEO_GENERATION_POLL_INTERVAL_MS = 5000
export const LEGACY_VIDEO_GENERATION_TIMEOUT_MS = 180000
export const DEFAULT_VIDEO_GENERATION_TIMEOUT_MS = 600000

/**
 * 创建默认的视频生成配置
 */
export function createDefaultVideoGenerationConfig(): VideoGenerationConfig {
  return {
    enabled: false,
    provider: 'zhipu',
    baseUrl: DEFAULT_VIDEO_GENERATION_BASE_URL,
    apiKey: '',
    model: DEFAULT_VIDEO_GENERATION_MODEL,
    defaultSize: '1920x1080',
    defaultQuality: 'quality',
    defaultWithAudio: false,
    pollIntervalMs: DEFAULT_VIDEO_GENERATION_POLL_INTERVAL_MS,
    requestTimeoutMs: DEFAULT_VIDEO_GENERATION_TIMEOUT_MS
  }
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
  /** 语音识别配置 */
  voiceRecognition?: VoiceRecognitionConfig
  /** 阿里云妙笔 PPT 配置 */
  aliyunMiaobi?: AliyunMiaobiConfig
  /** 视频生成配置 */
  videoGeneration?: VideoGenerationConfig
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
