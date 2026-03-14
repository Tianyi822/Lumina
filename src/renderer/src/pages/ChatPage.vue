<script setup lang="ts">
import { onMounted, onUnmounted, watch, computed, ref, toRaw } from 'vue'
import { storeToRefs } from 'pinia'
import type {
  MCPTool,
  SessionType,
  KnowledgeBase,
  StreamEvent,
  ChatMessage,
  ExportFormat,
  Message,
  UserInteractionRequest,
  AttachedDocument,
  AttachedImage
} from '@renderer/types'
import Sidebar from '@renderer/components/Sidebar.vue'
import MainContent from '@renderer/components/MainContent.vue'
import ChatErrorToast from '@renderer/components/ChatErrorToast.vue'
import MessageExportDialog from '@renderer/components/chat/MessageExportDialog.vue'
import PptExportConfigDialog from '@renderer/components/chat/PptExportConfigDialog.vue'
import {
  createExportInteractionInfo,
  findLatestExportableAssistantMessage,
  isExportIntent,
  isExportableAssistantMessage,
  parseExportFormat
} from '@renderer/utils/messageExport'

// Stores
import {
  useSessionStore,
  useChatStreamStore,
  useInputStateStore,
  useUIStateStore
} from '@renderer/stores'

// ==================== Props & Emits ====================
defineEmits<{
  (e: 'open-settings'): void
}>()

// ==================== Stores ====================
const sessionStore = useSessionStore()
const chatStreamStore = useChatStreamStore()
const inputStateStore = useInputStateStore()
const uiStateStore = useUIStateStore()

// 使用 storeToRefs 保持响应式连接（关键：确保数组内部变化能触发 UI 更新）
const { currentChatId, messages, sessionList, sessionUpdateKey, currentSession } =
  storeToRefs(sessionStore)
const { isSending } = storeToRefs(chatStreamStore)
const { sidebarCollapsed, currentModel } = storeToRefs(uiStateStore)

// 聊天错误状态
const { showChatError, chatError } = storeToRefs(uiStateStore)

// computed 用于派生状态
const currentInputState = computed(() => inputStateStore.currentInputState)

// 导出相关状态
const pendingExportMessageId = ref<string | null>(null)
const exportDialogMessageId = ref<string | null>(null)
const exportingMessageId = ref<string | null>(null)
const pptConfigMessageId = ref<string | null>(null)

// 聊天错误消息（兼容旧命名）
const chatErrorMessage = computed(() => chatError.value ?? '')

const exportInteractionInfo = computed<UserInteractionRequest | null>(() => {
  const targetMessage = getPendingExportTarget()
  return targetMessage ? createExportInteractionInfo() : null
})

const exportDialogMessage = computed<Message | null>(() => {
  if (!exportDialogMessageId.value) return null

  const targetMessage = messages.value.find((message) => message.id === exportDialogMessageId.value)
  return isExportableAssistantMessage(targetMessage) ? targetMessage : null
})

const pptConfigMessage = computed<Message | null>(() => {
  if (!pptConfigMessageId.value) return null

  const targetMessage = messages.value.find((message) => message.id === pptConfigMessageId.value)
  return isExportableAssistantMessage(targetMessage) ? targetMessage : null
})

// 聊天错误处理
function handleChatError(error: string): void {
  uiStateStore.handleChatError(error)
}

function closeChatError(): void {
  uiStateStore.closeChatError()
}

function createLocalMessageId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

function clearExportState(): void {
  pendingExportMessageId.value = null
  exportDialogMessageId.value = null
  pptConfigMessageId.value = null
}

function closeExportDialog(): void {
  exportDialogMessageId.value = null
}

function closePptConfigDialog(): void {
  pptConfigMessageId.value = null
}

/**
 * 处理打开 PPT 导出配置对话框
 */
function handleOpenPptConfig(): void {
  const targetMessage = exportDialogMessage.value
  if (!targetMessage) {
    closeExportDialog()
    handleChatError('当前没有可导出的 AI 助手消息')
    return
  }

  // 关闭导出对话框，打开 PPT 配置对话框
  pptConfigMessageId.value = targetMessage.id
  exportDialogMessageId.value = null
}

function getPendingExportTarget(): Message | null {
  if (!pendingExportMessageId.value) return null

  const targetMessage = messages.value.find(
    (message) => message.id === pendingExportMessageId.value
  )
  return isExportableAssistantMessage(targetMessage) ? targetMessage : null
}

function appendLocalUserMessage(content: string): void {
  sessionStore.addMessage({
    id: createLocalMessageId(),
    role: 'user',
    content,
    timestamp: new Date().toISOString()
  })
}

