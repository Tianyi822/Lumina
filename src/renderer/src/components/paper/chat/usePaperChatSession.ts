import { computed, ref, type ComputedRef, type Ref } from 'vue'
import type { KnowledgeBase, MCPTool, Message, SessionData } from '@renderer/types'
import type { PaperDocument } from '@shared/types/paper'
import { sessionMessageToMessage, messageToSessionMessage } from '@renderer/utils/messageHelpers'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import { usePaperChatMessageCacheStore } from '@renderer/stores'

interface UsePaperChatSessionReturn {
  session: Ref<SessionData | null>
  sessionId: ComputedRef<string>
  messages: Ref<Message[]>
  inputMessage: Ref<string>
  selectedModel: Ref<string>
  selectedMCPTools: Ref<MCPTool[]>
  selectedKnowledgeBases: Ref<KnowledgeBase[]>
  enableLabTools: Ref<boolean>
  enablePaperWebSearch: Ref<boolean>
  loading: Ref<boolean>
  error: Ref<string>
  ensureSession: () => Promise<SessionData | null>
  loadSessionWithContext: () => Promise<boolean>
  saveCurrentSession: () => Promise<boolean>
  clearContext: () => Promise<boolean>
  updateInputMessage: (value: string) => void
  updateSelectedModel: (value: string) => void
  updateSelectedTools: (value: MCPTool[]) => void
  updateSelectedKnowledgeBases: (value: KnowledgeBase[]) => void
  updateEnableLabTools: (value: boolean) => void
  updateEnablePaperWebSearch: (value: boolean) => void
}

function toPlainSessionData(sessionData: SessionData): SessionData {
  return JSON.parse(JSON.stringify(sessionData)) as SessionData
}

function isLegacyPaperFulltextContext(message: Pick<Message, 'hidden' | 'contextKind'>): boolean {
  return message.hidden === true && message.contextKind === 'paper_fulltext'
}

function removeLegacyPaperFulltextMessages(messages: Message[]): Message[] {
  const filtered = messages.filter((message) => !isLegacyPaperFulltextContext(message))
  return filtered.length === messages.length ? messages : filtered
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
  const enablePaperWebSearch = ref(false)
  const loading = ref(false)
  const error = ref('')

  const sessionId = computed(() => session.value?.sessionId || '')

  function applySessionData(nextSession: SessionData): void {
    session.value = nextSession
    const cachedSession = paperChatMessageCache.getCachedSession(nextSession.sessionId, true)
    const nextMessages =
      cachedSession?.messages ??
      paperChatMessageCache.retainSessionMessages(
        nextSession.sessionId,
        nextSession.messages.map(sessionMessageToMessage),
        nextSession.title
      )
    messages.value = removeLegacyPaperFulltextMessages(nextMessages)
    selectedMCPTools.value = nextSession.selectionState?.selectedMCPTools || []
    selectedKnowledgeBases.value = nextSession.selectionState?.selectedKnowledgeBases || []
    enableLabTools.value = nextSession.selectionState?.enableLabTools || false
    enablePaperWebSearch.value = nextSession.selectionState?.enablePaperWebSearch || false
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
        selectedModel: selectedModel.value,
        enablePaperWebSearch: enablePaperWebSearch.value
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

  async function loadSessionWithContext(): Promise<boolean> {
    const ensuredSession = await ensureSession()
    if (!ensuredSession) {
      return false
    }

    return true
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

  function updateEnablePaperWebSearch(value: boolean): void {
    enablePaperWebSearch.value = value
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
    enablePaperWebSearch,
    loading,
    error,
    ensureSession,
    loadSessionWithContext,
    saveCurrentSession,
    clearContext,
    updateInputMessage,
    updateSelectedModel,
    updateSelectedTools,
    updateSelectedKnowledgeBases,
    updateEnableLabTools,
    updateEnablePaperWebSearch
  }
}
