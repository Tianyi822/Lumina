import { useTranslation } from 'react-i18next'
import styles from './PaperChatStreamingContent.module.css'

/** 流式加载等待占位组件，展示脉冲动画提示模型正在组织回答 */
export default function PaperChatStreamingContent() {
  const { t } = useTranslation()
  return (
    <div className={styles['streaming-placeholder']}>
      <div className={styles['streaming-placeholder-head']}>
        <span className={styles['streaming-placeholder-pulse']} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className={styles['streaming-placeholder-copy']}>
          <span className={styles['streaming-placeholder-title']}>
            {t('paper.chat.streaming.organizing')}
          </span>
          <span className={styles['streaming-placeholder-subtitle']}>
            {t('paper.chat.streaming.readingContext')}
          </span>
        </span>
      </div>
      <div className={styles['streaming-placeholder-bars']} aria-hidden="true">
        <span className={`${styles['streaming-placeholder-bar']} ${styles.primary}`} />
        <span className={`${styles['streaming-placeholder-bar']} ${styles.secondary}`} />
      </div>
    </div>
  )
}
