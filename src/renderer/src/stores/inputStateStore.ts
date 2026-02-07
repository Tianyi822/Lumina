// 输入状态 Store
// 管理每个会话的输入状态（输入消息、选中的模型、工具、知识库）

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { MCPTool, KnowledgeBase } from '@renderer/types'
import type { SessionInputState } from './types'

// 默认输入状态
const DEFAULT_INPUT_STATE: SessionInputState = {
  inputMessage: '',
  selectedModel: '',
  selectedMCPTools: [],
  selectedKnowledgeBases: []
}

export const useInputStateStore = defineStore(
  'inputState',
  () => {
    // ==================== State ====================
    
    // 会话 ID 到输入状态的映射
    // 持久化存储，用于页面切换后恢复状态
    const sessionInputStates = ref<Map<string, SessionInputState>>(new Map())

    // 当前会话的输入状态（运行时状态，不持久化）
    const currentInputState = ref<SessionInputState>({ ...DEFAULT_INPUT_STATE })

    // 最后活动的会话 ID（用于页面切换后恢复）
    const lastActiveSessionId = ref<string | null>(null)

    // ==================== Getters ====================
    
    // 获取当前输入消息
    const inputMessage = computed(() => currentInputState.value.inputMessage)

    // 获取当前选中的模型
    const selectedModel = computed(() => currentInputState.value.selectedModel)

    // 获取当前选中的 MCP 工具
    const selectedMCPTools = computed(() => currentInputState.value.selectedMCPTools)

    // 获取当前选中的知识库
    const selectedKnowledgeBases = computed(() => currentInputState.value.selectedKnowledgeBases)

    // 获取已保存状态的会话数量
    const savedStateCount = computed(() => sessionInputStates.value.size)

    // ==================== Actions ====================
    
    // 获取或创建会话的输入状态
    function getSessionState(sessionId: string): SessionInputState {
      if (!sessionInputStates.value.has(sessionId)) {
        sessionInputStates.value.set(sessionId, { ...DEFAULT_INPUT_STATE })
      }
      return sessionInputStates.value.get(sessionId)!
    }

    // 保存当前会话的输入状态
    function saveCurrentState(sessionId: string): void {
      if (!sessionId) {
        window.api.logger.warn('[InputStateStore] 尝试保存空会话 ID 的状态')
        return
      }

      sessionInputStates.value.set(sessionId, { ...currentInputState.value })
      lastActiveSessionId.value = sessionId

      window.api.logger.debug('[InputStateStore] 保存输入状态', {
        sessionId,
        hasTools: currentInputState.value.selectedMCPTools.length > 0,
        hasKnowledgeBases: currentInputState.value.selectedKnowledgeBases.length > 0,
        model: currentInputState.value.selectedModel
      })
    }

    // 切换到指定会话的输入状态
    function switchToSession(sessionId: string): void {
      const state = getSessionState(sessionId)
      currentInputState.value = { ...state }
      lastActiveSessionId.value = sessionId

      window.api.logger.debug('[InputStateStore] 切换到会话输入状态', {
        sessionId,
        hasTools: state.selectedMCPTools.length > 0,
        hasKnowledgeBases: state.selectedKnowledgeBases.length > 0
      })
    }

    // 更新输入消息
    function updateInputMessage(message: string): void {
      currentInputState.value.inputMessage = message
    }

    // 更新选中的模型
    function updateSelectedModel(model: string): void {
      currentInputState.value.selectedModel = model
    }

    // 更新选中的工具
    function updateSelectedTools(tools: MCPTool[]): void {
      currentInputState.value.selectedMCPTools = [...tools]

      window.api.logger.debug('[InputStateStore] 更新选中工具', {
        count: tools.length,
        tools: tools.map((t) => `${t.serverName}/${t.name}`)
      })
    }

    // 更新选中的知识库
    function updateSelectedKnowledgeBases(kbs: KnowledgeBase[]): void {
      currentInputState.value.selectedKnowledgeBases = [...kbs]

      window.api.logger.debug('[InputStateStore] 更新选中知识库', {
        count: kbs.length,
        kbs: kbs.map((kb) => kb.name)
      })
    }

    // 切换工具选择状态（添加或移除）
    function toggleToolSelection(tool: MCPTool): void {
      const tools = currentInputState.value.selectedMCPTools
      const index = tools.findIndex((t) => t.name === tool.name && t.serverName === tool.serverName)

      if (index >= 0) {
        // 取消选择
        tools.splice(index, 1)
      } else {
        // 添加选择
        tools.push(tool)
      }

      window.api.logger.debug('[InputStateStore] 切换工具选择', {
        action: index >= 0 ? 'removed' : 'added',
        tool: `${tool.serverName}/${tool.name}`,
        selectedCount: tools.length
      })
    }

    // 清除当前会话的输入消息
    function clearInputMessage(): void {
      currentInputState.value.inputMessage = ''
    }

    // 清除当前会话的选中工具
    function clearSelectedTools(): void {
      currentInputState.value.selectedMCPTools = []
    }

    // 清除当前会话的选中知识库
    function clearSelectedKnowledgeBases(): void {
      currentInputState.value.selectedKnowledgeBases = []
    }

    // 删除会话的输入状态
    function deleteSessionState(sessionId: string): void {
      sessionInputStates.value.delete(sessionId)

      // 如果删除的是当前会话，重置当前状态
      if (lastActiveSessionId.value === sessionId) {
        currentInputState.value = { ...DEFAULT_INPUT_STATE }
        lastActiveSessionId.value = null
      }

      window.api.logger.debug('[InputStateStore] 删除会话输入状态', { sessionId })
    }

    // 清除所有输入状态
    function clearAllStates(): void {
      sessionInputStates.value.clear()
      currentInputState.value = { ...DEFAULT_INPUT_STATE }
      lastActiveSessionId.value = null

      window.api.logger.debug('[InputStateStore] 清除所有输入状态')
    }

    // 恢复指定会话的输入状态（用于页面切换后恢复）
    function restoreSessionState(sessionId: string): boolean {
      const state = sessionInputStates.value.get(sessionId)
      if (state) {
        currentInputState.value = { ...state }
        lastActiveSessionId.value = sessionId

        window.api.logger.info('[InputStateStore] 恢复会话输入状态', {
          sessionId,
          hasTools: state.selectedMCPTools.length > 0,
          hasKnowledgeBases: state.selectedKnowledgeBases.length > 0
        })
        return true
      }
      return false
    }

    return {
      // State
      sessionInputStates,
      currentInputState,
      lastActiveSessionId,
      // Getters
      inputMessage,
      selectedModel,
      selectedMCPTools,
      selectedKnowledgeBases,
      savedStateCount,
      // Actions
      getSessionState,
      saveCurrentState,
      switchToSession,
      updateInputMessage,
      updateSelectedModel,
      updateSelectedTools,
      updateSelectedKnowledgeBases,
      toggleToolSelection,
      clearInputMessage,
      clearSelectedTools,
      clearSelectedKnowledgeBases,
      deleteSessionState,
      clearAllStates,
      restoreSessionState
    }
  },
  {
    // 持久化配置
    persist: {
      key: 'sparrow-input-state',
      // 只持久化 sessionInputStates，不持久化运行时状态
      pick: ['sessionInputStates', 'lastActiveSessionId'],
      // 序列化配置
      serializer: {
        serialize: (value) => {
          // 将 Map 转换为普通对象进行序列化
          const serialized = {
            ...value,
            sessionInputStates: Array.from(value.sessionInputStates.entries())
          }
          return JSON.stringify(serialized)
        },
        deserialize: (value) => {
          const parsed = JSON.parse(value)
          // 将数组转换回 Map
          if (Array.isArray(parsed.sessionInputStates)) {
            parsed.sessionInputStates = new Map(parsed.sessionInputStates)
          } else {
            parsed.sessionInputStates = new Map()
          }
          return parsed
        }
      }
    }
  }
)
