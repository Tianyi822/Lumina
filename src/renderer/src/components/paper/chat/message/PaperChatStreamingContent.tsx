import styles from './PaperChatStreamingContent.module.css'

/** 流式加载等待占位组件，展示脉冲动画提示模型正在组织回答 */
export default function PaperChatStreamingContent() {
  return (
    <div className={styles['streaming-placeholder']}>
      <div className={styles['streaming-placeholder-head']}>
        <span className={styles['streaming-placeholder-pulse']} aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
        <span className={styles['streaming-placeholder-copy']}>
          <span className={styles['streaming-placeholder-title']}>正在组织回答</span>
          <span className={styles['streaming-placeholder-subtitle']}>模型正在读取论文上下文</span>
        </span>
      </div>
      <div className={styles['streaming-placeholder-bars']} aria-hidden="true">
        <span className={`${styles['streaming-placeholder-bar']} ${styles.primary}`} />
        <span className={`${styles['streaming-placeholder-bar']} ${styles.secondary}`} />
      </div>
    </div>
  )
}
