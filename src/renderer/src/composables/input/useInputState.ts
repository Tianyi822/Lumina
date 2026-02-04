import { ref } from 'vue'
import type { Ref } from 'vue'
import type { MCPTool, KnowledgeBase } from '../../types'

/**
 * 会话输入状态
 */
export interface SessionInputState {
  inputMessage: string
  selectedModel: string
  selectedMCPTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
}

/**
 * useInputState 返回类型
 */
export interface UseInputStateReturn {
  currentInputState: Ref<SessionInputState>
  sessionInputStates: Ref<Map<string, SessionInputState>>
  saveCurrentState: (sessionId: string) => void
  switchToSession: (sessionId: string) => void
  clearInputMessage: () => void
  clearSelectedTools: () => void
  clearSelectedKnowledgeBases: () => void
  updateInputMessage: (message: string) => void
  updateSelectedModel: (model: string) => void
  updateSelectedTools: (tools: MCPTool[]) => void
  updateSelectedKnowledgeBases: (kbs: KnowledgeBase[]) => void
  deleteSessionState: (sessionId: string) => void
  clearAllStates: () => void
}

/**
 * 输入状态管理 Composable
 * 为每个会话维护独立的输入状态
 */
export function useInputState(): UseInputStateReturn {
  // 会话ID到输入状态的映射
  const sessionInputStates = ref<Map<string, SessionInputState>>(new Map())

  // 当前会话的输入状态
  const currentInputState = ref<SessionInputState>({
    inputMessage: '',
    selectedModel: '',
    selectedMCPTools: [],
    selectedKnowledgeBases: []
  })

  /**
   * 获取或创建会话的输入状态
   */
  function getSessionState(sessionId: string): SessionInputState {
    if (!sessionInputStates.value.has(sessionId)) {
      sessionInputStates.value.set(sessionId, {
        inputMessage: '',
        selectedModel: '',
        selectedMCPTools: [],
        selectedKnowledgeBases: []
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
   * 清除当前会话的选中知识库
   */
  function clearSelectedKnowledgeBases(): void {
    currentInputState.value.selectedKnowledgeBases = []
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
   * 更新选中的知识库
   */
  function updateSelectedKnowledgeBases(kbs: KnowledgeBase[]): void {
    currentInputState.value.selectedKnowledgeBases = kbs
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
      selectedMCPTools: [],
      selectedKnowledgeBases: []
    }
  }

  return {
    currentInputState,
    sessionInputStates,
    saveCurrentState,
    switchToSession,
    clearInputMessage,
    clearSelectedTools,
    clearSelectedKnowledgeBases,
    updateInputMessage,
    updateSelectedModel,
    updateSelectedTools,
    updateSelectedKnowledgeBases,
    deleteSessionState,
    clearAllStates
  }
}