function triggerBrowserDownload(result: {
  data?: number[]
  fileName?: string
  mimeType?: string
}): void {
  if (!result.data || !result.fileName) {
    throw new Error('导出结果缺少文件内容')
  }

  const blob = new Blob([Uint8Array.from(result.data)], {
    type: result.mimeType || 'application/octet-stream'
  })
  const downloadUrl = URL.createObjectURL(blob)
  const anchor = document.createElement('a')

  anchor.href = downloadUrl
  anchor.download = result.fileName
  anchor.style.display = 'none'

  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)

  window.setTimeout(() => {
    URL.revokeObjectURL(downloadUrl)
  }, 1000)
}

async function exportAssistantMessage(message: Message, format: ExportFormat): Promise<void> {
  if (!isExportableAssistantMessage(message)) {
    handleChatError('当前消息内容不完整，暂时无法导出')
    return
  }

  clearExportState()
  exportingMessageId.value = message.id

  try {
    const result = await window.api.document.exportMessage({
      content: message.content,
      format,
      title: currentSession.value?.title,
      timestamp: message.timestamp,
      modelName: message.modelName
    })

    if (!result.success) {
      handleChatError(result.error || '导出失败')
      return
    }

    triggerBrowserDownload(result)

    window.api.logger.info('[ChatPage] 导出消息成功', {
      format,
      messageId: message.id,
      fileName: result.fileName
    })
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    window.api.logger.error('[ChatPage] 导出消息异常', {
      error: errorMessage,
      messageId: message.id,
      format
    })
    handleChatError(errorMessage)
  } finally {
    exportingMessageId.value = null
  }
}

async function handleInlineExportFormatSelect(format: ExportFormat): Promise<void> {
  const targetMessage = getPendingExportTarget()
  if (!targetMessage) {
    clearExportState()
    handleChatError('当前没有待导出的 AI 助手消息')
    return
  }

  await exportAssistantMessage(targetMessage, format)
}

async function handleDialogExportFormatSelect(format: ExportFormat): Promise<void> {
  const targetMessage = exportDialogMessage.value
  if (!targetMessage) {
    closeExportDialog()
    handleChatError('当前没有可导出的 AI 助手消息')
    return
  }

  await exportAssistantMessage(targetMessage, format)
}

function handleRequestExport(message: Message): void {
  if (exportingMessageId.value) {
    return
  }

  if (!isExportableAssistantMessage(message)) {
    handleChatError('当前消息内容尚未完成，暂时无法导出')
    return
  }

  pendingExportMessageId.value = null
  exportDialogMessageId.value = message.id
}

function handlePptExportToast(message: string, type: 'success' | 'error' | 'info' = 'info'): void {
  if (type === 'error') {
    handleChatError(message)
    return
  }

  window.api.logger.info('[ChatPage] PPT 导出提示', { type, message })
}

async function tryHandleExportIntent(content: string): Promise<boolean> {
  const trimmedContent = content.trim()
  const requestedFormat = parseExportFormat(trimmedContent)

  if (pendingExportMessageId.value) {
    const targetMessage = getPendingExportTarget()
    if (!targetMessage) {
      clearExportState()
      handleChatError('当前待导出的内容已不可用，请重新发起导出')
      return true
    }

    if (requestedFormat) {
      appendLocalUserMessage(trimmedContent)
      await sessionStore.saveCurrentSession()
      await exportAssistantMessage(targetMessage, requestedFormat)
      return true
    }

    if (isExportIntent(trimmedContent)) {
      appendLocalUserMessage(trimmedContent)
      await sessionStore.saveCurrentSession()
      return true
    }

    pendingExportMessageId.value = null
    return false
  }

  if (!isExportIntent(trimmedContent)) {
    return false
  }

  const targetMessage = findLatestExportableAssistantMessage(messages.value)
  if (!targetMessage) {
    handleChatError('当前没有可导出的 AI 助手消息')
    return true
  }

  appendLocalUserMessage(trimmedContent)
  await sessionStore.saveCurrentSession()

  if (requestedFormat) {
    await exportAssistantMessage(targetMessage, requestedFormat)
  } else {
    pendingExportMessageId.value = targetMessage.id
  }

  return true
}

async function clearInvalidSelectedPptTemplate(templateId: string): Promise<void> {
  inputStateStore.clearSelectedPptTemplate()

  if (currentChatId.value && currentSession.value) {
    await sessionStore.persistCurrentSelectionState()
  }

  window.api.logger.warn('[ChatPage] 已清除失效的 PPT 模板选择', {
    templateId
  })
}

