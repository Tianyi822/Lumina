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
 * 主题配置
 */
export interface ThemeConfig {
  name: string
}

/**
 * MCP 服务器配置
 */
export interface MCPServerConfig {
  type: string
  url: string
}

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
}

/**
 * 配置加载结果
 */
export interface ConfigLoadResult {
  success: boolean
  config: AppConfig | null
  error?: string
}
