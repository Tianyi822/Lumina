<script setup lang="ts">
import { onMounted, onUnmounted, watch, computed, toRaw } from 'vue'
import { storeToRefs } from 'pinia'
import type {
  MCPTool,
  KnowledgeBase,
  StreamEvent,
  ChatMessage,
  AttachedDocument,
  AttachedImage
} from '@renderer/types'
import MainContent from '@renderer/components/MainContent.vue'
import ChatErrorToast from '@renderer/components/ChatErrorToast.vue'

// Stores
import {
  useSessionStore,
  useChatStreamStore,
  useInputStateStore,
  useUIStateStore
} from '@renderer/stores'

// ==================== Stores ====================
const sessionStore = useSessionStore()
const chatStreamStore = useChatStreamStore()
const inputStateStore = useInputStateStore()
const uiStateStore = useUIStateStore()

// 使用 storeToRefs 保持响应式连接（关键：确保数组内部变化能触发 UI 更新）
const { currentChatId, messages, currentSession } = storeToRefs(sessionStore)
const { isSending } = storeToRefs(chatStreamStore)
const { currentModel } = storeToRefs(uiStateStore)

// 聊天错误状态
const { showChatError, chatError } = storeToRefs(uiStateStore)

// computed 用于派生状态
const currentInputState = computed(() => inputStateStore.currentInputState)

// 聊天错误消息（兼容旧命名）
const chatErrorMessage = computed(() => chatError.value ?? '')

// 聊天错误处理
function handleChatError(error: string): void {
  uiStateStore.handleChatError(error)
}

function closeChatError(): void {
  uiStateStore.closeChatError()
}

