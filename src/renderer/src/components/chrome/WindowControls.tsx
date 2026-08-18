import { useTranslation } from 'react-i18next'
import { useWindowControls } from './hooks/useWindowControls'
import styles from './WindowControls.module.css'

/** 窗口控制按钮组（最小化/最大化/关闭），仅 macOS 标题栏使用 */
export default function WindowControls() {
  const { t } = useTranslation()
  const { isMaximized, minimize, maximize, close } = useWindowControls()
  const maximizeIcon = isMaximized ? '' : ''

  return (
    <div className={styles['sm-window-controls']}>
      <button
        className={styles['sm-window-controls__button']}
        title={t('chrome.window.minimize')}
        aria-label={t('chrome.window.minimizeAria')}
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
        title={isMaximized ? t('chrome.window.restore') : t('chrome.window.maximize')}
        aria-label={isMaximized ? t('chrome.window.restoreAria') : t('chrome.window.maximizeAria')}
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
        title={t('chrome.window.close')}
        aria-label={t('chrome.window.closeAria')}
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
