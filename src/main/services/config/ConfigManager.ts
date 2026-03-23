import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AppConfig, ConfigLoadResult } from '@main/types/config'
import { getConfigDirPath, getConfigFilePath } from './configPaths'
import { logger } from '@main/services/logger'
import {
  createDefaultVideoGenerationConfig,
  DEFAULT_VIDEO_GENERATION_TIMEOUT_MS,
  LEGACY_VIDEO_GENERATION_TIMEOUT_MS,
  type EmbeddingConfig
} from '@shared/types/config'
import { DEFAULT_KNOWLEDGE_MCP_CONFIG } from '@shared/types/knowledgeMCP'
import { normalizeCustomPromptVariables } from '@shared/utils'

/**
 * 创建空的基础配置结构
 * 包含所有必要的字段，但值为空或默认值
 * 主题颜色由 CSS 主题文件管理，不再在配置中保存
 */
function createEmptyConfig(): AppConfig {
  return {
    theme: {
      name: 'blooming-flowers'
    },
    llm_config: {
      default_model: '',
      compression_threshold: 0,
      enable_auto_compression: false,
      models: []
    },
    mcpServers: {},
    promptConfig: {
      enableEnhancedPrompt: true,
      toolDescriptionLevel: 'detailed',
      fewShotCount: 3,
      customSystemPrompt: '',
      enablePromptCache: false,
      enableDynamicExamples: false,
      autoExtractIntervalDays: 7,
      dynamicExampleMinQuality: 0.6,
      maxDynamicExamples: 20,
      enablePromptOptimization: false,
      optimizationAggressiveness: 'balanced',
      customVariables: []
    },
    embeddingModels: {},
    knowledgeMCP: DEFAULT_KNOWLEDGE_MCP_CONFIG,
    voiceRecognition: {
      provider: 'aliyun',
      enabled: false
    },
    videoGeneration: createDefaultVideoGenerationConfig()
  }
}

/**
 * 从旧的 embedding-models.json 文件迁移数据
 */
function migrateEmbeddingModels(config: AppConfig): AppConfig {
  const oldFilePath = join(getConfigDirPath(), 'embedding-models.json')
  if (!existsSync(oldFilePath)) {
    return config
  }

  try {
    const content = readFileSync(oldFilePath, 'utf-8')
    const oldModels = JSON.parse(content) as Record<string, EmbeddingConfig>
    if (Object.keys(oldModels).length > 0 && !config.embeddingModels) {
      config.embeddingModels = oldModels
      logger.info('迁移嵌入模型配置成功', 'main', { count: Object.keys(oldModels).length })
    }
  } catch (error) {
    logger.warn('迁移嵌入模型配置失败', 'main', { error })
  }

  return config
}

/**
 * 迁移配置，确保新字段存在
 * 用于向后兼容性，处理配置结构的变更
 */
function migrateConfig(config: AppConfig): AppConfig {
  const migrated = { ...config }

  if (!migrated.promptConfig) {
    migrated.promptConfig = {
      enableEnhancedPrompt: true,
      toolDescriptionLevel: 'detailed',
      fewShotCount: 3,
      customSystemPrompt: '',
      enablePromptCache: false,
      enableDynamicExamples: false,
      autoExtractIntervalDays: 7,
      dynamicExampleMinQuality: 0.6,
      maxDynamicExamples: 20,
      enablePromptOptimization: false,
      optimizationAggressiveness: 'balanced',
      customVariables: []
    }
  }

  if (migrated.promptConfig.enableEnhancedPrompt === undefined) {
    migrated.promptConfig.enableEnhancedPrompt = true
  }
  if (!migrated.promptConfig.toolDescriptionLevel) {
    migrated.promptConfig.toolDescriptionLevel = 'detailed'
  }
  if (migrated.promptConfig.fewShotCount === undefined) {
    migrated.promptConfig.fewShotCount = 3
  }
  if (migrated.promptConfig.customSystemPrompt === undefined) {
    migrated.promptConfig.customSystemPrompt = ''
  }
  if (migrated.promptConfig.enablePromptCache === undefined) {
    migrated.promptConfig.enablePromptCache = false
  }
  if (migrated.promptConfig.enableDynamicExamples === undefined) {
    migrated.promptConfig.enableDynamicExamples = false
  }
  if (migrated.promptConfig.autoExtractIntervalDays === undefined) {
    migrated.promptConfig.autoExtractIntervalDays = 7
  }
  if (migrated.promptConfig.dynamicExampleMinQuality === undefined) {
    migrated.promptConfig.dynamicExampleMinQuality = 0.6
  }
  if (migrated.promptConfig.maxDynamicExamples === undefined) {
    migrated.promptConfig.maxDynamicExamples = 20
  }
  if (migrated.promptConfig.enablePromptOptimization === undefined) {
    migrated.promptConfig.enablePromptOptimization = false
  }
  if (!migrated.promptConfig.optimizationAggressiveness) {
    migrated.promptConfig.optimizationAggressiveness = 'balanced'
  }
  migrated.promptConfig.customVariables = normalizeCustomPromptVariables(
    migrated.promptConfig.customVariables
  )
  delete (migrated.promptConfig as Record<string, unknown>).maxStaticExamples

  migrated.embeddingModels = migrated.embeddingModels || {}

  // 迁移 knowledgeMCP 配置
  if (!migrated.knowledgeMCP) {
    migrated.knowledgeMCP = DEFAULT_KNOWLEDGE_MCP_CONFIG
  }

  // 迁移语音识别配置
  if (!migrated.voiceRecognition) {
    migrated.voiceRecognition = {
      provider: 'aliyun',
      enabled: false
    }
  }

  const originalVideoGeneration = migrated.videoGeneration
  migrated.videoGeneration = {
    ...createDefaultVideoGenerationConfig(),
    ...migrated.videoGeneration
  }
  if (
    !originalVideoGeneration?.requestTimeoutMs ||
    originalVideoGeneration.requestTimeoutMs === LEGACY_VIDEO_GENERATION_TIMEOUT_MS
  ) {
    migrated.videoGeneration.requestTimeoutMs = DEFAULT_VIDEO_GENERATION_TIMEOUT_MS
  }

  return migrated
}

