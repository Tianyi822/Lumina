import type { KnowledgeBase } from '@renderer/types'
import EmbeddingModelInfo from './EmbeddingModelInfo'
import styles from './StatsPanel.module.css'

/** 知识库统计摘要面板：展示向量维度、分块大小、文件/文档块/数据库大小 */
interface StatsPanelProps {
  stats: { fileCount: number; chunkCount: number; dbSize: number }
  loadingStats: boolean
  currentKB: KnowledgeBase
}

/** 格式化数据库字节数为可读字符串（B/KB/MB） */
function formatDBSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function StatsPanel({ stats, loadingStats, currentKB }: StatsPanelProps) {
  return (
    <div className={styles['kb-stats']}>
      <EmbeddingModelInfo currentKB={currentKB} />
      <div className={styles['stat-card']}>
        <span className={styles['stat-label']}>向量维度</span>
        <span className={styles['stat-value']}>{currentKB.embeddingDimension}</span>
      </div>
      <div className={styles['stat-card']}>
        <span className={styles['stat-label']}>分块大小</span>
        <span className={styles['stat-value']}>{currentKB.chunkSize}</span>
      </div>
      <div className={styles['stat-card']}>
        <span className={styles['stat-label']}>已索引文件</span>
        <span className={styles['stat-value']}>{loadingStats ? '...' : stats.fileCount}</span>
      </div>
      <div className={styles['stat-card']}>
        <span className={styles['stat-label']}>文档块</span>
        <span className={styles['stat-value']}>{loadingStats ? '...' : stats.chunkCount}</span>
      </div>
      <div className={styles['stat-card']}>
        <span className={styles['stat-label']}>数据库大小</span>
        <span className={styles['stat-value']}>
          {loadingStats ? '...' : formatDBSize(stats.dbSize)}
        </span>
      </div>
    </div>
  )
}
