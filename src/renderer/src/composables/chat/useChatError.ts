import { ref } from 'vue'
import type { Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useUIStateStore } from '@renderer/stores'

/**
 * useChatError 返回类型
 */
export interface UseChatErrorReturn {
  showChatError: Ref<boolean>
  chatErrorMessage: Ref<string>
  handleChatError: (error: string) => void
  closeChatError: () => void
}

/**
 * 聊天错误处理 Composable
 * 负责聊天相关的错误提示
 */
export function useChatError(): UseChatErrorReturn {
  const uiStateStore = useUIStateStore()
  const { configError, showConfigError } = storeToRefs(uiStateStore)

  // 显示聊天错误
  const showChatError = ref(false)
  const chatErrorMessage = ref('')

  /**
   * 处理聊天错误
   */
  function handleChatError(error: string): void {
    // 如果是配置相关错误，使用配置错误提示
    if (error.includes('请先选择一个模型') || error.includes('配置')) {
      configError.value = error
      showConfigError.value = true
    } else {
      // 否则使用聊天错误提示
      showChatError.value = true
      chatErrorMessage.value = error
    }
  }

  /**
   * 关闭聊天错误提示
   */
  function closeChatError(): void {
    showChatError.value = false
  }

  return {
    showChatError,
    chatErrorMessage,
    handleChatError,
    closeChatError
  }
}
