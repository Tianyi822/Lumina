import { useCallback, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { KnowledgeBase, MCPTool, Message, SessionData } from '@renderer/types'
import type { PaperDocument } from '@shared/types/paper'
import { ensurePaperChatSession } from '@renderer/stores/paper'
import { usePaperChatMessageCacheStore } from '@renderer/stores'
import { messageToSessionMessage, sessionMessageToMessage } from '@renderer/utils/messageHelpers'
import { deepClone } from '@shared/utils'

interface UsePaperChatSessionReactReturn {
  session: SessionData | null
  sessionId: string
  messages: Message[]
  messagesRef: MutableRefObject<Message[]>
  inputMessage: string
  selectedModel: string
  selectedMCPTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  enableLabTools: boolean
  enablePaperWebSearch: boolean
  loading: boolean
  error: string
  ensureSession: () => Promise<SessionData | null>
  loadSessionWithContext: () => Promise<boolean>
  saveCurrentSession: () => Promise<boolean>
  clearContext: () => Promise<boolean>
  setMessages: (messages: Message[]) => void
  updateInputMessage: (value: string) => void
  updateSelectedModel: (value: string) => void
  updateSelectedTools: (value: MCPTool[]) => void
  updateSelectedKnowledgeBases: (value: KnowledgeBase[]) => void
  updateEnableLabTools: (value: boolean) => void
  updateEnablePaperWebSearch: (value: boolean) => void
  setError: (message: string) => void
}

/** 深度克隆会话数据，消除 Proxy/引用以确保序列化安全 */
function toPlainSessionData(sessionData: SessionData): SessionData {
  return deepClone(sessionData)
}

/** 判断消息是否为旧版论文全文上下文消息（需过滤的遗留格式） */
function isLegacyPaperFulltextContext(message: Pick<Message, 'hidden' | 'contextKind'>): boolean {
  return message.hidden === true && message.contextKind === 'paper_fulltext'
}

/** 过滤掉旧版论文全文上下文消息，若无过滤则不创建新数组 */
function removeLegacyPaperFulltextMessages(messages: Message[]): Message[] {
  const filtered = messages.filter((message) => !isLegacyPaperFulltextContext(message))
  return filtered.length === messages.length ? messages : filtered
}

/**
 * 论文聊天会话管理的核心 Hook，处理会话创建/加载/切换、消息缓存、选择状态持久化
 */
export function usePaperChatSessionReact(
  paper: PaperDocument | null | undefined
): UsePaperChatSessionReactReturn {
  const [session, setSession] = useState<SessionData | null>(null)
  const [messages, setMessagesState] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedMCPTools, setSelectedMCPTools] = useState<MCPTool[]>([])
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [enableLabTools, setEnableLabTools] = useState(false)
  const [enablePaperWebSearch, setEnablePaperWebSearch] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setErrorState] = useState('')

  const paperRef = useRef(paper)
  const sessionRef = useRef<SessionData | null>(session)
  const messagesRef = useRef<Message[]>(messages)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const selectionRef = useRef({
    selectedModel,
    selectedMCPTools,
    selectedKnowledgeBases,
    enableLabTools,
    enablePaperWebSearch
  })

  paperRef.current = paper
  sessionRef.current = session
  selectionRef.current = {
    selectedModel,
    selectedMCPTools,
    selectedKnowledgeBases,
    enableLabTools,
    enablePaperWebSearch
  }

  const sessionId = useMemo(() => session?.sessionId || '', [session])

  const setMessages = useCallback((nextMessages: Message[]): void => {
    messagesRef.current = nextMessages
    setMessagesState(nextMessages)
  }, [])

  const setError = useCallback((message: string): void => {
    setErrorState(message)
  }, [])

  const saveCurrentSession = useCallback(async (): Promise<boolean> => {
    const saveTask = saveQueueRef.current.then(async () => {
      const currentSession = sessionRef.current
      if (!currentSession) {
        return false
      }

      const selection = selectionRef.current
      const sessionToSave: SessionData = {
        ...currentSession,
        messages: messagesRef.current.map(messageToSessionMessage),
        selectionState: {
          selectedMCPTools: selection.selectedMCPTools,
          selectedKnowledgeBases: selection.selectedKnowledgeBases,
          enableLabTools: selection.enableLabTools,
          selectedModel: selection.selectedModel,
          enablePaperWebSearch: selection.enablePaperWebSearch
        }
      }

      const plainSessionToSave = toPlainSessionData(sessionToSave)
      const result = await window.api.session.save(plainSessionToSave)
      if (!result.success) {
        setErrorState(result.error || '保存论文聊天会话失败')
        return false
      }

      sessionRef.current = plainSessionToSave
      setSession(plainSessionToSave)
      return true
    })

    // 串行化保存操作，防止 done 事件的快照覆盖后续 modelTranscript 补写的快照
    saveQueueRef.current = saveTask.then(
      () => undefined,
      () => undefined
    )
    return saveTask
  }, [])

  const applySessionData = useCallback(
    (nextSession: SessionData): void => {
      const messageCache = usePaperChatMessageCacheStore.getState()
      setSession(nextSession)
      sessionRef.current = nextSession

      const cachedSession = messageCache.getCachedSession(nextSession.sessionId, true)
      const nextMessages =
        cachedSession?.messages ??
        messageCache.retainSessionMessages(
          nextSession.sessionId,
          nextSession.messages.map(sessionMessageToMessage),
          nextSession.title
        )

      setMessages(removeLegacyPaperFulltextMessages(nextMessages))
      setSelectedMCPTools(nextSession.selectionState?.selectedMCPTools || [])
      setSelectedKnowledgeBases(nextSession.selectionState?.selectedKnowledgeBases || [])
      setEnableLabTools(nextSession.selectionState?.enableLabTools || false)
      setEnablePaperWebSearch(nextSession.selectionState?.enablePaperWebSearch || false)
      setSelectedModel(nextSession.selectionState?.selectedModel || '')
    },
    [setMessages]
  )

  const ensureSession = useCallback(async (): Promise<SessionData | null> => {
    const currentPaper = paperRef.current
    if (!currentPaper) {
      return null
    }

    setLoading(true)
    setErrorState('')

    try {
      const sessionResult = await ensurePaperChatSession(currentPaper.id)
      const ensuredSessionId = sessionResult.data
      if (!sessionResult.success || !ensuredSessionId) {
        setErrorState(sessionResult.error || '创建论文聊天会话失败')
        return null
      }

      const ensuredSessionResult = await window.api.session.load(ensuredSessionId)
      if (!ensuredSessionResult.success || !ensuredSessionResult.data) {
        setErrorState('加载论文聊天会话失败')
        return null
      }

      const ensuredSession = ensuredSessionResult.data
      applySessionData(ensuredSession)
      return ensuredSession
    } catch (caught) {
      setErrorState(caught instanceof Error ? caught.message : String(caught))
      return null
    } finally {
      setLoading(false)
    }
  }, [applySessionData])

  const loadSessionWithContext = useCallback(async (): Promise<boolean> => {
    const ensuredSession = await ensureSession()
    return Boolean(ensuredSession)
  }, [ensureSession])

  const clearContext = useCallback(async (): Promise<boolean> => {
    const currentSession = sessionRef.current
    const nextMessages: Message[] = []
    setMessages(nextMessages)
    if (currentSession) {
      usePaperChatMessageCacheStore
        .getState()
        .retainSessionMessages(currentSession.sessionId, nextMessages, currentSession.title)
    }
    return await saveCurrentSession()
  }, [saveCurrentSession, setMessages])

  const persistSelection = useCallback((): void => {
    void saveCurrentSession()
  }, [saveCurrentSession])

  const updateSelectedModel = useCallback(
    (value: string): void => {
      setSelectedModel(value)
      selectionRef.current.selectedModel = value
      persistSelection()
    },
    [persistSelection]
  )

  const updateSelectedTools = useCallback(
    (value: MCPTool[]): void => {
      setSelectedMCPTools(value)
      selectionRef.current.selectedMCPTools = value
      persistSelection()
    },
    [persistSelection]
  )

  const updateSelectedKnowledgeBases = useCallback(
    (value: KnowledgeBase[]): void => {
      setSelectedKnowledgeBases(value)
      selectionRef.current.selectedKnowledgeBases = value
      persistSelection()
    },
    [persistSelection]
  )

  const updateEnableLabTools = useCallback(
    (value: boolean): void => {
      setEnableLabTools(value)
      selectionRef.current.enableLabTools = value
      persistSelection()
    },
    [persistSelection]
  )

  const updateEnablePaperWebSearch = useCallback(
    (value: boolean): void => {
      setEnablePaperWebSearch(value)
      selectionRef.current.enablePaperWebSearch = value
      persistSelection()
    },
    [persistSelection]
  )

  return {
    session,
    sessionId,
    messages,
    messagesRef,
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
    setMessages,
    updateInputMessage: setInputMessage,
    updateSelectedModel,
    updateSelectedTools,
    updateSelectedKnowledgeBases,
    updateEnableLabTools,
    updateEnablePaperWebSearch,
    setError
  }
}
