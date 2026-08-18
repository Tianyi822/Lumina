/**
 * MCP IPC 输入校验函数
 * 纯函数，不依赖 electron，便于测试
 */

import { t } from '@main/services/i18n'

/** 校验 mcp:saveConfig 的输入参数 */
export function validateSaveConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') {
    return t('notifications.settings.mcp.validateConfigInvalid')
  }
  const cfg = config as Record<string, unknown>
  if (!cfg.name || typeof cfg.name !== 'string' || !cfg.name.trim()) {
    return t('notifications.settings.mcp.validateConfigNameRequired')
  }
  return null
}

/** 校验 mcp:importConfigs 的输入参数 */
export function validateImportContent(jsonContent: unknown): string | null {
  if (typeof jsonContent !== 'string' || !jsonContent.trim()) {
    return t('notifications.settings.mcp.validateImportContentRequired')
  }
  return null
}
