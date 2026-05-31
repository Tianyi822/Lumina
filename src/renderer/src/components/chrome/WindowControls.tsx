import { useWindowControls } from './hooks/useWindowControls'
import styles from './WindowControls.module.css'

export default function WindowControls() {
  const { isMaximized, minimize, maximize, close } = useWindowControls()
  const maximizeIcon = isMaximized ? '' : ''

  return (
    <div className={styles['sm-window-controls']}>
      <button
        className={styles['sm-window-controls__button']}
        title="最小化"
        aria-label="最小化窗口"
        type="button"
        onClick={minimize}
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
        onClick={maximize}
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
        onClick={close}
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
