<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import type { MCPTool } from '@renderer/types'
import Sidebar from '@renderer/components/Sidebar.vue'
import MainContent from '@renderer/components/MainContent.vue'
import ChatErrorToast from '@renderer/components/ChatErrorToast.vue'
import { useSessionActions } from '@renderer/composables/session/useSessionActions'
import { useChatStream } from '@renderer/composables/chat/useChatStream'
import { useChatMessage } from '@renderer/composables/chat/useChatMessage'
import { useChatError } from '@renderer/composables/chat/useChatError'
import { useUIState } from '@renderer/composables/ui/useUIState'

// ==================== UI 状态管理 ====================
const uiState = useUIState()
const { currentModel, sidebarCollapsed } = uiState

// ==================== 聊天错误处理 ====================
const { showChatError, chatErrorMessage, handleChatError, closeChatError } = useChatError()

// ==================== 聊天流式处理 ====================
const chatStream = useChatStream()

// ==================== 会话管理（依赖 chatStream）====================
const sessionActions = useSessionActions(chatStream)

// 从 sessionActions 解构出需要的状态
const { currentChatId, messages, sessionList, sessionUpdateKey, currentInputState } = sessionActions
const { isSending } = chatStream

// ==================== 聊天消息处理 ====================
const { handleSendMessage } = useChatMessage(
  sessionActions,
  chatStream,
  currentModel,
  currentInputState,
  handleChatError
)

// ==================== 停止请求 ====================
async function handleStopRequest(): Promise<void> {
  const sessionId = sessionActions.currentSession.value?.sessionId
  if (sessionId) {
    await chatStream.stopRequest(sessionId)
  }
}

// ==================== 新聊天 ====================
async function handleNewChat(): Promise<void> {
  await sessionActions.handleNewChat()

  // 新会话创建后重置发送状态
  const newSessionId = sessionActions.currentSession.value?.sessionId
  if (newSessionId) {
    chatStream.setSessionSendingState(newSessionId, false)
  }
}

// ==================== 会话选择 ====================
async function handleSelectChat(sessionId: string): Promise<void> {
  const newSessionIsSending = await sessionActions.handleSelectChat(sessionId)
  chatStream.setSessionSendingState(sessionId, newSessionIsSending)
}

// ==================== 输入状态更新处理 ====================
function handleUpdateInputMessage(value: string): void {
  sessionActions.updateInputMessage(value)
}

function handleUpdateSelectedModel(value: string): void {
  sessionActions.updateSelectedModel(value)
}

function handleUpdateSelectedTools(value: MCPTool[]): void {
  sessionActions.updateSelectedTools(value)
}

// ==================== 生命周期 ====================
onMounted(async () => {
  chatStream.setupStreamListener(
    () => sessionActions.currentSession.value,
    () => sessionActions.messages.value,
    sessionActions.saveCurrentSession,
    sessionActions.saveCachedSession,
    handleChatError,
    sessionActions.sessionMessagesCache.value,
    sessionActions.updateSessionDescription
  )
  await sessionActions.loadSessionList()
})

onUnmounted(() => {
  chatStream.cleanupStreamListener()
})
</script>

<template>
  <div class="chat-page">
    <!-- 侧边栏 -->
    <Sidebar
      v-show="!sidebarCollapsed"
      :sessions="sessionList"
      :active-session-id="currentChatId"
      :session-update-key="sessionUpdateKey"
      @new-chat="handleNewChat"
      @select-chat="handleSelectChat"
      @delete-session="sessionActions.handleDeleteSession"
    />

    <!-- 主内容区 -->
    <!-- 使用 :key 绑定 currentChatId 确保切换会话时组件完全重新创建,实现状态隔离 -->
    <MainContent
      :key="currentChatId || 'no-chat'"
      :sidebar-collapsed="sidebarCollapsed"
      :current-chat-id="currentChatId"
      :messages="messages"
      :is-sending="isSending"
      :current-model-name="currentModel"
      :config-update-key="0"
      :input-message="currentInputState.inputMessage"
      :selected-model="currentInputState.selectedModel"
      :selected-m-c-p-tools="currentInputState.selectedMCPTools"
      @toggle-sidebar="uiState.toggleSidebar"
      @send-message="handleSendMessage"
      @stop-request="handleStopRequest"
      @update:input-message="handleUpdateInputMessage"
      @update:selected-model="handleUpdateSelectedModel"
      @update:selected-m-c-p-tools="handleUpdateSelectedTools"
    />

    <!-- 聊天错误提示(临时显示) -->
    <ChatErrorToast :show="showChatError" :message="chatErrorMessage" @close="closeChatError" />
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}
</style>
