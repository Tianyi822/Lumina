import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { KnowledgeBase, MCPTool, Message, SessionData } from '@renderer/types'
import type { PaperDocument } from '@shared/types/paper'
import { sessionMessageToMessage, messageToSessionMessage } from '@renderer/utils/messageHelpers'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { usePaperChatMessageCacheStore } from '@renderer/stores'

const PAPER_CONTEXT_KIND = 'paper_fulltext'

interface UsePaperChatSessionReturn {
  session: Ref<SessionData | null>
  sessionId: ComputedRef<string>
  messages: Ref<Message[]>
  inputMessage: Ref<string>
  selectedModel: Ref<string>
  selectedMCPTools: Ref<MCPTool[]>
  selectedKnowledgeBases: Ref<KnowledgeBase[]>
  enableLabTools: Ref<boolean>
  loading: Ref<boolean>
  contextLoading: Ref<boolean>
  error: Ref<string>
  ensureSession: () => Promise<SessionData | null>
  ensurePaperContextLoaded: () => Promise<boolean>
  loadSessionWithContext: () => Promise<boolean>
  saveCurrentSession: () => Promise<boolean>
  clearContext: () => Promise<boolean>
  updateInputMessage: (value: string) => void
  updateSelectedModel: (value: string) => void
  updateSelectedTools: (value: MCPTool[]) => void
  updateSelectedKnowledgeBases: (value: KnowledgeBase[]) => void
  updateEnableLabTools: (value: boolean) => void
}

function createPaperContextMessage(paper: PaperDocument, markdown: string): Message {
  return {
    id: `paper-context-${paper.id}-${Date.now()}`,
    role: 'system',
    content: [
      '你是论文阅读助手。用户正在阅读下面这篇论文，请在后续回答中优先基于论文全文内容进行分析。',
      '不要主动告诉用户系统已经注入论文全文，除非用户明确询问上下文来源。',
      '',
      `论文文件名：${paper.fileName}`,
      '',
      '论文全文：',
      markdown
    ].join('\n'),
    timestamp: new Date().toISOString(),
    hidden: true,
    contextKind: PAPER_CONTEXT_KIND,
    sourcePaperId: paper.id
  }
}

function hasPaperContext(messages: Message[], paperId: string): boolean {
  return messages.some(
    (message) =>
      message.hidden &&
      message.contextKind === PAPER_CONTEXT_KIND &&
      message.sourcePaperId === paperId
  )
}

function toPlainSessionData(sessionData: SessionData): SessionData {
  return JSON.parse(JSON.stringify(sessionData)) as SessionData
}

