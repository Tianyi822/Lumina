import { computed, onBeforeUnmount, onMounted, toRaw, type ComputedRef, type Ref } from 'vue'
import type {
  AttachedDocument,
  AttachedImage,
  ChatMessage,
  KnowledgeBase,
  KnowledgeBaseReference,
  MCPToolReference,
  MCPTool,
  Message,
  SessionData,
  StreamEvent
} from '@renderer/types'
import type { PaperQuote } from '@shared/types/chat'
import { usePaperChatMessageCacheStore, usePaperChatStreamStore } from '@renderer/stores'
import { buildChatMessages } from '@renderer/utils/messageHelpers'

interface UsePaperChatStreamOptions {
  session: Ref<SessionData | null>
  messages: Ref<Message[]>
  selectedModel: Ref<string>
  selectedMCPTools: Ref<MCPTool[]>
  selectedKnowledgeBases: Ref<KnowledgeBase[]>
  enableLabTools: Ref<boolean>
  enablePlanMode: Ref<boolean>
  enablePaperWebSearch: Ref<boolean>
  ensurePaperContextLoaded: () => Promise<boolean>
  saveCurrentSession: () => Promise<boolean>
  setError: (message: string) => void
}

interface UsePaperChatStreamReturn {
  isSending: ComputedRef<boolean>
  sendMessage: (
    content: string,
    attachedDocuments?: AttachedDocument[],
    attachedImages?: AttachedImage[],
    attachedQuotes?: PaperQuote[]
  ) => Promise<void>
  stopRequest: () => Promise<void>
}

function toToolReferences(tools: MCPTool[]): MCPToolReference[] {
  return tools.map((toolRef) => {
    const tool = toRaw(toolRef)
    return {
      serverName: tool.serverName,
      toolName: tool.name,
      description: tool.description || '',
      inputSchema: toRaw(tool.inputSchema) || {}
    }
  })
}

function toKnowledgeReferences(knowledgeBases: KnowledgeBase[]): KnowledgeBaseReference[] {
  return knowledgeBases.map((kbRef) => {
    const kb = toRaw(kbRef)
    return {
      id: kb.id,
      name: kb.name,
      description: kb.description || '',
      documentCount: kb.linkedFileIds?.length ?? kb.documentCount ?? 0
    }
  })
}

function toPlainRequest<T>(request: T): T {
  return JSON.parse(JSON.stringify(request)) as T
}

export function usePaperChatStream(options: UsePaperChatStreamOptions): UsePaperChatStreamReturn {
  const paperChatStreamStore = usePaperChatStreamStore()
  const paperChatMessageCache = usePaperChatMessageCacheStore()
  const sessionId = computed(() => options.session.value?.sessionId || '')
  const isSending = computed(() => {
    return sessionId.value ? paperChatStreamStore.getSessionSendingState(sessionId.value) : false
  })

  function handleStreamEvent(event: StreamEvent): void {
    const currentSessionId = sessionId.value || null
    const targetSessionId = event.sessionId || paperChatStreamStore.streamingSessionId

    paperChatStreamStore.handleStreamEvent(event, currentSessionId, options.messages.value)

    if (!currentSessionId || targetSessionId !== currentSessionId) {
      return
    }

    if (event.type === 'done' || event.type === 'error') {
      if (event.type === 'error' && event.error) {
        options.setError(event.error)
      }
      void options.saveCurrentSession()
    }
  }

  async function sendMessage(
    content: string,
    attachedDocuments: AttachedDocument[] = [],
    attachedImages: AttachedImage[] = [],
    attachedQuotes: PaperQuote[] = []
  ): Promise<void> {
    const targetSession = options.session.value
    if (!targetSession) {
      options.setError('论文聊天会话未就绪')
      return
    }

    const currentSessionId = targetSession.sessionId
    const trimmedContent = content.trim()
    const hasAttachments =
      attachedDocuments.length > 0 || attachedImages.length > 0 || attachedQuotes.length > 0

    if (!trimmedContent && !hasAttachments) {
      return
    }

    if (paperChatStreamStore.getSessionSendingState(currentSessionId)) {
      return
    }

    if (!options.selectedModel.value) {
      options.setError('请先选择一个模型')
      return
    }

    const contextReady = await options.ensurePaperContextLoaded()
    if (!contextReady) {
      return
    }

    options.messages.value = paperChatMessageCache.retainSessionMessages(
      currentSessionId,
      options.messages.value,
      targetSession.title
    )

    const snapshot = JSON.parse(JSON.stringify(options.messages.value)) as Message[]
    paperChatStreamStore.saveMessagesSnapshot(currentSessionId, snapshot)
    paperChatStreamStore.streamingSessionId = currentSessionId

    const userMessage: Message = {
      id: `msg-${Date.now()}`,
      role: 'user',
      content: trimmedContent,
      timestamp: new Date().toISOString(),
      attachedDocuments: attachedDocuments.length > 0 ? attachedDocuments : undefined,
      attachedImages: attachedImages.length > 0 ? attachedImages : undefined,
      attachedQuotes: attachedQuotes.length > 0 ? attachedQuotes : undefined
    }
    options.messages.value.push(userMessage)

    const assistantMessage: Message = {
      id: `msg-${Date.now() + 1}`,
      role: 'assistant',
      content: '',
      isStreaming: true,
      timestamp: new Date().toISOString(),
      modelName: options.selectedModel.value,
      reactSteps: [],
      reactIterations: []
    }
    options.messages.value.push(assistantMessage)
    paperChatStreamStore.setSessionSendingState(currentSessionId, true, true)

    try {
      const chatMessages: ChatMessage[] = JSON.parse(
        JSON.stringify(buildChatMessages(options.messages.value.slice(0, -1)))
      )

      const result = await window.api.chat.send(
        toPlainRequest({
          messages: chatMessages,
          modelKey: options.selectedModel.value,
          sessionId: currentSessionId,
          selectedTools:
            options.selectedMCPTools.value.length > 0
              ? toToolReferences(options.selectedMCPTools.value)
              : undefined,
          selectedKnowledgeBases:
            options.selectedKnowledgeBases.value.length > 0
              ? toKnowledgeReferences(options.selectedKnowledgeBases.value)
              : undefined,
          enableLabTools: options.enableLabTools.value,
          sessionType: 'paper',
          enablePlanMode: options.enablePlanMode.value,
          enablePaperWebSearch: options.enablePaperWebSearch.value
        })
      )

      if (!result.success && result.error) {
        options.setError(result.error)
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : String(caught)
      options.messages.value.length = 0
      options.messages.value.push(...snapshot)
      paperChatStreamStore.setSessionSendingState(currentSessionId, false, true)
      paperChatStreamStore.streamingSessionId = null
      options.setError(message)
    }
  }

  async function stopRequest(): Promise<void> {
    if (!sessionId.value) {
      return
    }

    await paperChatStreamStore.stopRequest(sessionId.value, options.messages.value)
    await options.saveCurrentSession()
  }

  onMounted(() => {
    paperChatStreamStore.setupStreamListener(handleStreamEvent)
  })

  onBeforeUnmount(() => {
    if (sessionId.value && paperChatStreamStore.getSessionSendingState(sessionId.value)) {
      paperChatMessageCache.retainSessionMessages(
        sessionId.value,
        options.messages.value,
        options.session.value?.title
      )
      return
    }

    paperChatStreamStore.cleanupStreamListener()
  })

  return {
    isSending,
    sendMessage,
    stopRequest
  }
}
