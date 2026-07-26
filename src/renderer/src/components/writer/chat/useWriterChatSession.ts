import { useCallback, useMemo, useRef, useState } from 'react'
import type { MutableRefObject } from 'react'
import type { KnowledgeBase, MCPTool, Message, SessionData } from '@renderer/types'
import { usePaperChatMessageCacheStore } from '@renderer/stores'
import { useWriterChatStore } from '@renderer/stores/writer'
import { messageToSessionMessage, sessionMessageToMessage } from '@renderer/utils/messageHelpers'
import { deepClone } from '@shared/utils'
import {
  coalesceInflightByKey,
  createInflightByKeyState
} from './coalesceInflightByKey'

interface UseWriterChatSessionReturn {
  session: SessionData | null
  sessionId: string
  messages: Message[]
  messagesRef: MutableRefObject<Message[]>
  inputMessage: string
  selectedModel: string
  selectedMCPTools: MCPTool[]
  selectedKnowledgeBases: KnowledgeBase[]
  selectedPaperId: string | undefined
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
  updateSelectedPaperId: (value: string | undefined) => void
  setError: (message: string) => void
}

/** 深度克隆会话数据，消除 Proxy/引用以确保序列化安全 */
function toPlainSessionData(sessionData: SessionData): SessionData {
  return deepClone(sessionData)
}

/**
 * 写作聊天会话 Hook：按文档 resourceRef 查找/创建独立 writer 会话。
 * 新会话不自动选择论文，也不自动把写作文档加入知识库。
 */
export function useWriterChatSession(documentId: string | null | undefined): UseWriterChatSessionReturn {
  const [session, setSession] = useState<SessionData | null>(null)
  const [messages, setMessagesState] = useState<Message[]>([])
  const [inputMessage, setInputMessage] = useState('')
  const [selectedModel, setSelectedModel] = useState('')
  const [selectedMCPTools, setSelectedMCPTools] = useState<MCPTool[]>([])
  const [selectedKnowledgeBases, setSelectedKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [selectedPaperId, setSelectedPaperId] = useState<string | undefined>(undefined)
  const [loading, setLoading] = useState(false)
  const [error, setErrorState] = useState('')

  const documentIdRef = useRef(documentId)
  const sessionRef = useRef<SessionData | null>(session)
  const messagesRef = useRef<Message[]>(messages)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const ensureInflightRef = useRef(createInflightByKeyState<SessionData | null>())
  const selectionRef = useRef({
    selectedModel,
    selectedMCPTools,
    selectedKnowledgeBases,
    selectedPaperId
  })

  documentIdRef.current = documentId
  sessionRef.current = session
  selectionRef.current = {
    selectedModel,
    selectedMCPTools,
    selectedKnowledgeBases,
    selectedPaperId
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
          selectedModel: selection.selectedModel,
          selectedPaperId: selection.selectedPaperId
        }
      }

      const plainSessionToSave = toPlainSessionData(sessionToSave)
      const result = await window.api.session.save(plainSessionToSave)
      if (!result.success) {
        setErrorState(result.error || '保存写作聊天会话失败')
        return false
      }

      sessionRef.current = plainSessionToSave
      setSession(plainSessionToSave)
      return true
    })

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

      setMessages(nextMessages)
      setSelectedMCPTools(nextSession.selectionState?.selectedMCPTools || [])
      setSelectedKnowledgeBases(nextSession.selectionState?.selectedKnowledgeBases || [])
      setSelectedModel(nextSession.selectionState?.selectedModel || '')
      // 仅使用会话中显式保存的论文选择；不读取 lastPaperId
      const paperId = nextSession.selectionState?.selectedPaperId
      setSelectedPaperId(paperId)
      useWriterChatStore.getState().initializeSession(nextSession.sessionId, nextSession.resourceRef?.id || '')
      useWriterChatStore.getState().setSelectedPaperId(nextSession.sessionId, paperId)
    },
    [setMessages]
  )

  const ensureSession = useCallback(async (): Promise<SessionData | null> => {
    const currentDocumentId = documentIdRef.current
    if (!currentDocumentId) {
      return null
    }

    // 页面 effect 与气泡动作并发时合并为同一 inflight，避免重复 list→create
    return coalesceInflightByKey(ensureInflightRef.current, currentDocumentId, async () => {
      setLoading(true)
      setErrorState('')

      try {
        const list = await window.api.session.list()
        const existing = list.find(
          (item) =>
            item.sessionType === 'writer' &&
            item.resourceRef?.kind === 'writer' &&
            item.resourceRef.id === currentDocumentId
        )

        if (existing) {
          const loaded = await window.api.session.load(existing.sessionId)
          if (!loaded.success || !loaded.data) {
            setErrorState(loaded.error || '加载写作聊天会话失败')
            return null
          }
          applySessionData(loaded.data)
          return loaded.data
        }

        const created = await window.api.session.create('写作对话', 'writer', {
          kind: 'writer',
          id: currentDocumentId
        })
        if (!created.success || !created.data) {
          setErrorState(created.error || '创建写作聊天会话失败')
          return null
        }

        applySessionData(created.data)
        return created.data
      } catch (caught) {
        setErrorState(caught instanceof Error ? caught.message : String(caught))
        return null
      } finally {
        setLoading(false)
      }
    })
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
      useWriterChatStore.getState().setStreamingContent(currentSession.sessionId, '')
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

  const updateSelectedPaperId = useCallback(
    (value: string | undefined): void => {
      setSelectedPaperId(value)
      selectionRef.current.selectedPaperId = value
      const currentSessionId = sessionRef.current?.sessionId
      if (currentSessionId) {
        useWriterChatStore.getState().setSelectedPaperId(currentSessionId, value)
      }
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
    selectedPaperId,
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
    updateSelectedPaperId,
    setError
  }
}
