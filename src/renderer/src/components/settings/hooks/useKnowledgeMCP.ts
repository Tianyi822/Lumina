import { useState, useEffect, useCallback } from 'react'
import type { KnowledgeMCPServerStatus } from '@shared/types/knowledgeMCP'

const DEFAULT_STATUS: KnowledgeMCPServerStatus = {
  running: false,
  port: 3100,
  localIP: '127.0.0.1',
  url: ''
}

/** 知识库 MCP 服务管理：状态获取、启动/停止、配置更新和状态变更监听 */
export function useKnowledgeMCP() {
  const [status, setStatus] = useState<KnowledgeMCPServerStatus>(DEFAULT_STATUS)
  const [config, setConfig] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const refreshStatus = useCallback(async () => {
    const result = await window.api.knowledgeMCP.getStatus()
    setStatus(result)
  }, [])

  const refreshConfig = useCallback(async () => {
    const configJson = await window.api.knowledgeMCP.getConfig()
    setConfig(configJson)
  }, [])

  useEffect(() => {
    let cancelled = false

    const init = async () => {
      setLoading(true)
      setError(null)
      try {
        const s = await window.api.knowledgeMCP.getStatus()
        if (cancelled) return
        setStatus(s)
        if (s.running) {
          const c = await window.api.knowledgeMCP.getConfig()
          if (cancelled) return
          setConfig(c)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    init()

    const cleanup = window.api.knowledgeMCP.onStatusChange((newStatus) => {
      if (cancelled) return
      setStatus(newStatus)
      if (newStatus.running) {
        window.api.knowledgeMCP
          .getConfig()
          .then((newConfig) => {
            if (!cancelled) setConfig(newConfig)
          })
          .catch((err: unknown) => {
            if (!cancelled) setError(err instanceof Error ? err.message : String(err))
          })
      } else {
        setConfig('')
      }
    })

    return () => {
      cancelled = true
      cleanup()
    }
  }, [])

  const start = useCallback(async () => {
    const result = await window.api.knowledgeMCP.start()
    if (result.success) {
      await refreshConfig()
    }
    return result
  }, [refreshConfig])

  const stop = useCallback(async () => {
    const result = await window.api.knowledgeMCP.stop()
    if (result.success) {
      setConfig('')
    }
    return result
  }, [])

  return { status, config, loading, error, start, stop, refreshStatus, refreshConfig }
}
