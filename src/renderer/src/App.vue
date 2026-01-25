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
 * ReAct 步骤
 */
interface ReActStep {
  type: 'tool_call' | 'tool_result'
  toolCall?: ToolCallInfo
  toolResult?: ToolResultInfo
  timestamp: string
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
  modelName?: string // 模型名称（仅 assistant 消息）
  reactSteps?: ReActStep[] // ReAct 推理步骤
}

/**
 * 会话消息（用于持久化）
 */
interface SessionMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  reasoning?: string
  timestamp: string
  modelName?: string
  usage?: TokenUsage
}

/**
 * 会话数据
 */
interface SessionData {
  sessionId: string
  title: string
  createdAt: string
  updatedAt: string
  messages: SessionMessage[]
}

/**
 * 会话列表项
 */
interface SessionListItem {
  sessionId: string
  title: string
  lastMessage?: string
  updatedAt: string
}

/**
 * 聊天消息（用于发送给后端）
 */
interface ChatMessage {
  role: 'system' | 'user' | 'assistant'
  content: string
}

/**
 * MCP 工具接口
 */
interface MCPTool {
  name: string
  description: string
  inputSchema: Record<string, unknown>
  serverName: string
}

/**
 * MCP 工具引用（用于发送给后端）
 */
interface MCPToolReference {
  serverName: string
  toolName: string
  description: string
  inputSchema: Record<string, unknown>
}

/**
 * 工具调用信息
 */
interface ToolCallInfo {
  id: string
  name: string
  serverName: string
  arguments: Record<string, unknown>
}

/**
 * 工具结果信息
 */
interface ToolResultInfo {
  id: string
  name: string
  success: boolean
  result?: unknown
  error?: string
}

/**
 * 流式事件
 */
interface StreamEvent {
  type: 'content' | 'reasoning' | 'tool_call' | 'tool_result' | 'done' | 'error'
  sessionId?: string
  content?: string
  usage?: TokenUsage
  error?: string
  toolCall?: ToolCallInfo
  toolResult?: ToolResultInfo
}

// 配置加载错误信息
const configError = ref<string | null>(null)
// 是否显示错误提示
const showError = ref(false)

// 侧边栏是否折叠
const sidebarCollapsed = ref(false)

// 当前会话数据
const currentSession = ref<SessionData | null>(null)

// 当前对话ID（兼容旧代码）
const currentChatId = ref<string | undefined>(undefined)

// 当前对话的消息列表
const messages = ref<Message[]>([])

// 会话列表
const sessionList = ref<SessionListItem[]>([])

// 是否正在发送消息
const isSending = ref(false)

// 当前选择的模型
const currentModel = ref('')

// 流式监听器清理函数
let cleanupStreamListener: (() => void) | null = null

// 会话列表更新计数器（用于触发 Sidebar 更新）
const sessionUpdateKey = ref(0)

// 会话消息状态缓存（用于处理多会话并发流式响应）
const sessionMessagesCache = new Map<string, Message[]>()

// 会话标题缓存（用于保存内存中更新但尚未持久化的标题）
const sessionTitleCache = new Map<string, string>()

// 发送前的消息快照（用于错误回滚）
let messagesSnapshot: Message[] | null = null

// 当前正在流式响应的会话ID
let streamingSessionId: string | null = null

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
 * 加载会话列表
 */
