/**
 * 配置错误处理 Composable
 * 作为 uiStateStore 的包装层，保持向后兼容
 */

import { type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUIStateStore } from '@renderer/stores'

export function useConfigError(): {
  configError: Ref<string | null>
  showError: Ref<boolean>
  loadConfigStatus: () => Promise<void>
  dismissError: () => void
  showConfigError: (message: string) => void
} {
  const uiStateStore = useUIStateStore()

  // 从 Store 获取响应式引用
  const { configError, showConfigError: showError } = storeToRefs(uiStateStore)

  /**
   * 加载配置状态
   */
  async function loadConfigStatus(): Promise<void> {
    await uiStateStore.loadConfigStatus()
  }

  /**
   * 关闭错误提示
   */
  function dismissError(): void {
    uiStateStore.dismissConfigError()
  }

  /**
   * 显示配置错误
   */
  function showConfigError(message: string): void {
    uiStateStore.showConfigErrorMessage(message)
  }

  return {
    configError,
    showError,
    loadConfigStatus,
    dismissError,
    showConfigError
  }
}
