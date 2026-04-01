import { configManager } from '@main/services/config'
import { logger } from '@main/services/logger'
import type { AliyunMiaobiConfig } from '@shared/types/config'

export interface AliyunMiaobiConfigResult {
  success: boolean
  configured: boolean
  config: AliyunMiaobiConfig
  error?: string
}

export interface AliyunMiaobiSaveResult {
  success: boolean
  error?: string
}

const EMPTY_CONFIG: AliyunMiaobiConfig = {
  accessKeyId: '',
  accessKeySecret: '',
  workspaceId: ''
}

function normalizeConfig(config?: Partial<AliyunMiaobiConfig> | null): AliyunMiaobiConfig {
  return {
    accessKeyId: config?.accessKeyId?.trim() || '',
    accessKeySecret: config?.accessKeySecret?.trim() || '',
    workspaceId: config?.workspaceId?.trim() || ''
  }
}

export class AliyunConfig {
  private ensureAppConfigLoaded():
    | { success: true; config: NonNullable<ReturnType<typeof configManager.getConfig>> }
    | { success: false; error: string } {
    const currentConfig = configManager.getConfig()
    if (currentConfig) {
      return { success: true, config: currentConfig }
    }

    const initResult = configManager.initialize()
    if (!initResult.success || !initResult.config) {
      return {
        success: false,
        error: initResult.error || '加载应用配置失败'
      }
    }

    return {
      success: true,
      config: initResult.config
    }
  }

  getConfig(): AliyunMiaobiConfigResult {
    const configResult = this.ensureAppConfigLoaded()
    if (!configResult.success) {
      logger.error('读取阿里云妙笔配置失败', 'main', { error: configResult.error })
      return {
        success: false,
        configured: false,
        config: { ...EMPTY_CONFIG },
        error: configResult.error
      }
    }

    const config = normalizeConfig(configResult.config.aliyunMiaobi)

    return {
      success: true,
      configured: this.isConfigured(config),
      config
    }
  }

  saveConfig(config: AliyunMiaobiConfig): AliyunMiaobiSaveResult {
    const normalizedConfig = normalizeConfig(config)
    const configResult = this.ensureAppConfigLoaded()
    if (!configResult.success) {
      logger.error('保存阿里云妙笔配置前加载应用配置失败', 'main', {
        error: configResult.error
      })
      return {
        success: false,
        error: configResult.error
      }
    }

    const saveResult = configManager.updateConfig({
      aliyunMiaobi: normalizedConfig
    })

    if (!saveResult.success) {
      logger.error('保存阿里云妙笔配置失败', 'main', {
        error: saveResult.error
      })
      return saveResult
    }

    logger.info('阿里云妙笔配置已保存', 'main', {
      workspaceId: normalizedConfig.workspaceId,
      configured: this.isConfigured(normalizedConfig)
    })

    return { success: true }
  }

  isConfigured(config?: Partial<AliyunMiaobiConfig> | null): boolean {
    const normalizedConfig = normalizeConfig(config)
    return Boolean(
      normalizedConfig.accessKeyId &&
      normalizedConfig.accessKeySecret &&
      normalizedConfig.workspaceId
    )
  }
}

export const aliyunConfig = new AliyunConfig()
