import { useEffect, useRef, useCallback } from 'react'
import type {
  SshTerminalSize,
  SshTerminalDataEvent,
  SshTerminalExitEvent,
  SshTerminalOpenResult,
  SshTerminalActionResult
} from '@shared/types/lab'

interface UseSshTerminalOptions {
  targetId: string
  enabled: boolean
  onData: (data: string) => void
  onExit: (reason?: string) => void
}

interface UseSshTerminalReturn {
  open: (size: SshTerminalSize) => Promise<SshTerminalOpenResult>
  write: (data: string) => Promise<SshTerminalActionResult | undefined>
  resize: (size: SshTerminalSize) => Promise<SshTerminalActionResult | undefined>
  close: () => Promise<void>
  sessionId: React.MutableRefObject<string | null>
}

export function useSshTerminal({
  targetId,
  enabled,
  onData,
  onExit
}: UseSshTerminalOptions): UseSshTerminalReturn {
  const sessionIdRef = useRef<string | null>(null)
  const onDataRef = useRef(onData)
  const onExitRef = useRef(onExit)
  onDataRef.current = onData
  onExitRef.current = onExit

  const open = useCallback(
    async (size: SshTerminalSize): Promise<SshTerminalOpenResult> => {
      const result = await window.api.ssh.terminal.open(targetId, size)
      if (result.success && result.sessionId) {
        sessionIdRef.current = result.sessionId
      }
      return result
    },
    [targetId]
  )

  const write = useCallback(async (data: string): Promise<SshTerminalActionResult | undefined> => {
    const sid = sessionIdRef.current
    if (!sid) return
    return await window.api.ssh.terminal.write(sid, data)
  }, [])

  const resize = useCallback(
    async (size: SshTerminalSize): Promise<SshTerminalActionResult | undefined> => {
      const sid = sessionIdRef.current
      if (!sid) return
      return await window.api.ssh.terminal.resize(sid, size)
    },
    []
  )

  const close = useCallback(async (): Promise<void> => {
    const sid = sessionIdRef.current
    if (sid) {
      await window.api.ssh.terminal.close(sid)
      sessionIdRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled) return

    const removeData = window.api.ssh.terminal.onData((event: SshTerminalDataEvent) => {
      if (event.sessionId === sessionIdRef.current) {
        onDataRef.current(event.data)
      }
    })
    const removeExit = window.api.ssh.terminal.onExit((event: SshTerminalExitEvent) => {
      if (event.sessionId === sessionIdRef.current) {
        sessionIdRef.current = null
        onExitRef.current(event.reason)
      }
    })
    return () => {
      removeData()
      removeExit()
    }
  }, [enabled])

  return { open, write, resize, close, sessionId: sessionIdRef }
}
