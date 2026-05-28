/**
 * MCP IPC 输入校验函数
 * 纯函数，不依赖 electron，便于测试
 */

/** 校验 mcp:saveConfig 的输入参数 */
export function validateSaveConfig(config: unknown): string | null {
  if (!config || typeof config !== 'object') {
    return '配置参数无效'
  }
  const cfg = config as Record<string, unknown>
  if (!cfg.name || typeof cfg.name !== 'string' || !cfg.name.trim()) {
    return '配置名称不能为空'
  }
  return null
}

/** 校验 mcp:importConfigs 的输入参数 */
export function validateImportContent(jsonContent: unknown): string | null {
  if (typeof jsonContent !== 'string' || !jsonContent.trim()) {
    return '导入内容不能为空'
  }
  return null
}
