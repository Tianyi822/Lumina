<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { MCPTool } from '@renderer/types'
import Sidebar from '@renderer/components/Sidebar.vue'
import MainContent from '@renderer/components/MainContent.vue'
import ChatErrorToast from '@renderer/components/ChatErrorToast.vue'
import { useSessionActions } from '@renderer/composables/useSessionActions'
import { useChatStream } from '@renderer/composables/useChatStream'
import { useChatMessage } from '@renderer/composables/useChatMessage'
import { useChatError } from '@renderer/composables/useChatError'
import { useUIState } from '@renderer/composables/useUIState'

// ==================== UI 状态管理 ====================
const uiState = useUIState()
const { currentModel, sidebarCollapsed } = uiState

// ==================== 聊天错误处理 ====================
const { showChatError, chatErrorMessage, handleChatError, closeChatError } = useChatError()

// ==================== 会话管理 ====================
// 先创建一个临时 chatStream 对象用于初始化 sessionActions
const tempChatStream = {
  isSending: ref(false),
  setStreamingSessionId: () => {}
}

const sessionActions = useSessionActions(tempChatStream)

// 从 sessionActions 中解构出响应式变量供模板使用
const { currentChatId, messages, sessionList, sessionUpdateKey, currentInputState } = sessionActions

// ==================== 聊天流式处理 ====================
const chatStream = useChatStream(
  () => sessionActions.currentSession.value,
  () => sessionActions.messages.value,
  sessionActions.saveCurrentSession,
  (sessionId: string) => sessionActions.saveCachedSession(sessionId),
  handleChatError
)

const {
  isSending,
  setupStreamListener,
  cleanupStreamListener,
  stopRequest,
  getSessionSendingState,
  setSessionSendingState
} = chatStream

// ==================== 聊天消息处理 ====================
const { handleSendMessage } = useChatMessage(
  sessionActions.currentSession,
  sessionActions.currentChatId,
  sessionActions.messages,
  isSending,
  currentModel,
  currentInputState,
  sessionActions.createSession,
  sessionActions.updateSessionTitle,
  chatStream.setStreamingSessionId,
  chatStream.setMessagesSnapshot,
  handleChatError,
  sessionActions.clearInputMessage,
  chatStream.getSessionSendingState,
  chatStream.setSessionSendingState
)

// ==================== 停止请求 ====================
async function handleStopRequest(): Promise<void> {
  const sessionId = sessionActions.currentSession.value?.sessionId
  if (sessionId) {
    await stopRequest(sessionId)
  }
}

// ==================== 新聊天 ====================
async function handleNewChat(): Promise<void> {
  const currentSessionId = sessionActions.currentSession.value?.sessionId

  // 如果当前有正在进行的请求,先保存当前状态
  if (currentSessionId) {
    const isSessionSending = getSessionSendingState(currentSessionId)
    if (isSessionSending) {
      // 当前会话正在发送,仅保存状态,不重置 isSending
      await sessionActions.handleNewChat()
    } else {
      // 当前会话没有正在发送,直接创建新会话
      await sessionActions.handleNewChat()
    }
  } else {
    // 没有当前会话,直接创建新会话
    await sessionActions.handleNewChat()
  }

  // 获取新创建的会话ID
  const newSessionId = sessionActions.currentSession.value?.sessionId
  if (newSessionId) {
    // 初始化新会话的发送状态为 false
    setSessionSendingState(newSessionId, false)
    // 更新全局 isSending(反映新会话的状态)
    isSending.value = false
  }
}

// ==================== 会话选择 ====================
async function handleSelectChat(sessionId: string): Promise<void> {
  // 获取新会话的发送状态
  const newSessionIsSending = await sessionActions.handleSelectChat(sessionId)

  // 使用会话级别的状态管理
  setSessionSendingState(sessionId, newSessionIsSending)

  // 更新全局 isSending(反映当前会话的状态)
  isSending.value = newSessionIsSending
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
  setupStreamListener(sessionActions.sessionMessagesCache.value)
  await sessionActions.loadSessionList()
})

onUnmounted(() => {
  cleanupStreamListener()
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
