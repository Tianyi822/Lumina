import { useState, useCallback } from 'react'
import type { EmbeddingConfig } from '@shared/types/config'
import styles from './EmbeddingModelItem.module.css'

/** 嵌入模型配置卡片，支持展开查看详情和测试/编辑/删除操作 */
interface EmbeddingModelItemProps {
  id: string
  config: EmbeddingConfig
  testing: boolean
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onTest: (id: string) => void
}

export default function EmbeddingModelItem({
  id,
  config,
  testing,
  onEdit,
  onDelete,
  onTest
}: EmbeddingModelItemProps) {
  const [expanded, setExpanded] = useState(false)

  const displayName = config.displayName || config.model

  const toggleExpand = useCallback(() => {
    setExpanded((prev) => !prev)
  }, [])

  const handleTest = useCallback(() => {
    onTest(id)
  }, [onTest, id])

  const handleEdit = useCallback(() => {
    onEdit(id)
  }, [onEdit, id])

  const handleDelete = useCallback(() => {
    onDelete(id)
  }, [onDelete, id])

  return (
    <div className={styles['model-item']}>
      <div className={styles['model-header']} onClick={toggleExpand}>
        <span className={styles['model-name']}>{displayName}</span>
        <span className={styles['model-dimensions']}>{config.dimensions}维</span>
        <span className={styles['expand-state']}>{expanded ? '收起' : '展开'}</span>
        <div className={styles['model-actions']}>
          <button
            className="sm-button sm-button--small"
            disabled={testing}
            onClick={(e) => {
              e.stopPropagation()
              handleTest()
            }}
          >
            {testing ? '测试中...' : '测试'}
          </button>
          <button
            className="sm-button sm-button--small"
            onClick={(e) => {
              e.stopPropagation()
              handleEdit()
            }}
          >
            编辑
          </button>
          <button
            className={[
              'sm-button',
              'sm-button--small',
              'sm-button--danger',
              styles['btn-danger-text']
            ].join(' ')}
            onClick={(e) => {
              e.stopPropagation()
              handleDelete()
            }}
          >
            删除
          </button>
        </div>
      </div>

      {expanded && (
        <div className={styles['model-details']}>
          <div className={styles['detail-item']}>
            <span className={styles['detail-label']}>API URL:</span>
            <span className={styles['detail-value']}>{config.baseUrl}</span>
          </div>
          <div className={styles['detail-item']}>
            <span className={styles['detail-label']}>模型:</span>
            <span className={styles['detail-value']}>{config.model}</span>
          </div>
        </div>
      )}
    </div>
  )
}