/**
 * 配置管理器
 * 负责配置的加载、保存和状态管理
 */
export class ConfigManager {
  private config: AppConfig | null = null
  private loadError: string | null = null
  private loaded: boolean = false

  /**
   * 确保配置目录存在
   * 如果目录不存在则创建
   */
  private ensureConfigDir(): void {
    const configDir = getConfigDirPath()
    if (!existsSync(configDir)) {
      mkdirSync(configDir, { recursive: true })
    }
  }

  /**
   * 读取配置文件
   */
  private readConfigFile(): AppConfig {
    const configPath = getConfigFilePath()
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as AppConfig
  }

  /**
   * 写入配置到文件
   */
  private writeConfigFile(config: AppConfig): void {
    this.ensureConfigDir()
    const configPath = getConfigFilePath()
    const configContent = JSON.stringify(config, null, 2)
    writeFileSync(configPath, configContent, 'utf-8')
  }

  /**
   * 创建空的配置文件
   * 创建包含默认结构的配置文件
   */
  private createEmptyConfigFile(): AppConfig {
    const emptyConfig = createEmptyConfig()
    this.writeConfigFile(emptyConfig)
    return emptyConfig
  }

  /**
   * 初始化配置
   * 如果配置文件不存在，自动创建空配置文件
   * 只有在读取或解析配置时发生错误才返回错误信息
   */
  initialize(): ConfigLoadResult {
    try {
      const configPath = getConfigFilePath()

      if (!existsSync(configPath)) {
        logger.info('配置文件不存在，正在创建空配置文件...')
        try {
          const emptyConfig = this.createEmptyConfigFile()
          this.config = emptyConfig
          this.loaded = true
          logger.info('空配置文件创建成功')
          return {
            success: true,
            config: emptyConfig
          }
        } catch (createError) {
          const errorMessage = `无法创建配置文件: ${createError instanceof Error ? createError.message : String(createError)}`
          logger.error(errorMessage)
          this.loaded = true
          this.loadError = errorMessage
          return {
            success: false,
            config: null,
            error: errorMessage
          }
        }
      }

      let config = this.readConfigFile()

      config = migrateEmbeddingModels(config)

      config = migrateConfig(config)

      this.config = config
      this.writeConfigFile(config)

      this.loaded = true
      logger.info('配置加载成功')
      return {
        success: true,
        config
      }
    } catch (error) {
      const errorMessage = `配置加载失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      this.loaded = true
      this.loadError = errorMessage
      return {
        success: false,
        config: null,
        error: errorMessage
      }
    }
  }

  /**
   * 保存配置
   */
  saveConfig(config: AppConfig): { success: boolean; error?: string } {
    try {
      this.writeConfigFile(config)
      this.config = config
      this.loadError = null
      logger.info('配置保存成功')
      return { success: true }
    } catch (error) {
      const errorMessage = `配置保存失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      return { success: false, error: errorMessage }
    }
  }

  /**
   * 获取当前配置
   */
  getConfig(): AppConfig | null {
    return this.config
  }

  /**
   * 更新配置（部分更新）
   * 将提供的配置字段合并到现有配置中
   */
  updateConfig(partialConfig: Partial<AppConfig>): { success: boolean; error?: string } {
    if (!this.config) {
      return { success: false, error: '无法更新：当前没有有效配置' }
    }

    const newConfig = { ...this.config, ...partialConfig }
    return this.saveConfig(newConfig)
  }

  /**
   * 获取加载错误信息
   */
  getLoadError(): string | null {
    return this.loadError
  }

  /**
   * 配置是否已加载
   */
  isLoaded(): boolean {
    return this.loaded
  }

  /**
   * 配置加载是否成功
   */
  isSuccess(): boolean {
    return this.config !== null
  }

  /**
   * 检查配置文件是否存在
   */
  configExists(): boolean {
    const configPath = getConfigFilePath()
    return existsSync(configPath)
  }

  /**
   * 获取配置状态信息
   * 返回加载状态、成功状态、错误信息和文件存在状态
   */
  getStatus(): { loaded: boolean; success: boolean; error: string | null; exists: boolean } {
    return {
      loaded: this.loaded,
      success: this.isSuccess(),
      error: this.loadError,
      exists: this.configExists()
    }
  }
}
