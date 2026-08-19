import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import type { ReactNode } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { PaperTocEntry, PaperTocItem } from '@shared/types/paper'
import styles from '../WorkspaceToolbar.module.css'

interface PaperTocTreeNode {
  item: PaperTocItem
  children: PaperTocTreeNode[]
}

/** 论文目录面板：将 headings 构建为多级树，支持跳转到对应章节 */
interface TocPanelProps {
  showTocPanel: boolean
  onToggle: () => void
  canOpenToc: boolean
  markdownLoading: boolean
  hasAnyTocEntries: boolean
  paperTocTitle: PaperTocEntry | null
  paperTocItems: PaperTocItem[]
  onSelectTocItem: (headingId: string) => void
  getTocEntryDisplayText: (entry: PaperTocEntry) => string
  containerRef: React.RefObject<HTMLDivElement | null>
}

export default function TocPanel({
  showTocPanel,
  onToggle,
  canOpenToc,
  markdownLoading,
  hasAnyTocEntries,
  paperTocTitle,
  paperTocItems,
  onSelectTocItem,
  getTocEntryDisplayText,
  containerRef
}: TocPanelProps) {
  const { t } = useTranslation()
  const paperTocTree = useMemo<PaperTocTreeNode[]>(() => {
    const roots: PaperTocTreeNode[] = []
    let currentLevel1: PaperTocTreeNode | null = null
    let currentLevel2: PaperTocTreeNode | null = null

    for (const item of paperTocItems) {
      const node: PaperTocTreeNode = {
        item,
        children: []
      }

      if (item.level === 1) {
        roots.push(node)
        currentLevel1 = node
        currentLevel2 = null
        continue
      }

      if (item.level === 2) {
        if (currentLevel1) {
          currentLevel1.children.push(node)
        } else {
          roots.push(node)
        }

        currentLevel2 = node
        continue
      }

      if (currentLevel2) {
        currentLevel2.children.push(node)
      } else if (currentLevel1) {
        currentLevel1.children.push(node)
      } else {
        roots.push(node)
      }
    }

    return roots
  }, [paperTocItems])

  function renderTocTree(nodes: PaperTocTreeNode[]): ReactNode {
    return nodes.map((node) => (
      <li key={node.item.id} className={styles['sm-workspace-toolbar__toc-node']}>
        <button
          className={[
            styles['sm-workspace-toolbar__toc-item'],
            styles[`sm-workspace-toolbar__toc-item--level-${node.item.level}`]
          ].join(' ')}
          title={getTocEntryDisplayText(node.item)}
          type="button"
          onClick={() => onSelectTocItem(node.item.id)}
        >
          {getTocEntryDisplayText(node.item)}
        </button>

        {node.children.length > 0 && (
          <ul
            className={[
              styles['sm-workspace-toolbar__toc-list'],
              styles['sm-workspace-toolbar__toc-list--child']
            ].join(' ')}
          >
            {renderTocTree(node.children)}
          </ul>
        )}
      </li>
    ))
  }

  return (
    <div ref={containerRef} className={styles['sm-workspace-toolbar__toc']}>
      <div className={styles['sm-workspace-toolbar__item-wrap']}>
        <button
          className={[
            'sm-icon-button',
            styles['sm-workspace-toolbar__button'],
            showTocPanel && styles['is-active']
          ]
            .filter(Boolean)
            .join(' ')}
          aria-label={t('chrome.toolbar.openToc')}
          aria-haspopup="dialog"
          aria-expanded={showTocPanel}
          disabled={!canOpenToc}
          onClick={onToggle}
        >
          <SvgIcon name="toc" size={18} />
        </button>
        <span className={styles['sm-workspace-toolbar__tooltip']} role="tooltip">
          {t('chrome.toolbar.toc')}
        </span>
      </div>

      {showTocPanel && (
        <div
          className={styles['sm-workspace-toolbar__toc-panel']}
          role="dialog"
          aria-label={t('chrome.toolbar.toc')}
        >
          <div className={styles['sm-workspace-toolbar__toc-header']}>
            {t('chrome.toolbar.toc')}
          </div>

          {markdownLoading ? (
            <div className={styles['sm-workspace-toolbar__toc-state']}>
              {t('chrome.toolbar.tocLoading')}
            </div>
          ) : !hasAnyTocEntries ? (
            <div className={styles['sm-workspace-toolbar__toc-state']}>
              {t('chrome.toolbar.tocEmpty')}
            </div>
          ) : (
            <div className={styles['sm-workspace-toolbar__toc-scroll']}>
              {paperTocTitle && (
                <button
                  className={styles['sm-workspace-toolbar__toc-title']}
                  title={getTocEntryDisplayText(paperTocTitle)}
                  type="button"
                  onClick={() => onSelectTocItem(paperTocTitle.id)}
                >
                  {getTocEntryDisplayText(paperTocTitle)}
                </button>
              )}

              {paperTocTitle && paperTocItems.length > 0 && (
                <div className={styles['sm-workspace-toolbar__toc-divider']} aria-hidden="true" />
              )}

              {paperTocItems.length > 0 && (
                <ul className={styles['sm-workspace-toolbar__toc-list']}>
                  {renderTocTree(paperTocTree)}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
