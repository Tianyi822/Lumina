import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import type { AppConfig, ConfigLoadResult } from '@main/types/config'
import { getConfigDirPath, getConfigFilePath } from './configPaths'
import { logger } from '@main/services/logger'
import {
  DEFAULT_OCR_PROVIDER,
  getOcrProviderPreset,
  type EmbeddingConfig,
  type OcrProviderId,
  type PaperReaderConfig
} from '@shared/types/config'
import {
  DEFAULT_THEME_ID,
  DEFAULT_THEME_MODE,
  normalizeThemeId,
  normalizeThemeMode
} from '@shared/utils'
import { DEFAULT_KNOWLEDGE_MCP_CONFIG } from '@shared/types/knowledgeMCP'

const PAPER_READER_ZOOM_DEFAULT = 1
const PAPER_READER_ZOOM_MIN = 0.5
const PAPER_READER_ZOOM_MAX = 2

function sanitizePaperReaderZoomLevel(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return PAPER_READER_ZOOM_DEFAULT
  }

  return Math.min(PAPER_READER_ZOOM_MAX, Math.max(PAPER_READER_ZOOM_MIN, +value.toFixed(2)))
}

function sanitizePaperReaderConfig(config: PaperReaderConfig | undefined): PaperReaderConfig {
  const provider =
    config?.ocr?.provider && getOcrProviderPreset(config.ocr.provider as OcrProviderId)
      ? config.ocr.provider
      : DEFAULT_OCR_PROVIDER
  const sanitized: PaperReaderConfig = {
    ocr: {
      provider
    },
    zoomLevel: sanitizePaperReaderZoomLevel(config?.zoomLevel),
    originalPdfZoomLevel: sanitizePaperReaderZoomLevel(config?.originalPdfZoomLevel)
  }

  if (typeof config?.ocr?.apiKey === 'string') {
    sanitized.ocr.apiKey = config.ocr.apiKey
  }

  if (typeof config?.translationModel === 'string' && config.translationModel.trim()) {
    sanitized.translationModel = config.translationModel.trim()
  }

  return sanitized
}

/**
 * 清理 lab 子系统遗留的本地数据（破坏性更新的一次性迁移）
 * 删除 ssh-connections.json、ssh-keys/、lab/ 目录。
 * 幂等：文件不存在则跳过；失败不阻断启动。
 * 仅在 labRemovalMigrated 标记未设置时由 migrateConfig 调用。
 */
function cleanupLegacyLabData(): void {
  const configDir = getConfigDirPath()
  const targets = [
    join(configDir, 'ssh-connections.json'),
    join(configDir, 'ssh-keys'),
    join(configDir, 'lab')
  ]
  for (const target of targets) {
    try {
      rmSync(target, { recursive: true, force: true })
      logger.info('已清理 lab 遗留数据', 'main', { path: target })
    } catch (err) {
      // 清理失败不阻断启动
      logger.warn('清理 lab 遗留数据失败', 'main', { path: target, error: String(err) })
    }
  }
}

/**
 * 创建空的基础配置结构
 * 包含所有必要的字段，但值为空或默认值
 * 主题颜色由 CSS 主题文件管理，不再在配置中保存
 */
function createEmptyConfig(): AppConfig {
  return {
    theme: {
      name: DEFAULT_THEME_ID,
      mode: DEFAULT_THEME_MODE
    },
    llm_config: {
      default_model: '',
      compression_threshold: 0,
      enable_auto_compression: false,
      models: []
    },
    mcpServers: {},
    embeddingModels: {},
    knowledgeMCP: DEFAULT_KNOWLEDGE_MCP_CONFIG,
    paperReader: sanitizePaperReaderConfig(undefined)
  }
}

/**
 * 从旧的 embedding-models.json 文件迁移嵌入模型配置
 * 旧版本使用独立文件存储嵌入模型配置，新版本合并到主配置中
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
 * 移除已废弃的字段（promptConfig、skills、paperOcr、voiceRecognition 等）
 * @param config 原始配置
 * @returns 迁移后的配置
 */
export function migrateConfig(config: AppConfig): AppConfig {
  const migrated = { ...config }

  migrated.theme = {
    name: normalizeThemeId(migrated.theme?.name),
    mode: normalizeThemeMode(migrated.theme?.mode)
  }

  delete (migrated as Record<string, unknown>).promptConfig

  migrated.embeddingModels = migrated.embeddingModels || {}
  delete (migrated as Record<string, unknown>).skills

  // 迁移 knowledgeMCP 配置
  if (!migrated.knowledgeMCP) {
    migrated.knowledgeMCP = DEFAULT_KNOWLEDGE_MCP_CONFIG
  }

  migrated.paperReader = sanitizePaperReaderConfig(migrated.paperReader)
  delete (migrated as Record<string, unknown>).paperOcr

  delete (migrated as Record<string, unknown>).voiceRecognition
  delete (migrated as Record<string, unknown>).aliyunMiaobi
  delete (migrated as Record<string, unknown>).videoGeneration

  // 剥离废弃的 labFeatures 字段（lab 子系统已移除）
  delete (migrated as Record<string, unknown>).labFeatures

  // 一次性清理 lab 遗留数据（破坏性更新），仅首次迁移执行
  if (!migrated.labRemovalMigrated) {
    cleanupLegacyLabData()
    migrated.labRemovalMigrated = true
  }

  return migrated
}

/**
 * 配置管理器
 * 负责配置的加载、保存和状态管理
 * @public 配置系统对外公共 API（经 services/config barrel re-export 作为稳定导出表面）
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
      const sanitizedConfig = migrateConfig(config)
      this.writeConfigFile(sanitizedConfig)
      this.config = sanitizedConfig
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

    const newConfig = {
      ...this.config,
      ...partialConfig
    }
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
