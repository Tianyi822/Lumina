<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import type { Message, MCPTool } from './types'
import TitleBar from './components/TitleBar.vue'
import Sidebar from './components/Sidebar.vue'
import MainContent from './components/MainContent.vue'
import ErrorBanner from './components/ErrorBanner.vue'
import ChatErrorToast from './components/ChatErrorToast.vue'
import ViewDemo from './components/ViewDemo.vue'
import { useConfigError } from './composables/useConfigError'
import { useSession } from './composables/useSession'
import { useMessageCache } from './composables/useMessageCache'
import { useChatStream } from './composables/useChatStream'
import { generateTitle, convertToToolReferences } from './utils/sessionHelpers'
import { buildChatMessages } from './utils/messageHelpers'

// 视图类型
type ViewMode = 'chat' | 'knowledge'

// ==================== 配置错误处理 ====================
const { configError, showError, loadConfigStatus, dismissError } = useConfigError()

// ==================== 聊天错误处理 ====================
const showChatError = ref(false)
const chatErrorMessage = ref('')

function handleChatError(error: string): void {
  showChatError.value = true
  chatErrorMessage.value = error
}

// ==================== 会话管理 ====================
const {
  currentSession,
  currentChatId,
  messages,
  sessionList,
  sessionUpdateKey,
  loadSessionList,
  saveCurrentSession,
  createSession,
  loadSession,
  deleteSession,
  updateSessionTitle
} = useSession()

// ==================== 消息缓存管理 ====================
const { sessionMessagesCache, cacheSession, getCachedSession, saveCachedSession } =
  useMessageCache()

// ==================== 聊天流式处理 ====================
const chatStream = useChatStream(
  () => currentSession.value,
  () => messages.value,
  saveCurrentSession,
  saveCachedSession,
  handleChatError
)

const { isSending, setupStreamListener, cleanupStreamListener, stopRequest } = chatStream

// ==================== UI 状态 ====================
const sidebarCollapsed = ref(false)
const currentModel = ref('')
const currentView = ref<ViewMode>('chat')

// ==================== 辅助函数 ====================
function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

// ==================== 会话操作 ====================
async function handleNewChat(): Promise<void> {
  await createSession()
}

async function handleSelectChat(sessionId: string): Promise<void> {
  // 如果选择的是当前会话，直接返回
  if (currentSession.value?.sessionId === sessionId) {
    return
  }

  // 用于跟踪新会话的发送状态
  let newSessionIsSending = false

  // 如果当前会话有流式响应正在进行，将消息状态和标题保存到缓存
  const currentSessionId = currentSession.value?.sessionId
  if (currentSessionId && isSending.value) {
    cacheSession(currentSessionId, messages.value, currentSession.value?.title)
  }

  // 检查目标会话是否有缓存的消息
  const cached = getCachedSession(sessionId)

  if (cached && cached.messages.length > 0) {
    // 使用缓存的消息
    const session = await window.api.session.load(sessionId)
    if (session) {
      currentSession.value = session
      currentChatId.value = session.sessionId
      // 恢复缓存的标题
      if (cached.title) {
        currentSession.value.title = cached.title
      }
      // 深拷贝缓存的消息
      messages.value = cached.messages.map((msg) => ({ ...msg }))
      // 检查是否有正在流式输出的消息
      newSessionIsSending = messages.value.some((msg) => msg.isStreaming)
    }
  } else {
    // 正常加载会话数据
    await loadSession(sessionId)
    newSessionIsSending = false
  }

  // 更新 isSending 状态为新会话的状态
  isSending.value = newSessionIsSending
}

async function handleDeleteSession(sessionId: string): Promise<void> {
  await deleteSession(sessionId)
}

