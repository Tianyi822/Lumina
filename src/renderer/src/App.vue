<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import Sidebar from './components/Sidebar.vue'
import MainContent from './components/MainContent.vue'

/**
 * Token 使用统计
 */
interface TokenUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  reasoning_tokens?: number
}

/**
 * 消息接口
 */
interface Message {
  id: string
  role: 'user' | 'assistant'
  content: string
  reasoning?: string
  isStreaming?: boolean
  usage?: TokenUsage
  timestamp?: string
}

/**
 * 聊天消息（用于发送给后端）
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * 流式事件
 */
interface StreamEvent {
  type: 'content' | 'reasoning' | 'done' | 'error'
  content?: string
  usage?: TokenUsage
  error?: string
}

// 配置加载错误信息
const configError = ref<string | null>(null)
// 是否显示错误提示
const showError = ref(false)

// 侧边栏是否折叠
const sidebarCollapsed = ref(false)

// 当前对话ID
const currentChatId = ref<string | undefined>(undefined)

// 当前对话的消息列表
const messages = ref<Message[]>([])

// 是否正在发送消息
const isSending = ref(false)

// 当前选择的模型
const currentModel = ref('')

// 是否启用思考模式
const enableThinking = ref(false)

// 流式监听器清理函数
let cleanupStreamListener: (() => void) | null = null

/**
 * 加载配置状态
 * 只有在配置加载失败（如格式错误、权限问题等）时才显示错误
 */
async function loadConfigStatus(): Promise<void> {
  try {
    const status = await window.api.config.getStatus()

    // 只有在配置加载失败时才显示错误（配置不存在时会自动创建，不需要提示）
    if (!status.success && status.error) {
      configError.value = status.error
      showError.value = true
    }
  } catch (error) {
    configError.value = `无法获取配置状态: ${error instanceof Error ? error.message : String(error)}`
    showError.value = true
  }
}

/**
 * 设置流式响应监听器
 */
function setupStreamListener(): void {
  cleanupStreamListener = window.api.chat.onStream((event: StreamEvent) => {
    handleStreamEvent(event)
  })
}

/**
 * 处理流式事件
 */
function handleStreamEvent(event: StreamEvent): void {
  // 找到正在流式输出的消息
  const streamingMessage = messages.value.find((msg) => msg.isStreaming)

  switch (event.type) {
    case 'content':
      if (streamingMessage && event.content) {
        streamingMessage.content += event.content
      }
      break

    case 'reasoning':
      if (streamingMessage && event.content) {
        streamingMessage.reasoning = (streamingMessage.reasoning || '') + event.content
      }
      break

    case 'done':
      if (streamingMessage) {
        streamingMessage.isStreaming = false
        if (event.usage) {
          streamingMessage.usage = event.usage
        }
      }
      isSending.value = false
      break

    case 'error':
      if (streamingMessage) {
        streamingMessage.isStreaming = false
        streamingMessage.content += `\n\n[错误: ${event.error}]`
      }
      isSending.value = false
      window.api.logger.error('聊天错误', { error: event.error })
      break
  }
}

/**
 * 关闭错误提示
 */
function dismissError(): void {
  showError.value = false
}

/**
 * 切换侧边栏折叠状态
 */
function toggleSidebar(): void {
  sidebarCollapsed.value = !sidebarCollapsed.value
}

/**
 * 创建新对话
 */
function handleNewChat(): void {
  const newChatId = `chat-${Date.now()}`
  currentChatId.value = newChatId
  messages.value = []
}

/**
 * 选择对话
 */
function handleSelectChat(chatId: string): void {
  currentChatId.value = chatId
  // TODO: 加载对应对话的消息
  messages.value = []
}

/**
 * 构建发送给后端的消息历史
 */
function buildChatMessages(): ChatMessage[] {
  return messages.value.map((msg) => ({
    role: msg.role as 'user' | 'assistant',
    content: msg.content
  }))
}

/**
 * 发送消息
 */
async function handleSendMessage(content: string, model: string, thinking: boolean): Promise<void> {
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
  if (!currentChatId.value) {
    handleNewChat()
  }

  // 更新当前模型和思考模式状态
  currentModel.value = model
  enableThinking.value = thinking

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
    timestamp: new Date().toISOString()
  }
  messages.value.push(assistantMessage)

  // 设置发送状态
  isSending.value = true

  try {
    // 构建消息历史
    const chatMessages = buildChatMessages()
    // 移除最后一个空的助手消息
    chatMessages.pop()

    // 发送请求
    const result = await window.api.chat.send({
      messages: chatMessages,
      modelKey: model,
      enableThinking: thinking
    })

    if (!result.success && result.error) {
      window.api.logger.error('发送消息失败', { error: result.error })
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    window.api.logger.error('发送消息异常', { error: errorMessage })

    // 更新消息状态
    assistantMessage.isStreaming = false
    assistantMessage.content = `[发送失败: ${errorMessage}]`
    isSending.value = false
  }
}

/**
 * 中止当前请求
 */
async function handleStopRequest(): Promise<void> {
  try {
    await window.api.chat.stop()
  } catch (error) {
    window.api.logger.error('中止请求失败', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

onMounted(() => {
  loadConfigStatus()
  setupStreamListener()
})

onUnmounted(() => {
  // 清理流式监听器
  if (cleanupStreamListener) {
    cleanupStreamListener()
    cleanupStreamListener = null
  }
})
</script>

<template>
  <div class="app-container">
    <!-- 配置加载错误提示（仅在加载失败时显示） -->
    <div v-if="showError" class="error-banner">
      <div class="error-content">
        <span class="error-icon">⚠️</span>
        <span class="error-message">{{ configError }}</span>
        <button class="error-dismiss" @click="dismissError">×</button>
      </div>
    </div>

    <!-- 主布局 -->
    <div class="app-layout">
      <!-- 侧边栏 -->
      <Sidebar
        v-show="!sidebarCollapsed"
        @new-chat="handleNewChat"
        @select-chat="handleSelectChat"
      />

      <!-- 主内容区 -->
      <MainContent
        :sidebar-collapsed="sidebarCollapsed"
        :current-chat-id="currentChatId"
        :messages="messages"
        :is-sending="isSending"
        @toggle-sidebar="toggleSidebar"
        @send-message="handleSendMessage"
        @stop-request="handleStopRequest"
      />
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

/* 错误提示样式 */
.error-banner {
  background-color: rgba(248, 81, 73, 0.1);
  border-bottom: 1px solid var(--theme-danger);
  padding: 12px 16px;
  flex-shrink: 0;
}

.error-content {
  display: flex;
  align-items: center;
  gap: 12px;
  max-width: 1200px;
  margin: 0 auto;
}

.error-icon {
  font-size: 18px;
  flex-shrink: 0;
}

.error-message {
  flex: 1;
  color: var(--theme-danger);
  font-size: 14px;
  line-height: 1.5;
}

.error-dismiss {
  background: none;
  border: none;
  font-size: 20px;
  color: var(--theme-danger);
  cursor: pointer;
  padding: 0 4px;
  line-height: 1;
  opacity: 0.7;
  transition: opacity 0.2s;
  font-family: var(--theme-font);
}

.error-dismiss:hover {
  opacity: 1;
}

/* 主布局 */
.app-layout {
  flex: 1;
  display: flex;
  overflow: hidden;
}
</style>