async function loadSessionList(): Promise<void> {
  try {
    sessionList.value = await window.api.session.list()
  } catch (error) {
    window.api.logger.error('加载会话列表失败', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * 刷新会话列表
 */
async function refreshSessionList(): Promise<void> {
  await loadSessionList()
  sessionUpdateKey.value++
}

/**
 * 将 SessionMessage 转换为 Message
 */
function sessionMessageToMessage(msg: SessionMessage): Message {
  return {
    id: msg.id,
    role: msg.role as 'user' | 'assistant',
    content: msg.content,
    reasoning: msg.reasoning,
    timestamp: msg.timestamp,
    modelName: msg.modelName,
    usage: msg.usage,
    isStreaming: false
  }
}

/**
 * 保存当前会话
 */
async function saveCurrentSession(): Promise<void> {
  if (!currentSession.value) {
    return
  }

  try {
    // 创建一个纯净的数据对象（不包含 Vue 响应式代理）
    const sessionToSave: SessionData = {
      sessionId: currentSession.value.sessionId,
      title: currentSession.value.title,
      createdAt: currentSession.value.createdAt,
      updatedAt: new Date().toISOString(),
      messages: messages.value.map((msg) => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        reasoning: msg.reasoning,
        timestamp: msg.timestamp || new Date().toISOString(),
        modelName: msg.modelName,
        usage: msg.usage
          ? {
              prompt_tokens: msg.usage.prompt_tokens,
              completion_tokens: msg.usage.completion_tokens,
              total_tokens: msg.usage.total_tokens,
              reasoning_tokens: msg.usage.reasoning_tokens
            }
          : undefined
      }))
    }

    const result = await window.api.session.save(sessionToSave)
    if (!result.success) {
      window.api.logger.error('保存会话失败', { error: result.error })
    } else {
      // 更新本地会话数据
      currentSession.value.messages = sessionToSave.messages
      currentSession.value.updatedAt = sessionToSave.updatedAt
      // 刷新会话列表
      await refreshSessionList()
    }
  } catch (error) {
    window.api.logger.error('保存会话异常', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * 生成会话标题
 */
function generateTitle(content: string): string {
  const trimmed = content.trim()
  if (trimmed.length <= 20) {
    return trimmed || '新对话'
  }
  return trimmed.substring(0, 20) + '...'
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
  const targetSessionId = event.sessionId
  const currentSessionId = currentSession.value?.sessionId

  // 如果事件没有 sessionId，尝试使用当前正在流式响应的会话ID
  const effectiveSessionId = targetSessionId || streamingSessionId

  // 判断是否是当前会话的事件
  const isCurrentSession = effectiveSessionId === currentSessionId

  // 获取目标消息列表（当前会话或缓存）
  let targetMessages: Message[]
  if (isCurrentSession) {
    targetMessages = messages.value
  } else if (effectiveSessionId) {
    // 非当前会话：从缓存获取或初始化
    if (!sessionMessagesCache.has(effectiveSessionId)) {
      sessionMessagesCache.set(effectiveSessionId, [])
    }
    targetMessages = sessionMessagesCache.get(effectiveSessionId)!
  } else {
    // 无法确定目标会话，使用当前消息
    targetMessages = messages.value
  }

  // 找到正在流式输出的消息
  const streamingMessage = targetMessages.find((msg) => msg.isStreaming)

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

    case 'tool_call':
      if (streamingMessage && event.toolCall) {
        // 初始化 reactSteps 数组
        if (!streamingMessage.reactSteps) {
          streamingMessage.reactSteps = []
        }
        // 添加工具调用步骤
        streamingMessage.reactSteps.push({
          type: 'tool_call',
          toolCall: event.toolCall,
          timestamp: new Date().toISOString()
        })
      }
      break

    case 'tool_result':
      if (streamingMessage && event.toolResult) {
        // 初始化 reactSteps 数组
        if (!streamingMessage.reactSteps) {
          streamingMessage.reactSteps = []
        }
        // 添加工具结果步骤
        streamingMessage.reactSteps.push({
          type: 'tool_result',
          toolResult: event.toolResult,
          timestamp: new Date().toISOString()
        })
      }
      break

    case 'done':
      if (streamingMessage) {
        streamingMessage.isStreaming = false
        if (event.usage) {
          streamingMessage.usage = event.usage
        }
      }
      // 只有当前会话才更新 isSending 状态和保存
      if (isCurrentSession) {
        isSending.value = false
        // 清空快照，成功完成后保存会话
        messagesSnapshot = null
        streamingSessionId = null
        saveCurrentSession()
      } else if (effectiveSessionId) {
        // 非当前会话：清除 streamingSessionId（如果匹配）
        if (streamingSessionId === effectiveSessionId) {
          streamingSessionId = null
        }
        // 同步更新缓存中的消息状态（确保 isStreaming 被正确设置为 false）
        const cachedMsgs = sessionMessagesCache.get(effectiveSessionId)
        if (cachedMsgs) {
          const cachedStreamingMsg = cachedMsgs.find((msg) => msg.isStreaming)
          if (cachedStreamingMsg) {
            cachedStreamingMsg.isStreaming = false
            if (event.usage) {
              cachedStreamingMsg.usage = event.usage
            }
          }
        }
        // 更新缓存并保存该会话
        saveSessionFromCache(effectiveSessionId)
      }
      break

    case 'error':
      if (isCurrentSession) {
        // 当前会话发生错误：回滚到发送前状态
        if (messagesSnapshot) {
          messages.value = messagesSnapshot
          messagesSnapshot = null
        } else if (streamingMessage) {
          // 如果没有快照，标记消息为错误状态
          streamingMessage.isStreaming = false
          streamingMessage.content += `\n\n[错误: ${event.error}]`
        }
        isSending.value = false
        streamingSessionId = null
        window.api.logger.error('聊天错误', { error: event.error, sessionId: currentSessionId })
        // 错误回滚后保存会话，确保用户切换会话后能恢复之前的消息
        saveCurrentSession()
      } else if (effectiveSessionId) {
        // 非当前会话发生错误：清除 streamingSessionId（如果匹配）
        if (streamingSessionId === effectiveSessionId) {
          streamingSessionId = null
        }
        // 从缓存中移除（不保存错误状态）
        sessionMessagesCache.delete(effectiveSessionId)
        window.api.logger.error('聊天错误（后台会话）', {
          error: event.error,
          sessionId: effectiveSessionId
        })
      }
      break
  }
}

/**
 * 保存缓存中的会话
 */
async function saveSessionFromCache(sessionId: string): Promise<void> {
  const cachedMessages = sessionMessagesCache.get(sessionId)
  if (!cachedMessages || cachedMessages.length === 0) {
    return
  }

  try {
    // 加载会话数据
    const session = await window.api.session.load(sessionId)
    if (session) {
      // 使用缓存的标题（如果有的话），否则使用文件中的标题
      const cachedTitle = sessionTitleCache.get(sessionId)
      const titleToUse = cachedTitle || session.title

      // 更新会话消息和标题
      const sessionToSave: SessionData = {
        sessionId: session.sessionId,
        title: titleToUse,
        createdAt: session.createdAt,
        updatedAt: new Date().toISOString(),
        messages: cachedMessages.map((msg) => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
          reasoning: msg.reasoning,
          timestamp: msg.timestamp || new Date().toISOString(),
          modelName: msg.modelName,
          usage: msg.usage
            ? {
                prompt_tokens: msg.usage.prompt_tokens,
                completion_tokens: msg.usage.completion_tokens,
                total_tokens: msg.usage.total_tokens,
                reasoning_tokens: msg.usage.reasoning_tokens
              }
            : undefined
        }))
      }

      const result = await window.api.session.save(sessionToSave)
      if (!result.success) {
        window.api.logger.error('保存后台会话失败', { error: result.error, sessionId })
      }
    }
  } catch (error) {
    window.api.logger.error('保存后台会话异常', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    })
  } finally {
    // 清理缓存
    sessionMessagesCache.delete(sessionId)
    sessionTitleCache.delete(sessionId)
    // 刷新会话列表
    await refreshSessionList()
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
async function handleNewChat(): Promise<void> {
  try {
    // 创建新会话
    const session = await window.api.session.create()
    currentSession.value = session
    currentChatId.value = session.sessionId
    messages.value = []

    // 刷新会话列表
    await refreshSessionList()
  } catch (error) {
    window.api.logger.error('创建会话失败', {
      error: error instanceof Error ? error.message : String(error)
    })
    // 降级处理：仅在本地创建
    const newChatId = `chat-${Date.now()}`
    currentChatId.value = newChatId
    messages.value = []
  }
}

/**
 * 选择对话
 */
async function handleSelectChat(sessionId: string): Promise<void> {
  // 如果选择的是当前会话，直接返回
  if (currentSession.value?.sessionId === sessionId) {
    return
  }

  try {
    // 如果当前会话有流式响应正在进行，将消息状态和标题保存到缓存
    const currentSessionId = currentSession.value?.sessionId
    if (currentSessionId && isSending.value) {
      // 深拷贝消息，避免引用问题
      const messagesToCache = messages.value.map((msg) => ({ ...msg }))
      sessionMessagesCache.set(currentSessionId, messagesToCache)
      // 保存当前会话标题到缓存（可能已被更新但尚未持久化）
      if (currentSession.value?.title) {
        sessionTitleCache.set(currentSessionId, currentSession.value.title)
      }
      window.api.logger.debug('切换会话：保存流式状态到缓存', {
        sessionId: currentSessionId,
        title: currentSession.value?.title
      })
    }

    // 用于跟踪新会话的发送状态
    let newSessionIsSending = false

    // 检查目标会话是否有缓存的消息（之前切换走时保存的）
    const cachedMessages = sessionMessagesCache.get(sessionId)
    const cachedTitle = sessionTitleCache.get(sessionId)

    if (cachedMessages && cachedMessages.length > 0) {
      // 使用缓存的消息（可能包含流式响应状态）
      const session = await window.api.session.load(sessionId)
      if (session) {
        currentSession.value = session
        currentChatId.value = session.sessionId
        // 恢复缓存的标题（如果有的话）
        if (cachedTitle) {
          currentSession.value.title = cachedTitle
        }
        // 深拷贝缓存的消息，避免引用问题
        messages.value = cachedMessages.map((msg) => ({ ...msg }))
        // 检查是否有正在流式输出的消息
        newSessionIsSending = messages.value.some((msg) => msg.isStreaming)
        window.api.logger.debug('切换会话：恢复缓存的流式状态', {
          sessionId,
          hasStreaming: newSessionIsSending,
          title: currentSession.value.title
        })
      }
    } else {
      // 正常加载会话数据
      const session = await window.api.session.load(sessionId)
      if (session) {
        currentSession.value = session
        currentChatId.value = session.sessionId
        // 转换消息格式（从文件加载的消息不会有 isStreaming）
        messages.value = session.messages.map(sessionMessageToMessage)
        newSessionIsSending = false
      } else {
        window.api.logger.warn('会话不存在', { sessionId })
      }
    }

    // 更新 isSending 状态为新会话的状态
    isSending.value = newSessionIsSending
  } catch (error) {
    window.api.logger.error('加载会话失败', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}

/**
 * 删除会话
 */
async function handleDeleteSession(sessionId: string): Promise<void> {
  try {
    const result = await window.api.session.delete(sessionId)
    if (result.success) {
      // 如果删除的是当前会话，清空当前状态
      if (currentSession.value?.sessionId === sessionId) {
        currentSession.value = null
        currentChatId.value = undefined
        messages.value = []
      }
      // 刷新会话列表
      await refreshSessionList()
    } else {
      window.api.logger.error('删除会话失败', { error: result.error })
    }
  } catch (error) {
    window.api.logger.error('删除会话异常', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
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
 * 将 MCPTool 转换为 MCPToolReference
 * 注意：需要深拷贝 inputSchema 以确保可以通过 IPC 传输
 */
function convertToToolReferences(tools: MCPTool[]): MCPToolReference[] {
  return tools.map((tool) => ({
    serverName: tool.serverName,
    toolName: tool.name,
    description: tool.description || '',
    // 使用 JSON 序列化/反序列化来确保对象可克隆
    inputSchema: JSON.parse(JSON.stringify(tool.inputSchema || {}))
  }))
}

/**
 * 发送消息
 */
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
    await handleNewChat()
  }

  // 确保当前会话存在
  if (!currentSession.value) {
    window.api.logger.error('创建会话失败，无法发送消息')
    return
  }

  const sessionId = currentSession.value.sessionId

  // 保存发送前的消息快照（用于错误回滚）
  messagesSnapshot = JSON.parse(JSON.stringify(messages.value))

  // 记录当前正在流式响应的会话ID
  streamingSessionId = sessionId

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
    modelName: model, // 记录使用的模型名称
    reactSteps: [] // 初始化 ReAct 步骤
  }
  messages.value.push(assistantMessage)

  // 设置发送状态
  isSending.value = true

  // 如果是第一条消息，更新会话标题
  if (isFirstMessage && currentSession.value) {
    currentSession.value.title = generateTitle(content)
  }

  try {
    // 构建消息历史
    const chatMessages = buildChatMessages()
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
    if (messagesSnapshot) {
      messages.value = messagesSnapshot
      messagesSnapshot = null
    } else {
      // 如果没有快照，标记消息为错误状态
      assistantMessage.isStreaming = false
      assistantMessage.content = `[发送失败: ${errorMessage}]`
    }
    isSending.value = false
    streamingSessionId = null
    // 发生异常时不保存会话
  }
}

/**
 * 中止当前请求
 */
async function handleStopRequest(): Promise<void> {
  const sessionId = currentSession.value?.sessionId
  try {
    await window.api.chat.stop(sessionId)
  } catch (error) {
    window.api.logger.error('中止请求失败', {
      error: error instanceof Error ? error.message : String(error),
      sessionId
    })
  }
}

onMounted(() => {
  loadConfigStatus()
  setupStreamListener()
  loadSessionList()
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
