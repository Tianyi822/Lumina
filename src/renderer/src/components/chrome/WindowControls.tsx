import { useState, useEffect, useCallback } from 'react'
import styles from './WindowControls.module.css'

export default function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)
  const maximizeIcon = isMaximized ? '' : ''

  const syncMaximizedState = useCallback(async () => {
    setIsMaximized(await window.api.window.isMaximized())
  }, [])

  const handleMinimize = useCallback(async () => {
    await window.api.window.minimize()
  }, [])

  const handleMaximize = useCallback(async () => {
    await window.api.window.maximize()
    await syncMaximizedState()
  }, [syncMaximizedState])

  const handleClose = useCallback(async () => {
    await window.api.window.close()
  }, [])

  useEffect(() => {
    syncMaximizedState()
    const unsubscribe = window.api.window.onMaximizedChanged((maximized) => {
      setIsMaximized(maximized)
    })
    return () => {
      unsubscribe?.()
    }
  }, [syncMaximizedState])

  return (
    <div className={styles['sm-window-controls']}>
      <button
        className={styles['sm-window-controls__button']}
        title="最小化"
        aria-label="最小化窗口"
        type="button"
        onClick={handleMinimize}
      >
        <span
          className={[
            styles['sm-window-controls__icon'],
            styles['sm-window-controls__icon--native']
          ].join(' ')}
        >
          &#xE921;
        </span>
      </button>

      <button
        className={styles['sm-window-controls__button']}
        title={isMaximized ? '还原' : '最大化'}
        aria-label={isMaximized ? '还原窗口' : '最大化窗口'}
        type="button"
        onClick={handleMaximize}
      >
        <span
          className={[
            styles['sm-window-controls__icon'],
            styles['sm-window-controls__icon--native']
          ].join(' ')}
        >
          {maximizeIcon}
        </span>
      </button>

      <button
        className={[
          styles['sm-window-controls__button'],
          styles['sm-window-controls__button--close']
        ].join(' ')}
        title="关闭"
        aria-label="关闭窗口"
        type="button"
        onClick={handleClose}
      >
        <span
          className={[
            styles['sm-window-controls__icon'],
            styles['sm-window-controls__icon--native']
          ].join(' ')}
        >
          &#xE8BB;
        </span>
      </button>
    </div>
  )
}
