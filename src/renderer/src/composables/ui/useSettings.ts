/**
 * 设置管理 Composable
 * 负责设置弹窗的显示和配置更新
 * 配置更新通知使用 uiStateStore
 */

import { ref, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUIStateStore } from '@renderer/stores'

/**
 * useSettings 返回类型
 */
export interface UseSettingsReturn {
  showSettings: Ref<boolean>
  configUpdateKey: Ref<number>
  openSettings: () => void
  closeSettings: () => void
  handleConfigUpdated: () => void
  handleMCPUpdated: () => void
}

/**
 * 设置管理 Composable
 * 负责设置弹窗的显示和配置更新
 */
export function useSettings(): UseSettingsReturn {
  const uiStateStore = useUIStateStore()

  // 从 Store 获取配置更新标志
  const { configUpdateKey } = storeToRefs(uiStateStore)

  // 显示设置弹窗（本地状态，组件级别）
  const showSettings = ref(false)

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
    uiStateStore.notifyConfigUpdate()
  }

  /**
   * 处理 MCP 配置更新
   */
  function handleMCPUpdated(): void {
    uiStateStore.notifyMcpUpdate()
    // 也重新加载配置状态检查错误
    uiStateStore.loadConfigStatus()
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
