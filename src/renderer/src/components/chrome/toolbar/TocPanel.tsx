import { useMemo } from 'react'
import type { ReactNode } from 'react'
import SvgIcon from '@renderer/components/icons/SvgIcon'
import type { PaperTocEntry, PaperTocItem } from '@shared/types/paper'
import styles from '../WorkspaceToolbar.module.css'

interface PaperTocTreeNode {
  item: PaperTocItem
  children: PaperTocTreeNode[]
}

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
      <button
        className={[
          'sm-icon-button',
          styles['sm-workspace-toolbar__button'],
          showTocPanel && styles['is-active']
        ]
          .filter(Boolean)
          .join(' ')}
        title="论文目录"
        aria-label="打开论文目录"
        aria-haspopup="dialog"
        aria-expanded={showTocPanel}
        disabled={!canOpenToc}
        onClick={onToggle}
      >
        <SvgIcon name="toc" size={12} />
      </button>

      {showTocPanel && (
        <div
          className={styles['sm-workspace-toolbar__toc-panel']}
          role="dialog"
          aria-label="论文目录"
        >
          <div className={styles['sm-workspace-toolbar__toc-header']}>论文目录</div>

          {markdownLoading ? (
            <div className={styles['sm-workspace-toolbar__toc-state']}>目录加载中</div>
          ) : !hasAnyTocEntries ? (
            <div className={styles['sm-workspace-toolbar__toc-state']}>未识别到可用目录</div>
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
