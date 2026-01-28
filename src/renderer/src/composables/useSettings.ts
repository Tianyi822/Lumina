import { ref } from 'vue'
import { useConfigError } from './useConfigError'

/**
 * 设置管理 Composable
 * 负责设置弹窗的显示和配置更新
 */
export function useSettings() {
  const { loadConfigStatus } = useConfigError()

  // 显示设置弹窗
  const showSettings = ref(false)

  // 配置更新标志，用于触发子组件刷新
  const configUpdateKey = ref(0)

  /**
   * 打开设置
   */
  function openSettings(): void {
    showSettings.value = true
  }

  /**
   * 关闭设置
   */
  function closeSettings(): void {
    showSettings.value = false
  }

  /**
   * 处理配置更新
   */
  function handleConfigUpdated(): void {
    configUpdateKey.value++
  }

  /**
   * 处理 MCP 配置更新
   */
  function handleMCPUpdated(): void {
    // MCP 配置更新后重新加载配置
    loadConfigStatus()
  }

  return {
    showSettings,
    configUpdateKey,
    openSettings,
    closeSettings,
    handleConfigUpdated,
    handleMCPUpdated
  }
}