// ==================== 发送消息处理 ====================
async function handleSendMessage(
  content: string,
  model: string,
  selectedTools: MCPTool[] = [],
  selectedKnowledgeBases: KnowledgeBase[] = [],
  enableSandboxTools: boolean = false,
  attachedDocuments: AttachedDocument[] = [],
  attachedImages: AttachedImage[] = []
): Promise<void> {
  const trimmedContent = content.trim()

  if (!trimmedContent) {
    return
  }

  // 立即清空输入消息状态，避免界面延迟
  inputStateStore.clearInputMessage()

  // 如果没有当前对话，先创建一个
  if (!currentChatId.value || !currentSession.value) {
    await sessionStore.createSession()
  }

  // 确保当前会话存在
  if (!currentSession.value) {
    window.api.logger.error('[ChatPage] 创建会话失败，无法发送消息')
    return
  }

  const sessionId = currentSession.value.sessionId

  // 检查当前会话是否正在发送
  if (chatStreamStore.getSessionSendingState(sessionId)) {
    window.api.logger.warn('[ChatPage] 当前会话正在发送消息，忽略重复请求', { sessionId })
    return
  }

  // 如果没有选择模型，显示错误
  if (!model) {
    handleChatError('请先选择一个模型')
    return
  }

  // 保存发送前的消息快照（用于错误回滚）
  const messagesSnapshot = JSON.parse(JSON.stringify(messages.value))
  chatStreamStore.saveMessagesSnapshot(sessionId, messagesSnapshot)

  // 记录当前正在流式响应的会话ID
  chatStreamStore.streamingSessionId = sessionId

  // 更新当前模型
  uiStateStore.setCurrentModel(model)
  inputStateStore.updateSelectedModel(model)

  // 检查是否是第一条消息（用于更新会话标题）- 在添加消息前判断
  const isFirstMessage = messages.value.length === 0

  // 如果是第一条消息，更新会话标题
  if (isFirstMessage) {
    const title = trimmedContent.slice(0, 20) + (trimmedContent.length > 20 ? '...' : '')
    sessionStore.updateSessionTitle(title)
  }

  // 添加用户消息
  const userMessage = {
    id: `msg-${Date.now()}`,
    role: 'user' as const,
    content: trimmedContent,
    timestamp: new Date().toISOString(),
    attachedDocuments: attachedDocuments.length > 0 ? attachedDocuments : undefined,
    attachedImages: attachedImages.length > 0 ? attachedImages : undefined
  }
  sessionStore.addMessage(userMessage)

  // 创建助手消息占位符
  const assistantMessage = {
    id: `msg-${Date.now() + 1}`,
    role: 'assistant' as const,
    content: '',
    isStreaming: true,
    timestamp: new Date().toISOString(),
    modelName: model,
    reactSteps: [],
    reactIterations: []
  }
  sessionStore.addMessage(assistantMessage)

  // 设置发送状态
  chatStreamStore.setSessionSendingState(sessionId, true, true)

  try {
    // 构建消息历史（排除最后一个空的助手占位符）
    // 使用 JSON 序列化移除 Vue 响应式代理，避免克隆错误
    const chatMessages: ChatMessage[] = JSON.parse(
      JSON.stringify(
        messages.value.slice(0, -1).map((msg) => {
          const result: ChatMessage = {
            role: msg.role,
            content: msg.content
          }
          // 添加工具调用字段
          if (msg.tool_calls) {
            result.tool_calls = msg.tool_calls
          }
          if (msg.tool_call_id) {
            result.tool_call_id = msg.tool_call_id
          }
          if (msg.reasoning) {
            result.reasoning_content = msg.reasoning
          }
          if (msg.attachedDocuments && msg.attachedDocuments.length > 0) {
            result.attachedDocuments = msg.attachedDocuments
          }
          if (msg.attachedImages && msg.attachedImages.length > 0) {
            result.attachedImages = msg.attachedImages
          }
          return result
        })
      )
    )

    // 转换工具引用（使用 toRaw 移除响应式包装）
    const toolReferences =
      selectedTools.length > 0
        ? selectedTools.map((t) => {
            const tool = toRaw(t)
            return {
              serverName: tool.serverName,
              toolName: tool.name,
              description: tool.description || '',
              inputSchema: toRaw(tool.inputSchema) || {}
            }
          })
        : undefined

    // 转换知识库引用（使用 toRaw 移除响应式包装）
    const kbReferences =
      selectedKnowledgeBases.length > 0
        ? selectedKnowledgeBases.map((kb) => {
            const kbRaw = toRaw(kb)
            return {
              id: kbRaw.id,
              name: kbRaw.name,
              description: kbRaw.description || '',
              documentCount: (kbRaw as { documentCount?: number }).documentCount || 0
            }
          })
        : undefined

    // 发送请求
    const result = await window.api.chat.send({
      messages: chatMessages,
      modelKey: model,
      sessionId,
      selectedTools: toolReferences,
      selectedKnowledgeBases: kbReferences,
      enableSandboxTools
    })

    if (!result.success && result.error) {
      window.api.logger.error('[ChatPage] 发送消息失败', { error: result.error, sessionId })
      handleChatError(result.error)
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    window.api.logger.error('[ChatPage] 发送消息异常', { error: errorMessage, sessionId })

    // 发生异常时回滚到发送前状态
    messages.value.length = 0
    messages.value.push(...messagesSnapshot)
    chatStreamStore.setSessionSendingState(sessionId, false, true)
    chatStreamStore.streamingSessionId = null

    handleChatError(errorMessage)
  }
}

// ==================== 停止请求 ====================
async function handleStopRequest(): Promise<void> {
  const sessionId = currentChatId.value
  if (!sessionId) return

  // 调用 store 的停止方法
  await chatStreamStore.stopRequest(sessionId, messages.value)

  // 保存会话以持久化停止后的状态
  await sessionStore.saveCurrentSession()
}

// ==================== 输入状态更新处理 ====================
function handleUpdateInputMessage(value: string): void {
  inputStateStore.updateInputMessage(value)
}

function handleUpdateSelectedModel(value: string): void {
  inputStateStore.updateSelectedModel(value)
  uiStateStore.setCurrentModel(value)
}

function handleUpdateSelectedTools(value: MCPTool[]): void {
  inputStateStore.updateSelectedTools(value)
  void sessionStore.persistCurrentSelectionState()
}

function handleUpdateSelectedKnowledgeBases(value: KnowledgeBase[]): void {
  inputStateStore.updateSelectedKnowledgeBases(value)
  void sessionStore.persistCurrentSelectionState()
}

function handleUpdateEnableSandboxTools(value: boolean): void {
  inputStateStore.updateEnableSandboxTools(value)
  void sessionStore.persistCurrentSelectionState()
}

// ==================== 流式事件处理 ====================
function handleStreamEvent(event: StreamEvent): void {
  chatStreamStore.handleStreamEvent(event, currentChatId.value || null, messages.value)

  // 流式响应完成或出错时保存会话
  if (event.type === 'done' || event.type === 'error') {
    sessionStore.saveCurrentSession()
    return
  }

  // 对于后台异步回填的视频结果，在非流式状态下也立即持久化
  if (
    event.type === 'tool_result' &&
    event.sessionId === currentChatId.value &&
    !messages.value.some((message) => message.isStreaming)
  ) {
    sessionStore.saveCurrentSession()
  }
}

// ==================== 生命周期 ====================
onMounted(async () => {
  window.api.logger.info('[ChatPage] 组件挂载，初始化聊天页面')

  // 设置流式监听器
  chatStreamStore.setupStreamListener(handleStreamEvent)

  // 加载会话列表
  await sessionStore.loadSessionList()

  // 如果有上次访问的会话，恢复它
  if (uiStateStore.lastChatSessionId) {
    const restored = await sessionStore.restoreStateAfterReturn(uiStateStore.lastChatSessionId)
    if (restored) {
      window.api.logger.info('[ChatPage] 恢复上次会话成功', {
        sessionId: uiStateStore.lastChatSessionId
      })
    }
  }
})

onUnmounted(() => {
  window.api.logger.info('[ChatPage] 组件卸载，清理资源')

  // 在离开聊天页面前保存状态
  if (currentChatId.value) {
    sessionStore.saveCurrentStateBeforeLeave()
    uiStateStore.updateLastChatSessionId(currentChatId.value)
  }

  // 清理流式监听器
  chatStreamStore.cleanupStreamListener()
})

// ==================== 监听当前会话变化 ====================
watch(
  () => currentChatId.value,
  (newSessionId, oldSessionId) => {
    window.api.logger.debug('[ChatPage] 当前会话变化', {
      from: oldSessionId,
      to: newSessionId
    })
  }
)
</script>

<template>
  <div class="chat-page sm-workspace-view">
    <MainContent
      :key="currentChatId || 'no-chat'"
      :current-chat-id="currentChatId"
      :messages="messages"
      :is-sending="isSending"
      :current-model-name="currentModel"
      :config-update-key="0"
      :input-message="currentInputState.inputMessage"
      :selected-model="currentInputState.selectedModel"
      :selected-m-c-p-tools="currentInputState.selectedMCPTools"
      :selected-knowledge-bases="currentInputState.selectedKnowledgeBases"
      :enable-sandbox-tools="currentInputState.enableSandboxTools"
      :session-id="currentSession?.sessionId"
      @send-message="handleSendMessage"
      @stop-request="handleStopRequest"
      @update:input-message="handleUpdateInputMessage"
      @update:selected-model="handleUpdateSelectedModel"
      @update:selected-m-c-p-tools="handleUpdateSelectedTools"
      @update:selected-knowledge-bases="handleUpdateSelectedKnowledgeBases"
      @update:enable-sandbox-tools="handleUpdateEnableSandboxTools"
    />

    <!-- 聊天错误提示(临时显示) -->
    <ChatErrorToast :show="showChatError" :message="chatErrorMessage" @close="closeChatError" />
  </div>
</template>

<style scoped>
.chat-page {
  position: relative;
  overflow: visible;
}
:deep(.sm-chat-stage__scroll) {
  padding-top: calc(var(--sm-titlebar-height) + var(--sm-space-3) + var(--sm-space-6));
}

:deep(.sm-chat-stage) {
  position: relative;
  overflow: hidden;
  isolation: isolate;
}
</style>
