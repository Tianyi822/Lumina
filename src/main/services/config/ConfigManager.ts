import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { AppConfig, ConfigLoadResult } from '@main/types/config'
import { getConfigDirPath, getConfigFilePath } from './configPaths'
import { logger } from '@main/services/logger'
import type { EmbeddingConfig } from '@shared/types/config'

/**
 * 默认终端主题颜色
 */
export const DEFAULT_THEME_COLORS = {
  background: '#0d1117',
  backgroundSecondary: '#161b22',
  text: '#c9d1d9',
  textSecondary: '#8b949e',
  accent: '#3fb950',
  border: '#30363d'
}

/**
 * 创建空的基础配置结构
 * 包含所有必要的字段，但值为空或默认值
 */
function createEmptyConfig(): AppConfig {
  return {
    theme: {
      name: 'terminal',
      colors: DEFAULT_THEME_COLORS
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
      fewShotCount: 3
    },
    embeddingModels: {}
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
 * 用于向后兼容性
 */
function migrateConfig(config: AppConfig): AppConfig {
  const migrated = { ...config }

  // 确保 promptConfig 存在
  if (!migrated.promptConfig) {
    migrated.promptConfig = {
      enableEnhancedPrompt: true,
      toolDescriptionLevel: 'detailed',
      fewShotCount: 3
    }
  }

  // 确保 promptConfig 中的必要字段存在
  if (migrated.promptConfig.enableEnhancedPrompt === undefined) {
    migrated.promptConfig.enableEnhancedPrompt = true
  }
  if (!migrated.promptConfig.toolDescriptionLevel) {
    migrated.promptConfig.toolDescriptionLevel = 'detailed'
  }
  if (migrated.promptConfig.fewShotCount === undefined) {
    migrated.promptConfig.fewShotCount = 3
  }

  // 迁移嵌入模型配置
  migrated.embeddingModels = migrated.embeddingModels || {}

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
   */
  private createEmptyConfigFile(): AppConfig {
    const emptyConfig = createEmptyConfig()
    this.writeConfigFile(emptyConfig)
    return emptyConfig
  }

  /**
   * 初始化配置
   * 如果配置文件不存在，自动创建空配置文件
   * 只有在读取/解析配置时发生错误才返回错误信息
   */
  initialize(): ConfigLoadResult {
    try {
      const configPath = getConfigFilePath()

      // 检查配置文件是否存在，不存在则创建空配置
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

      // 读取配置文件
      let config = this.readConfigFile()

      // 迁移旧的嵌入模型配置
      config = migrateEmbeddingModels(config)

      // 应用迁移逻辑（确保新字段存在）
      config = migrateConfig(config)

      // 如果配置有更新，保存回去
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
   * 检查配置是否存在
   */
  configExists(): boolean {
    const configPath = getConfigFilePath()
    return existsSync(configPath)
  }

  /**
   * 获取配置状态信息
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
