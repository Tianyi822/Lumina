import type { CSSProperties } from 'react'
import { useTranslation } from 'react-i18next'
import { useWriterSessionStore } from '@renderer/stores/writer'
import styles from './WriterOutlinePanel.module.css'

/** 大纲从当前文档的 EditorState 实时派生；点击条目通过 nodeId 请求编辑器滚动定位。 */
export default function WriterOutlinePanel() {
  const { t } = useTranslation()
  const outline = useWriterSessionStore((state) => state.outline)
  const requestScrollToNode = useWriterSessionStore((state) => state.requestScrollToNode)

  if (outline.length === 0) {
    return <div className={styles.empty}>{t('writer.outline.empty')}</div>
  }

  return (
    <nav className={styles.outline} aria-label={t('writer.outline.ariaLabel')}>
      {outline.map((item) => {
        const style = { '--writer-outline-level': item.level } as CSSProperties
        return (
          <button
            key={item.nodeId}
            type="button"
            className={styles.item}
            style={style}
            onClick={() => requestScrollToNode(item.nodeId)}
          >
            {item.text.trim() || t('writer.outline.untitledItem')}
          </button>
        )
      })}
    </nav>
  )
}
