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
import { usePaperChatMessageCacheStore, usePaperChatStreamStore } from '@renderer/stores'
import { useWriterChatStore, useWriterSessionStore, useWriterSuggestionStore } from '@renderer/stores/writer'
import { buildChatMessages } from '@renderer/utils/messageHelpers'
import { deepClone } from '@shared/utils'
import {
  buildBoundedWriterAiContext,
  createWriterAiRequestContext,
  getRegisteredWriterEditor
} from '@renderer/components/writer/suggestions/writerSuggestionCore'
import { refreshWriterSuggestionDecorations } from '@renderer/components/writer/suggestions/writerSuggestionPlugin'
import {
  resolveWriterAiTurnOptions,
  type SendWriterAiTurnOptions
} from './writerAiTurnOptions'

export type { SendWriterAiTurnOptions }

interface UseWriterChatStreamOptions {
  session: SessionData | null
  messagesRef: MutableRefObject<Message[]>
  setMessages: (messages: Message[]) => void
  selectedModel: string
  selectedMCPTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  saveCurrentSession: () => Promise<boolean>
  setError: (message: string) => void
  onRequestError?: (message: string) => void
}

interface UseWriterChatStreamReturn {
  isSending: boolean
  sendMessage: (
    content: string,
    attachedDocuments?: AttachedDocument[],
    attachedImages?: AttachedImage[],
    options?: SendWriterAiTurnOptions
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

/**
 * 写作对话流式请求 Hook。
 * 写作会话不附带 paperId；正文上下文由 writerContext 提供。
 */
export function useWriterChatStream(options: UseWriterChatStreamOptions): UseWriterChatStreamReturn {
  const { session, messagesRef, setMessages, saveCurrentSession, setError } = options

  const sessionId = session?.sessionId || ''
  const isSending = usePaperChatStreamStore((s) =>
    sessionId ? s.getSessionSendingState(sessionId) : false
  )

  const latestRef = useRef(options)
  latestRef.current = options

  const sessionIdRef = useRef(sessionId)
  sessionIdRef.current = sessionId
  const requestErrorReportedRef = useRef(false)
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

      // 同步流式文本到写作专用 Store，保证按会话隔离可读
      if (event.type === 'content' && typeof event.content === 'string') {
        useWriterChatStore.getState().appendContent(currentSessionId, event.content)
      }

      // 摄入写作结构化编辑建议（双重 Zod + 状态校验在 store.ingestProposal）
      if (event.type === 'tool_result' && event.toolResult?.success) {
        const toolName = event.toolResult.name || ''
        if (toolName === 'writer__propose_edits' || toolName.endsWith('propose_edits')) {
          const editor = getRegisteredWriterEditor()
          const session = useWriterSessionStore.getState()
          if (editor && session.currentDocumentId) {
            const ingested = useWriterSuggestionStore
              .getState()
              .ingestProposal(
                event.toolResult.result,
                session.currentDocumentId,
                session.revision,
                editor.state
              )
            if (ingested) {
              refreshWriterSuggestionDecorations(
                (tr) => editor.view.dispatch(tr),
                editor.state
              )
            }
          }
        }
      }

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
        useWriterChatStore.getState().setSending(currentSessionId, false)
        void current.saveCurrentSession()
        return
      }

      if (rafIdRef.current === null) {
        rafIdRef.current = requestAnimationFrame(() => {
          rafIdRef.current = null
          const latestCurrent = latestRef.current
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
      options?: SendWriterAiTurnOptions
    ): Promise<void> => {
      const targetSession = latestRef.current.session
      if (!targetSession) {
        setError('写作聊天会话未就绪')
        return
      }

      const currentSessionId = targetSession.sessionId
      const trimmedContent = content.trim()
      const hasAttachments = attachedDocuments.length > 0 || attachedImages.length > 0

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
      useWriterChatStore.getState().setStreamingContent(currentSessionId, '')
      useWriterChatStore.getState().setSending(currentSessionId, true)

      const now = Date.now()
      const userMessage: Message = {
        id: `msg-${now}`,
        role: 'user',
        content: trimmedContent,
        timestamp: new Date().toISOString(),
        attachedDocuments: attachedDocuments.length > 0 ? attachedDocuments : undefined,
        attachedImages: attachedImages.length > 0 ? attachedImages : undefined
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
      streamStore.setSessionSendingState(currentSessionId, true, true)

      try {
        const chatMessages: ChatMessage[] = JSON.parse(
          JSON.stringify(buildChatMessages(nextMessages.slice(0, -1)))
        )

        const turn = resolveWriterAiTurnOptions(options)
        const writerEditor = getRegisteredWriterEditor()
        const writerSession = useWriterSessionStore.getState()
        let writerContext: ReturnType<typeof createWriterAiRequestContext> = null
        if (writerEditor && writerSession.currentDocumentId) {
          const rawContext = createWriterAiRequestContext(
            writerEditor,
            turn.scope,
            writerSession.revision
          )
          writerContext = rawContext
            ? buildBoundedWriterAiContext(rawContext).context
            : null
          if (writerContext) {
            useWriterSuggestionStore
              .getState()
              .beginRequest(writerContext.documentId, writerContext.baseRevision)
            // beginRequest 清空 activeProposal，须同步刷新装饰，避免高亮滞留
            refreshWriterSuggestionDecorations(
              (tr) => writerEditor.view.dispatch(tr),
              writerEditor.state
            )
          }
        }

        const result = await window.api.chat.send(
          toPlainRequest({
            messages: chatMessages,
            modelKey: selected.selectedModel,
            sessionId: currentSessionId,
            turnId: assistantMessage.id,
            selectedTools:
              turn.includeExternalTools && selected.selectedMCPTools.length > 0
                ? toToolReferences(selected.selectedMCPTools)
                : undefined,
            selectedKnowledgeBases:
              turn.includeExternalTools && selected.selectedKnowledgeBases.length > 0
                ? toKnowledgeReferences(selected.selectedKnowledgeBases)
                : undefined,
            sessionType: 'writer',
            enablePaperWebSearch: false,
            writerContext: writerContext ?? undefined
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
        useWriterChatStore.getState().setSending(currentSessionId, false)
        reportRequestError(message)
      }
    },
    [messagesRef, reportRequestError, setError, setMessages]
  )

  const stopRequest = useCallback(async (): Promise<void> => {
    const currentSessionId = sessionIdRef.current
    if (!currentSessionId) {
      return
    }

    await usePaperChatStreamStore.getState().stopRequest(currentSessionId, messagesRef.current)
    setMessages([...messagesRef.current])
    useWriterChatStore.getState().setSending(currentSessionId, false)
    await saveCurrentSession()
  }, [messagesRef, saveCurrentSession, setMessages])

  useEffect(() => {
    usePaperChatStreamStore.getState().setupStreamListener(handleStreamEvent)
    return () => {
      const currentSessionId = sessionIdRef.current
      if (currentSessionId) {
        usePaperChatMessageCacheStore
          .getState()
          .retainSessionMessages(
            currentSessionId,
            messagesRef.current,
            latestRef.current.session?.title
          )
      }
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
