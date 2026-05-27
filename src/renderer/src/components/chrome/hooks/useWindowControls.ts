import { useState, useEffect, useCallback } from 'react'

export function useWindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)

  useEffect(() => {
    window.api.window.isMaximized().then(setIsMaximized)
    const unsubscribe = window.api.window.onMaximizedChanged((maximized) => {
      setIsMaximized(maximized)
    })
    return () => {
      unsubscribe?.()
    }
  }, [])

  const minimize = useCallback(async () => {
    await window.api.window.minimize()
  }, [])

  const maximize = useCallback(async () => {
    await window.api.window.maximize()
    setIsMaximized(await window.api.window.isMaximized())
  }, [])

  const close = useCallback(async () => {
    await window.api.window.close()
  }, [])

  return { isMaximized, minimize, maximize, close }
}
