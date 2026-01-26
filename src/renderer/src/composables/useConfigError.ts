import { ref, type Ref } from 'vue'

/**
 * 配置错误处理 Composable
 * 用于管理配置加载错误的显示和关闭
 */
export function useConfigError(): {
  configError: Ref<string | null>
  showError: Ref<boolean>
  loadConfigStatus: () => Promise<void>
  dismissError: () => void
  showConfigError: (message: string) => void
} {
  // 配置加载错误信息
  const configError = ref<string | null>(null)
  // 是否显示错误提示
  const showError = ref(false)

  /**
   * 加载配置状态
   * 只有在配置加载失败（如格式错误、权限问题等）时才显示错误
   */
  async function loadConfigStatus(): Promise<void> {
    try {
      const status = await window.api.config.getStatus()

      // 只有在配置加载失败时才显示错误（配置不存在时会自动创建，不需要提示）
      if (!status.success && status.error) {
        configError.value = status.error
        showError.value = true
      }
    } catch (error) {
      configError.value = `无法获取配置状态: ${error instanceof Error ? error.message : String(error)}`
      showError.value = true
    }
  }

  /**
   * 关闭错误提示
   */
  function dismissError(): void {
    showError.value = false
  }

  /**
   * 显示配置错误（用于其他场景）
   */
  function showConfigError(message: string): void {
    configError.value = message
    showError.value = true
  }

  return {
    configError,
    showError,
    loadConfigStatus,
    dismissError,
    showConfigError
  }
}
