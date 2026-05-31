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

function toToolReferences(tools: MCPTool[]): MCPToolReference[] {
  return tools.map((tool) => ({
    serverName: tool.serverName,
    toolName: tool.name,
    description: tool.description || '',
    inputSchema: tool.inputSchema || {}
  }))
}

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

  const handleStreamEvent = useCallback((event: StreamEvent): void => {
    const current = latestRef.current
    const currentSessionId = sessionIdRef.current || null
    const streamStore = usePaperChatStreamStore.getState()
    const targetSessionId = event.sessionId || streamStore.streamingSessionId

    streamStore.handleStreamEvent(event, currentSessionId, current.messagesRef.current)

    if (!currentSessionId || targetSessionId !== currentSessionId) {
      return
    }

    // 为流式消息创建新的对象引用及 reactIterations/reactSteps 数组引用，
    // 确保 PaperChatReActSteps 中的 useMemo 能检测到内容变化
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

    if (event.type === 'done' || event.type === 'error') {
      if (event.type === 'error' && event.error) {
        current.setError(event.error)
      }
      void current.saveCurrentSession()
    }
  }, [])

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
        reactIterations: [],
        suppressWaitingPlaceholder: selected.enableLabTools
      }

      const nextMessages = [...retainedMessages, userMessage, assistantMessage]
      setMessages(nextMessages)
      messageCache.retainSessionMessages(currentSessionId, nextMessages, targetSession.title)

      streamStore.resetPlanState(currentSessionId)
      if (selected.enableLabTools) {
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
            sessionType: 'paper',
            enablePaperWebSearch: selected.enablePaperWebSearch
          })
        )

        if (!result.success && result.error) {
          setError(result.error)
        }
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : String(caught)
        setMessages(snapshot)
        streamStore.setSessionSendingState(currentSessionId, false, true)
        usePaperChatStreamStore.setState({ streamingSessionId: null })
        streamStore.failPlanState(currentSessionId, message)
        setError(message)
      }
    },
    [messagesRef, paperId, setError, setMessages]
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
      const streamStore = usePaperChatStreamStore.getState()

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

      // 始终清理流监听器，避免卸载后持有过期闭包
      streamStore.cleanupStreamListener()
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
