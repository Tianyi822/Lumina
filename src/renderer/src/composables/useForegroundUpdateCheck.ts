import { useCallback, useEffect, useRef } from 'react'
import { useUpdateStore } from '@renderer/stores/updateStore'

const isDev = import.meta.env.DEV
/** 前台恢复检查的最小间隔（主进程另有 5 分钟结果缓存） */
const FOREGROUND_CHECK_INTERVAL_MS = 60_000

/**
 * 应用恢复前台时静默检查更新，并在有可用版本时通过 updateStore 状态驱动设置按钮圆点。
 */
export function useForegroundUpdateCheck(): void {
  const setupListeners = useUpdateStore((s) => s.setupListeners)
  const cleanupListeners = useUpdateStore((s) => s.cleanupListeners)
  const checkForUpdateOnForeground = useUpdateStore((s) => s.checkForUpdateOnForeground)
  const lastForegroundCheckAtRef = useRef(0)

  const runForegroundCheck = useCallback((): void => {
    if (isDev) return

    const now = Date.now()
    if (now - lastForegroundCheckAtRef.current < FOREGROUND_CHECK_INTERVAL_MS) {
      return
    }
    lastForegroundCheckAtRef.current = now
    void checkForUpdateOnForeground()
  }, [checkForUpdateOnForeground])

  useEffect(() => {
    if (isDev) return

    setupListeners()
    runForegroundCheck()

    return () => {
      cleanupListeners()
    }
  }, [setupListeners, cleanupListeners, runForegroundCheck])

  useEffect(() => {
    if (isDev) return

    const handleVisibilityChange = (): void => {
      if (document.visibilityState === 'visible') {
        runForegroundCheck()
      }
    }

    const handleWindowFocus = (): void => {
      runForegroundCheck()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('focus', handleWindowFocus)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('focus', handleWindowFocus)
    }
  }, [runForegroundCheck])
}
