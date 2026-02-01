import type { Ref } from 'vue'
import type { Message, MCPTool } from '../../types'
import { generateTitle, convertToToolReferences } from '../../utils/sessionHelpers'
import { buildChatMessages } from '../../utils/messageHelpers'
import type { SessionInputState } from '../input/useInputState'
import { DEFAULT_NEW_CHAT_TITLE } from '../../constants'
import { deepClone } from '@shared/utils'

/**
 * 会话操作接口
 */
interface SessionActions {
  currentSession: Ref<
    ReturnType<(typeof import('../session/useSession'))['useSession']>['currentSession']['value']
  >
  currentChatId: Ref<
    ReturnType<(typeof import('../session/useSession'))['useSession']>['currentChatId']['value']
  >
  messages: Ref<Message[]>
  createSession: (beforeCreate?: () => Promise<void>, newTitle?: string) => Promise<void>
  updateSessionTitle: (title: string) => void
  updateSessionDescription: (description: string) => void
  clearInputMessage: () => void
}

/**
 * 聊天流接口
 */
interface ChatStream {
  setStreamingSessionId: (sessionId: string | null) => void
  setMessagesSnapshot: (snapshot: Message[] | null) => void
  getSessionSendingState: (sessionId: string) => boolean
  setSessionSendingState: (sessionId: string, state: boolean) => void
}

/**
 * 发送消息函数类型
 */
type HandleSendMessage = (
  content: string,
  model: string,
  selectedTools?: MCPTool[]
) => Promise<void>

/**
 * 聊天消息 Composable
 * 封装消息发送逻辑
 */
export function useChatMessage(
  sessionActions: SessionActions,
  chatStream: ChatStream,
  currentModel: Ref<string>,
  currentInputState: Ref<SessionInputState>,
  handleChatError: (error: string) => void
): { handleSendMessage: HandleSendMessage } {
  const {
    currentSession,
    currentChatId,
    messages,
    createSession,
    updateSessionTitle,
    clearInputMessage
  } = sessionActions
  const {
    setStreamingSessionId,
    setMessagesSnapshot,
    getSessionSendingState,
    setSessionSendingState
  } = chatStream

  /**
   * 发送消息
   */
  async function handleSendMessage(
    content: string,
    model: string,
    selectedTools: MCPTool[] = []
  ): Promise<void> {
    // 如果没有当前对话，先创建一个（设置默认标题为"新对话"）
    if (!currentChatId.value || !currentSession.value) {
      await createSession(undefined, DEFAULT_NEW_CHAT_TITLE)
    }

    // 确保当前会话存在
    if (!currentSession.value) {
      window.api.logger.error('创建会话失败，无法发送消息')
      return
    }

    const sessionId = currentSession.value.sessionId

    // 检查当前会话是否正在发送
    if (getSessionSendingState(sessionId)) {
      window.api.logger.warn('当前会话正在发送消息，忽略重复请求', { sessionId })
      return
    }

    // 如果没有选择模型，显示错误
    if (!model) {
      handleChatError('请先选择一个模型')
      return
    }

    // 保存发送前的消息快照（用于错误回滚）
    const messagesSnapshot = deepClone(messages.value)

    // 记录当前正在流式响应的会话ID
    setStreamingSessionId(sessionId)
    setMessagesSnapshot(messagesSnapshot)

    // 更新当前模型
    currentModel.value = model
    currentInputState.value.selectedModel = model

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
    setSessionSendingState(sessionId, true)

    // 如果是第一条消息，更新会话标题
    if (isFirstMessage && currentSession.value) {
      updateSessionTitle(generateTitle(content))
    }

    try {
      // 构建消息历史（排除最后一个空的助手占位符）
      const chatMessages = buildChatMessages(messages.value.slice(0, -1))

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
      } else {
        // 发送成功后，清空输入消息
        clearInputMessage()
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      window.api.logger.error('发送消息异常', { error: errorMessage, sessionId })

      // 发生异常时回滚到发送前状态
      messages.value = messagesSnapshot
      setSessionSendingState(sessionId, false)
      setStreamingSessionId(null)
    }
  }

  return {
    handleSendMessage
  }
}