// ==================== 消息发送 ====================
async function handleSendMessage(
  content: string,
  model: string,
  selectedTools: MCPTool[] = []
): Promise<void> {
  // 如果正在发送，忽略
  if (isSending.value) {
    return
  }

  // 如果没有选择模型，显示错误
  if (!model) {
    configError.value = '请先选择一个模型'
    showError.value = true
    return
  }

  // 如果没有当前对话，先创建一个
  if (!currentChatId.value || !currentSession.value) {
    await createSession()
  }

  // 确保当前会话存在
  if (!currentSession.value) {
    window.api.logger.error('创建会话失败，无法发送消息')
    return
  }

  const sessionId = currentSession.value.sessionId

  // 保存发送前的消息快照（用于错误回滚）
  const messagesSnapshot = JSON.parse(JSON.stringify(messages.value))

  // 记录当前正在流式响应的会话ID
  chatStream.setStreamingSessionId(sessionId)
  chatStream.setMessagesSnapshot(messagesSnapshot)

  // 更新当前模型
  currentModel.value = model

  // 检查是否是第一条消息（用于更新会话标题）
  const isFirstMessage = messages.value.length === 0

  // 添加用户消息
  const userMessage: Message = {
    id: `msg-${Date.now()}`,
    role: 'user',
    content,
    timestamp: new Date().toISOString()
  }
  messages.value.push(userMessage)

  // 创建助手消息占位符
  const assistantMessage: Message = {
    id: `msg-${Date.now() + 1}`,
    role: 'assistant',
    content: '',
    isStreaming: true,
    timestamp: new Date().toISOString(),
    modelName: model,
    reactSteps: []
  }
  messages.value.push(assistantMessage)

  // 设置发送状态
  isSending.value = true

  // 如果是第一条消息，更新会话标题
  if (isFirstMessage && currentSession.value) {
    updateSessionTitle(generateTitle(content))
  }

  try {
    // 构建消息历史
    const msgs = messages.value ?? []
    const chatMessages = buildChatMessages(msgs)
    // 移除最后一个空的助手消息
    chatMessages.pop()

    // 转换工具引用
    const toolReferences =
      selectedTools.length > 0 ? convertToToolReferences(selectedTools) : undefined

    // 调试日志：确认工具选择
    if (selectedTools.length > 0) {
      window.api.logger.info('发送消息时选中的 MCP 工具', {
        originalToolCount: selectedTools.length,
        originalTools: selectedTools.map((t) => `${t.serverName}/${t.name}`),
        convertedToolCount: toolReferences?.length ?? 0,
        convertedTools: toolReferences?.map((t) => `${t.serverName}/${t.toolName}`)
      })
    }

    // 发送请求（携带 sessionId 和工具列表）
    const result = await window.api.chat.send({
      messages: chatMessages,
      modelKey: model,
      sessionId,
      selectedTools: toolReferences
    })

    if (!result.success && result.error) {
      window.api.logger.error('发送消息失败', { error: result.error, sessionId })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    window.api.logger.error('发送消息异常', { error: errorMessage, sessionId })

    // 发生异常时回滚到发送前状态
    messages.value = messagesSnapshot
    isSending.value = false
    chatStream.setStreamingSessionId(null)
    // 发生异常时不保存会话
  }
}

async function handleStopRequest(): Promise<void> {
  const sessionId = currentSession.value?.sessionId
  if (sessionId) {
    await stopRequest(sessionId)
  }
}

// ==================== 生命周期钩子 ====================
onMounted(() => {
  loadConfigStatus()
  setupStreamListener(sessionMessagesCache.value ?? new Map())
  loadSessionList()
})

onUnmounted(() => {
  // 清理流式监听器
  cleanupStreamListener()
})
</script>

<template>
  <div class="app-container">
    <!-- 自定义标题栏 -->
    <TitleBar v-model="currentView" />

    <!-- 配置加载错误提示（仅在加载失败时显示） -->
    <ErrorBanner :error="configError" @dismiss="dismissError" />

    <!-- 聊天错误提示（临时显示） -->
    <ChatErrorToast
      :show="showChatError"
      :message="chatErrorMessage"
      @close="showChatError = false"
    />

    <!-- 主布局 -->
    <div class="app-layout">
      <!-- Chat 视图 -->
      <template v-if="currentView === 'chat'">
        <!-- 侧边栏 -->
        <Sidebar
          v-show="!sidebarCollapsed"
          :sessions="sessionList"
          :active-session-id="currentChatId"
          :session-update-key="sessionUpdateKey"
          @new-chat="handleNewChat"
          @select-chat="handleSelectChat"
          @delete-session="handleDeleteSession"
        />

        <!-- 主内容区 -->
        <MainContent
          :sidebar-collapsed="sidebarCollapsed"
          :current-chat-id="currentChatId"
          :messages="messages"
          :is-sending="isSending"
          :current-model-name="currentModel"
          @toggle-sidebar="toggleSidebar"
          @send-message="handleSendMessage"
          @stop-request="handleStopRequest"
        />
      </template>

      <!-- Demo 演示视图 -->
      <template v-else>
        <ViewDemo :view-mode="currentView" />
      </template>
    </div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100%;
  height: 100vh;
  display: flex;
  flex-direction: column;
  font-family: var(--theme-font);
  background-color: var(--theme-bg);
  color: var(--theme-text);
}

/* 主布局 */
.app-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}

/* Demo 视图样式 */
.view-demo {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
