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
 * 单个 LLM 模型的配置项
 */
export interface LLMConfig {
  base_url: string
  api_key: string
  model_name: string
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
  /** 获取 API Key 的网址 */
  apiKeyUrl: string
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
    concurrency: 2,
    apiKeyUrl: 'https://bigmodel.cn/apikey/platform'
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
  /** 论文阅读器统一缩放倍数 (0.5-2.0)，所有视图共享 */
  zoomLevel?: number
  /** @deprecated 已废弃，缩放已统一为全局 zoomLevel，保留以兼容旧配置 */
  originalPdfZoomLevel?: number
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
