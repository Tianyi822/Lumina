import { ref } from 'vue'
import type { MCPTool } from '../../types'

/**
 * 会话输入状态
 */
export interface SessionInputState {
  inputMessage: string
  selectedModel: string
  selectedMCPTools: MCPTool[]
}

/**
 * 输入状态管理 Composable
 * 为每个会话维护独立的输入状态
 */
export function useInputState() {
  // 会话ID到输入状态的映射
  const sessionInputStates = ref<Map<string, SessionInputState>>(new Map())

  // 当前会话的输入状态
  const currentInputState = ref<SessionInputState>({
    inputMessage: '',
    selectedModel: '',
    selectedMCPTools: []
  })

  /**
   * 获取或创建会话的输入状态
   */
  function getSessionState(sessionId: string): SessionInputState {
    if (!sessionInputStates.value.has(sessionId)) {
      sessionInputStates.value.set(sessionId, {
        inputMessage: '',
        selectedModel: '',
        selectedMCPTools: []
      })
    }
    return sessionInputStates.value.get(sessionId)!
  }

  /**
   * 保存当前会话的输入状态
   */
  function saveCurrentState(sessionId: string): void {
    if (sessionId) {
      sessionInputStates.value.set(sessionId, { ...currentInputState.value })
    }
  }

  /**
   * 切换到指定会话的输入状态
   */
  function switchToSession(sessionId: string): void {
    const state = getSessionState(sessionId)
    currentInputState.value = { ...state }
  }

  /**
   * 清除当前会话的输入消息
   */
  function clearInputMessage(): void {
    currentInputState.value.inputMessage = ''
  }

  /**
   * 清除当前会话的选中工具
   */
  function clearSelectedTools(): void {
    currentInputState.value.selectedMCPTools = []
  }

  /**
   * 更新输入消息
   */
  function updateInputMessage(message: string): void {
    currentInputState.value.inputMessage = message
  }

  /**
   * 更新选中的模型
   */
  function updateSelectedModel(model: string): void {
    currentInputState.value.selectedModel = model
  }

  /**
   * 更新选中的工具
   */
  function updateSelectedTools(tools: MCPTool[]): void {
    currentInputState.value.selectedMCPTools = tools
  }

  /**
   * 删除会话的输入状态
   */
  function deleteSessionState(sessionId: string): void {
    sessionInputStates.value.delete(sessionId)
  }

  /**
   * 清除所有输入状态
   */
  function clearAllStates(): void {
    sessionInputStates.value.clear()
    currentInputState.value = {
      inputMessage: '',
      selectedModel: '',
      selectedMCPTools: []
    }
  }

  return {
    currentInputState,
    sessionInputStates,
    saveCurrentState,
    switchToSession,
    clearInputMessage,
    clearSelectedTools,
    updateInputMessage,
    updateSelectedModel,
    updateSelectedTools,
    deleteSessionState,
    clearAllStates
  }
}
