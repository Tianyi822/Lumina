import { useCallback, useEffect, useMemo, useRef } from 'react'
import type { MutableRefObject } from 'react'
import type {
  AttachedDocument,
  AttachedImage,
  ChatMessage,
  KnowledgeBase,
  KnowledgeBaseReference,
  MCPTool,
  MCPToolReference,
  Message,
  SessionData,
  StreamEvent
} from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import { usePaperChatMessageCacheStore, usePaperChatStreamStore } from '@renderer/stores'
import { buildChatMessages } from '@renderer/utils/messageHelpers'
import { deepClone } from '@shared/utils'

interface UsePaperChatStreamReactOptions {
  session: SessionData | null
  paperId: string
  messagesRef: MutableRefObject<Message[]>
  setMessages: (messages: Message[]) => void
  selectedModel: string
  selectedMCPTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableLabTools: boolean
  enablePaperWebSearch: boolean
  saveCurrentSession: () => Promise<boolean>
  setError: (message: string) => void
  onRequestError?: (message: string) => void
}

interface UsePaperChatStreamReactReturn {
  isSending: boolean
  sendMessage: (
    content: string,
    attachedDocuments?: AttachedDocument[],
    attachedImages?: AttachedImage[],
    attachedQuotes?: PaperQuote[]
  ) => Promise<void>
  stopRequest: () => Promise<void>
}

/** 将选中的 MCP 工具列表转换为接口请求所需的引用格式 */
function toToolReferences(tools: MCPTool[]): MCPToolReference[] {
  return tools.map((tool) => ({
    serverName: tool.serverName,
    toolName: tool.name,
    description: tool.description || '',
    inputSchema: tool.inputSchema || {}
  }))
}

/** 将选中的知识库列表转换为接口请求所需的引用格式 */
function toKnowledgeReferences(knowledgeBases: KnowledgeBase[]): KnowledgeBaseReference[] {
  return knowledgeBases.map((kb) => ({
    id: kb.id,
    name: kb.name,
    description: kb.description || '',
    documentCount: kb.linkedFileIds?.length ?? kb.documentCount ?? 0
  }))
}

function toPlainRequest<T>(request: T): T {
  return deepClone(request)
}

/**
 * 论文对话流式请求的核心 Hook，管理消息发送、流式事件处理和保存，负责将 StreamEvent
 * 转换为 React 可消费的消息状态，支持 rAF 节流防止重渲染风暴
 */