export function usePaperChatSession(
  paper: Ref<PaperDocument | null | undefined>
): UsePaperChatSessionReturn {
  const paperReaderStore = usePaperReaderStore()
  const paperChatMessageCache = usePaperChatMessageCacheStore()
  const session = ref<SessionData | null>(null)
  const messages = ref<Message[]>([])
  const inputMessage = ref('')
  const selectedModel = ref('')
  const selectedMCPTools = ref<MCPTool[]>([])
  const selectedKnowledgeBases = ref<KnowledgeBase[]>([])
  const enableLabTools = ref(false)
  const loading = ref(false)
  const contextLoading = ref(false)
  const error = ref('')

  const sessionId = computed(() => session.value?.sessionId || '')

  function applySessionData(nextSession: SessionData): void {
    session.value = nextSession
    const cachedSession = paperChatMessageCache.getCachedSession(nextSession.sessionId, true)
    messages.value =
      cachedSession?.messages ??
      paperChatMessageCache.retainSessionMessages(
        nextSession.sessionId,
        nextSession.messages.map(sessionMessageToMessage),
        nextSession.title
      )
    selectedMCPTools.value = nextSession.selectionState?.selectedMCPTools || []
    selectedKnowledgeBases.value = nextSession.selectionState?.selectedKnowledgeBases || []
    enableLabTools.value = nextSession.selectionState?.enableLabTools || false
    selectedModel.value = nextSession.selectionState?.selectedModel || ''
  }

  async function saveCurrentSession(): Promise<boolean> {
    if (!session.value) {
      return false
    }

    const sessionToSave: SessionData = {
      ...session.value,
      messages: messages.value.map(messageToSessionMessage),
      selectionState: {
        selectedMCPTools: selectedMCPTools.value,
        selectedKnowledgeBases: selectedKnowledgeBases.value,
        enableLabTools: enableLabTools.value,
        selectedModel: selectedModel.value
      }
    }

    const plainSessionToSave = toPlainSessionData(sessionToSave)
    const result = await window.api.session.save(plainSessionToSave)
    if (!result.success) {
      error.value = result.error || '保存论文聊天会话失败'
      return false
    }

    session.value = plainSessionToSave
    return true
  }

  async function ensureSession(): Promise<SessionData | null> {
    const currentPaper = paper.value
    if (!currentPaper) {
      return null
    }

    loading.value = true
    error.value = ''

    try {
      const sessionResult = await paperReaderStore.ensurePaperChatSession(currentPaper.id)
      const ensuredSessionId = sessionResult.data
      if (!sessionResult.success || !ensuredSessionId) {
        error.value = sessionResult.error || '创建论文聊天会话失败'
        return null
      }

      const ensuredSession = await window.api.session.load(ensuredSessionId)
      if (!ensuredSession) {
        error.value = '加载论文聊天会话失败'
        return null
      }

      applySessionData(ensuredSession)
      return ensuredSession
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
      return null
    } finally {
      loading.value = false
    }
  }

  async function ensurePaperContextLoaded(): Promise<boolean> {
    const currentPaper = paper.value
    if (!currentPaper || !session.value) {
      return false
    }

    if (hasPaperContext(messages.value, currentPaper.id)) {
      return true
    }

    contextLoading.value = true
    error.value = ''

    try {
      const markdownResult = await window.api.paper.getReaderMarkdown(currentPaper.id)
      if (!markdownResult.success || !markdownResult.data?.trim()) {
        error.value = markdownResult.error || '读取论文全文失败'
        return false
      }

      messages.value.unshift(createPaperContextMessage(currentPaper, markdownResult.data))
      return await saveCurrentSession()
    } catch (caught) {
      error.value = caught instanceof Error ? caught.message : String(caught)
      return false
    } finally {
      contextLoading.value = false
    }
  }

  async function loadSessionWithContext(): Promise<boolean> {
    const ensuredSession = await ensureSession()
    if (!ensuredSession) {
      return false
    }

    return await ensurePaperContextLoaded()
  }

  async function clearContext(): Promise<boolean> {
    messages.value.length = 0
    if (session.value) {
      paperChatMessageCache.retainSessionMessages(
        session.value.sessionId,
        messages.value,
        session.value.title
      )
    }
    return await saveCurrentSession()
  }

  function updateInputMessage(value: string): void {
    inputMessage.value = value
  }

  function updateSelectedModel(value: string): void {
    selectedModel.value = value
    void saveCurrentSession()
  }

  function updateSelectedTools(value: MCPTool[]): void {
    selectedMCPTools.value = value
    void saveCurrentSession()
  }

  function updateSelectedKnowledgeBases(value: KnowledgeBase[]): void {
    selectedKnowledgeBases.value = value
    void saveCurrentSession()
  }

  function updateEnableLabTools(value: boolean): void {
    enableLabTools.value = value
    void saveCurrentSession()
  }

  return {
    session,
    sessionId,
    messages,
    inputMessage,
    selectedModel,
    selectedMCPTools,
    selectedKnowledgeBases,
    enableLabTools,
    loading,
    contextLoading,
    error,
    ensureSession,
    ensurePaperContextLoaded,
    loadSessionWithContext,
    saveCurrentSession,
    clearContext,
    updateInputMessage,
    updateSelectedModel,
    updateSelectedTools,
    updateSelectedKnowledgeBases,
    updateEnableLabTools
  }
}