async function validateSelectedPptTemplate(): Promise<void> {
  const selectedTemplate = currentInputState.value.selectedPptTemplate
  if (!selectedTemplate) {
    return
  }

  try {
    const result = await window.api.pptTemplate.getById(selectedTemplate.id)
    if (result.success && result.data?.status === 'completed') {
      return
    }

    await clearInvalidSelectedPptTemplate(selectedTemplate.id)
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    window.api.logger.warn('[ChatPage] 校验 PPT 模板选择失败，保留当前选择', {
      templateId: selectedTemplate.id,
      error: errorMessage
    })
  }
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

  if (await tryHandleExportIntent(trimmedContent)) {
    return
  }

  await validateSelectedPptTemplate()

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
    const selectedPptTemplate = currentInputState.value.selectedPptTemplate

    const result = await window.api.chat.send({
      messages: chatMessages,
      modelKey: model,
      sessionId,
      selectedTools: toolReferences,
      selectedKnowledgeBases: kbReferences,
      enableSandboxTools,
      selectedPptTemplate
    })

    if (!result.success && result.error) {
      window.api.logger.error('[ChatPage] 发送消息失败', { error: result.error, sessionId })
      handleChatError(result.error)
    } else {
      // 发送成功后，清空输入消息
      inputStateStore.clearInputMessage()
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

// ==================== 新聊天 ====================
async function handleNewChat(sessionType?: SessionType): Promise<void> {
  await sessionStore.handleNewChat(sessionType)

  // 新会话创建后重置发送状态（需要传入 isCurrentSession: true 来更新全局 isSending）
  const newSessionId = currentChatId.value
  if (newSessionId) {
    chatStreamStore.setSessionSendingState(newSessionId, false, true)
  }
}

// ==================== 会话选择 ====================
async function handleSelectChat(sessionId: string): Promise<void> {
  const isSending = await sessionStore.handleSelectChat(sessionId)
  chatStreamStore.setSessionSendingState(sessionId, isSending, true)
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
    clearExportState()

    window.api.logger.debug('[ChatPage] 当前会话变化', {
      from: oldSessionId,
      to: newSessionId
    })
  }
)
</script>

<template>
  <div class="chat-page">
    <!-- 侧边栏 -->
    <div class="sidebar-wrapper" :class="{ collapsed: sidebarCollapsed }">
      <Sidebar
        :sessions="sessionList"
        :active-session-id="currentChatId"
        :session-update-key="sessionUpdateKey"
        @new-chat="handleNewChat"
        @select-chat="handleSelectChat"
        @delete-session="sessionStore.handleDeleteSession"
      />
    </div>

    <!-- 主内容区 -->
    <!-- 使用 :key 绑定 currentChatId 确保切换会话时组件完全重新创建,实现状态隔离 -->
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
      :export-interaction-info="exportInteractionInfo"
      :exporting-message-id="exportingMessageId"
      @send-message="handleSendMessage"
      @stop-request="handleStopRequest"
      @update:input-message="handleUpdateInputMessage"
      @update:selected-model="handleUpdateSelectedModel"
      @update:selected-m-c-p-tools="handleUpdateSelectedTools"
      @update:selected-knowledge-bases="handleUpdateSelectedKnowledgeBases"
      @update:enable-sandbox-tools="handleUpdateEnableSandboxTools"
      @request-export="handleRequestExport"
      @select-export-format="handleInlineExportFormatSelect"
    />

    <!-- 聊天错误提示(临时显示) -->
    <ChatErrorToast :show="showChatError" :message="chatErrorMessage" @close="closeChatError" />

    <MessageExportDialog
      v-if="exportDialogMessage"
      :message="exportDialogMessage"
      :is-exporting="exportingMessageId === exportDialogMessage.id"
      @close="closeExportDialog"
      @select-format="handleDialogExportFormatSelect"
      @open-ppt-config="handleOpenPptConfig"
    />

    <PptExportConfigDialog
      v-if="pptConfigMessage"
      :visible="!!pptConfigMessage"
      :content="pptConfigMessage.content"
      :title="currentSession?.title"
      :initial-template-id="currentInputState.selectedPptTemplate?.id || ''"
      @close="closePptConfigDialog"
      @show-toast="handlePptExportToast"
      @exported="closePptConfigDialog"
    />
  </div>
</template>

<style scoped>
.chat-page {
  display: flex;
  width: 100%;
  height: 100%;
  overflow: hidden;
}

/* 侧边栏包装器 - 平滑过渡 */
.sidebar-wrapper {
  width: 280px;
  min-width: 280px;
  height: 100%;
  overflow: hidden;
  opacity: 1;
  transition:
    width 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    min-width 0.25s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.2s ease-out;
}

.sidebar-wrapper.collapsed {
  width: 0;
  min-width: 0;
  opacity: 0;
  pointer-events: none;
}
</style>