export function usePaperChatStreamReact(
  options: UsePaperChatStreamReactOptions
): UsePaperChatStreamReactReturn {
  const { session, paperId, messagesRef, setMessages, saveCurrentSession, setError } = options

  const sessionId = session?.sessionId || ''
  const isSending = usePaperChatStreamStore((s) =>
    sessionId ? s.getSessionSendingState(sessionId) : false
  )

  const latestRef = useRef(options)
  latestRef.current = options

  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  const requestErrorReportedRef = useRef(false)
  // rAF 节流调度 ID，确保每帧最多执行一次 setMessages（高频流式事件时防止重渲染风暴）
  const rafIdRef = useRef<number | null>(null)

  const reportRequestError = useCallback((message: string): void => {
    if (requestErrorReportedRef.current) return
    requestErrorReportedRef.current = true
    latestRef.current.onRequestError?.(message)
  }, [])

  const handleStreamEvent = useCallback(
    (event: StreamEvent): void => {
      const current = latestRef.current
      const currentSessionId = sessionIdRef.current || null
      const streamStore = usePaperChatStreamStore.getState()
      const targetSessionId = event.sessionId || streamStore.streamingSessionId

      streamStore.handleStreamEvent(event, currentSessionId, current.messagesRef.current)

      if (!currentSessionId || targetSessionId !== currentSessionId) {
        return
      }

      // done/error 事件必须同步处理：取消 pending 的 rAF，立即更新消息列表并持久化
      if (event.type === 'done' || event.type === 'error') {
        if (rafIdRef.current !== null) {
          cancelAnimationFrame(rafIdRef.current)
          rafIdRef.current = null
        }
        if (event.type === 'error' && event.error) {
          reportRequestError(event.error)
        }

        const nextMessages = current.messagesRef.current.map((msg) => {
          if (!msg.isStreaming) return msg
          return {
            ...msg,
            reactIterations: msg.reactIterations ? [...msg.reactIterations] : msg.reactIterations,
            reactSteps: msg.reactSteps ? [...msg.reactSteps] : msg.reactSteps
          }
        })
        current.setMessages(nextMessages)
        usePaperChatMessageCacheStore
          .getState()
          .retainSessionMessages(currentSessionId, nextMessages, current.session?.title)

        void current.saveCurrentSession()
        return
      }

      // 使用 requestAnimationFrame 节流 setMessages 调用，避免高频 IPC 事件导致 React 重渲染风暴。
      // 快速模型每秒可触发数十上百次 stream 事件，逐次 setMessages 会造成严重卡顿。
      // rAF 确保每帧（~16ms）最多一次 setMessages，同时保证视觉更新不丢帧
      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          const latestCurrent = latestRef.current

          // 为流式消息创建新的对象引用及 reactIterations/reactSteps 数组引用，
          // 确保 PaperChatReActSteps 中的 useMemo 能检测到内容变化
          const nextMessages = latestCurrent.messagesRef.current.map((msg) => {
            if (!msg.isStreaming) return msg
            return {
              ...msg,
              reactIterations: msg.reactIterations ? [...msg.reactIterations] : msg.reactIterations,
              reactSteps: msg.reactSteps ? [...msg.reactSteps] : msg.reactSteps
            }
          })
          latestCurrent.setMessages(nextMessages)
          usePaperChatMessageCacheStore
            .getState()
            .retainSessionMessages(currentSessionId, nextMessages, latestCurrent.session?.title)
        })
      }
    },
    [reportRequestError]
  )

  const sendMessage = useCallback(
    async (
      content: string,
      attachedDocuments: AttachedDocument[] = [],
      attachedImages: AttachedImage[] = [],
      attachedQuotes: PaperQuote[] = []
    ): Promise<void> => {
      const targetSession = latestRef.current.session
      if (!targetSession) {
        setError('论文聊天会话未就绪')
        return
      }

      const currentSessionId = targetSession.sessionId
      const trimmedContent = content.trim()
      const hasAttachments =
        attachedDocuments.length > 0 || attachedImages.length > 0 || attachedQuotes.length > 0

      if (!trimmedContent && !hasAttachments) {
        return
      }

      const streamStore = usePaperChatStreamStore.getState()
      if (streamStore.getSessionSendingState(currentSessionId)) {
        return
      }

      const selected = latestRef.current
      if (!selected.selectedModel) {
        setError('请先选择一个模型')
        return
      }

      const messageCache = usePaperChatMessageCacheStore.getState()
      const retainedMessages = messageCache.retainSessionMessages(
        currentSessionId,
        messagesRef.current,
        targetSession.title
      )
      messagesRef.current = retainedMessages

      const snapshot = deepClone(retainedMessages)
      streamStore.saveMessagesSnapshot(currentSessionId, snapshot)
      usePaperChatStreamStore.setState({ streamingSessionId: currentSessionId })
      requestErrorReportedRef.current = false

      const now = Date.now()
      const userMessage: Message = {
        id: `msg-${now}`,
        role: 'user',
        content: trimmedContent,
        timestamp: new Date().toISOString(),
        attachedDocuments: attachedDocuments.length > 0 ? attachedDocuments : undefined,
        attachedImages: attachedImages.length > 0 ? attachedImages : undefined,
        attachedQuotes: attachedQuotes.length > 0 ? attachedQuotes : undefined
      }

      const assistantMessage: Message = {
        id: `msg-${now + 1}`,
        role: 'assistant',
        content: '',
        isStreaming: true,
        timestamp: new Date().toISOString(),
        modelName: selected.selectedModel,
        reactSteps: [],
        reactIterations: []
      }

      const nextMessages = [...retainedMessages, userMessage, assistantMessage]
      setMessages(nextMessages)
      messageCache.retainSessionMessages(currentSessionId, nextMessages, targetSession.title)

      streamStore.resetPlanState(currentSessionId)
      if (targetSession.selectionState?.enablePlanMode) {
        streamStore.beginPlanning(currentSessionId, assistantMessage.id)
      }
      streamStore.setSessionSendingState(currentSessionId, true, true)

      try {
        const chatMessages: ChatMessage[] = JSON.parse(
          JSON.stringify(buildChatMessages(nextMessages.slice(0, -1)))
        )

        const result = await window.api.chat.send(
          toPlainRequest({
            messages: chatMessages,
            modelKey: selected.selectedModel,
            sessionId: currentSessionId,
            paperId,
            turnId: assistantMessage.id,
            selectedTools:
              selected.selectedMCPTools.length > 0
                ? toToolReferences(selected.selectedMCPTools)
                : undefined,
            selectedKnowledgeBases:
              selected.selectedKnowledgeBases.length > 0
                ? toKnowledgeReferences(selected.selectedKnowledgeBases)
                : undefined,
            enableLabTools: selected.enableLabTools,
            enablePlanMode: targetSession.selectionState?.enablePlanMode === true,
            sessionType: 'paper',
            enablePaperWebSearch: selected.enablePaperWebSearch
          })
        )

        if (result.modelTranscript && result.modelTranscript.length > 0) {
          const completedAssistant = messagesRef.current.find(
            (message) => message.id === assistantMessage.id
          )
          if (completedAssistant) {
            completedAssistant.modelTranscript = deepClone(result.modelTranscript)
            messageCache.retainSessionMessages(
              currentSessionId,
              messagesRef.current,
              targetSession.title
            )
            await selected.saveCurrentSession()
          }
        }

        if (!result.success && result.error) {
          reportRequestError(result.error)
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught)
        setMessages(snapshot)
        streamStore.setSessionSendingState(currentSessionId, false, true)
        usePaperChatStreamStore.setState({ streamingSessionId: null })
        streamStore.failPlanState(currentSessionId, message)
        reportRequestError(message)
      }
    },
    [messagesRef, paperId, reportRequestError, setError, setMessages]
  )

  const stopRequest = useCallback(async (): Promise<void> => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) {
      return
    }

    await usePaperChatStreamStore.getState().stopRequest(currentSessionId, messagesRef.current)
    setMessages([...messagesRef.current])
    await saveCurrentSession()
  }, [messagesRef, saveCurrentSession, setMessages])

  useEffect(() => {
    usePaperChatStreamStore.getState().setupStreamListener(handleStreamEvent)
    return () => {
      const currentSessionId = sessionIdRef.current

      // 即使发送中也需要保留最新消息缓存
      if (currentSessionId) {
        usePaperChatMessageCacheStore
          .getState()
          .retainSessionMessages(
            currentSessionId,
            messagesRef.current,
            latestRef.current.session?.title
          )
      }

      // 注意：不在此处清理流式 IPC 监听器。
      // 保持监听器活跃，即使组件卸载（如切换视图），流式事件仍被后台处理并缓存。
      // handler 闭包中的 ref 在卸载后仍持有有效值，可继续更新消息缓存和保存会话。
      // 当组件重新挂载时，setupStreamListener 会自动替换为新 handler。
      // 仅在 setupStreamListener 内部（设置新 handler 前）清理旧监听器
    }
  }, [handleStreamEvent, messagesRef])

  return useMemo(
    () => ({
      isSending,
      sendMessage,
      stopRequest
    }),
    [isSending, sendMessage, stopRequest]
  )
}
