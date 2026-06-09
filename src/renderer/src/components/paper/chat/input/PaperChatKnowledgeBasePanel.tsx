import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { KnowledgeBase } from '@renderer/types'
import styles from './PaperChatKnowledgeBasePanel.module.css'

interface PaperChatKnowledgeBasePanelProps {
  selectedKnowledgeBases?: KnowledgeBase[]
  compact?: boolean
  embedded?: boolean
  onSelectionChange: (knowledgeBases: KnowledgeBase[]) => void
}

function getDocumentCountText(kb: KnowledgeBase): string {
  const count = kb.linkedFileIds?.length ?? kb.documentCount ?? 0
  return `${count} 个文档`
}

/** 知识库选择面板组件，支持搜索、多选、展开/收起描述，可通过弹出面板或内嵌模式展示 */
export default function PaperChatKnowledgeBasePanel({
  selectedKnowledgeBases = [],
  compact,
  embedded = false,
  onSelectionChange
}: PaperChatKnowledgeBasePanelProps) {
  const [localSelectedKBs, setLocalSelectedKBs] = useState<KnowledgeBase[]>(selectedKnowledgeBases)
  const [allKnowledgeBases, setAllKnowledgeBases] = useState<KnowledgeBase[]>([])
  const [showPanel, setShowPanel] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [expandedDescriptions, setExpandedDescriptions] = useState<Set<string>>(new Set())
  const [needsExpandButton, setNeedsExpandButton] = useState<Set<string>>(new Set())
  const panelContainerRef = useRef<HTMLDivElement | null>(null)
  const descriptionRefs = useRef<Map<string, HTMLElement>>(new Map())

  useEffect(() => {
    setLocalSelectedKBs(selectedKnowledgeBases)
  }, [selectedKnowledgeBases])

  const selectedIds = useMemo(
    () => new Set(localSelectedKBs.map((kb) => kb.id)),
    [localSelectedKBs]
  )

  // 按搜索框关键词过滤知识库列表，匹配名称和描述
  const filteredKnowledgeBases = useMemo(() => {
    const query = searchQuery.trim().toLowerCase()
    if (!query) {
      return allKnowledgeBases
    }

    return allKnowledgeBases.filter(
      (kb) =>
        kb.name.toLowerCase().includes(query) ||
        (kb.description || '').toLowerCase().includes(query)
    )
  }, [allKnowledgeBases, searchQuery])

  // 判断当前过滤列表中是否所有项均已选中
  const isAllSelected =
    filteredKnowledgeBases.length > 0 &&
    filteredKnowledgeBases.every((kb) => selectedIds.has(kb.id))

  // 延迟一帧检测知识库描述是否溢出，溢出则显示展开按钮
  const refreshOverflowChecks = useCallback(() => {
    window.requestAnimationFrame(() => {
      setNeedsExpandButton((previous) => {
        const next = new Set(previous)
        for (const kb of allKnowledgeBases) {
          const element = descriptionRefs.current.get(kb.id)
          if (element && element.scrollHeight > element.clientHeight + 1) {
            next.add(kb.id)
          }
        }
        return next
      })
    })
  }, [allKnowledgeBases])

  // 从主进程加载所有知识库列表
  const loadKnowledgeBases = useCallback(async (): Promise<void> => {
    try {
      const result = await window.api.knowledge.getAll()
      if (result.success && result.data) {
        setAllKnowledgeBases(result.data)
      } else {
        window.api.logger.error('[PaperChatKnowledgeBasePanel] 加载知识库列表失败', {
          error: result.error
        })
      }
    } catch (error) {
      window.api.logger.error('[PaperChatKnowledgeBasePanel] 加载知识库列表失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }, [])

  // 内嵌模式下自动加载知识库列表
  useEffect(() => {
    if (embedded) {
      void loadKnowledgeBases()
    }
  }, [embedded, loadKnowledgeBases])

  // 面板展开或内嵌模式时，检测描述溢出状态
  useEffect(() => {
    if (showPanel || embedded) {
      refreshOverflowChecks()
    }
  }, [filteredKnowledgeBases, refreshOverflowChecks, showPanel, embedded])

  // 非内嵌模式下监听文档点击，点击面板外部时自动关闭
  useEffect(() => {
    function handleClickOutside(event: MouseEvent): void {
      const container = panelContainerRef.current
      if (showPanel && container && !container.contains(event.target as Node)) {
        setShowPanel(false)
      }
    }

    if (!embedded) {
      document.addEventListener('click', handleClickOutside)
    }
    return () => document.removeEventListener('click', handleClickOutside)
  }, [showPanel, embedded])

  function emitSelectionChange(next: KnowledgeBase[]): void {
    setLocalSelectedKBs(next)
    onSelectionChange(next)
  }

  // 切换面板显示状态，展开时延迟加载知识库列表
  function togglePanel(): void {
    setShowPanel((current) => {
      const next = !current
      if (next) {
        void loadKnowledgeBases()
      }
      return next
    })
  }

  // 切换单个知识库的选中状态：已选则移除，未选则添加
  function toggleKBSelection(kb: KnowledgeBase): void {
    const exists = selectedIds.has(kb.id)
    emitSelectionChange(
      exists
        ? localSelectedKBs.filter((selected) => selected.id !== kb.id)
        : [...localSelectedKBs, kb]
    )
  }

  // 全选/取消全选当前过滤后的知识库，不影响过滤掉的选择项
  function toggleSelectAll(): void {
    if (isAllSelected) {
      const filteredIds = new Set(filteredKnowledgeBases.map((kb) => kb.id))
      emitSelectionChange(localSelectedKBs.filter((kb) => !filteredIds.has(kb.id)))
      return
    }

    const next = [...localSelectedKBs]
    for (const kb of filteredKnowledgeBases) {
      if (!selectedIds.has(kb.id)) {
        next.push(kb)
      }
    }
    emitSelectionChange(next)
  }

  // 设置描述 DOM 引用，异步检测文本是否溢出需要展开按钮
  function setDescriptionRef(kbId: string, element: HTMLDivElement | null): void {
    if (!element) {
      descriptionRefs.current.delete(kbId)
      return
    }

    descriptionRefs.current.set(kbId, element)
    window.requestAnimationFrame(() => {
      if (element.scrollHeight > element.clientHeight + 1) {
        setNeedsExpandButton((previous) => new Set(previous).add(kbId))
      }
    })
  }

  // 切换知识库描述的展开/收起状态
  function toggleDescription(kbId: string): void {
    setExpandedDescriptions((previous) => {
      const next = new Set(previous)
      if (next.has(kbId)) {
        next.delete(kbId)
      } else {
        next.add(kbId)
      }
      return next
    })
  }

  const showPanelContent = embedded || showPanel

  return (
    <div
      ref={panelContainerRef}
      className={[
        styles['paper-chat-knowledge'],
        'paper-chat-knowledge',
        embedded ? styles['paper-chat-knowledge--embedded'] || '' : '',
        compact ? styles['is-compact'] || '' : '',
        compact ? 'is-compact' : ''
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {!embedded && (
        <button
          type="button"
          className={[
            'btn',
            styles['paper-chat-knowledge__trigger'],
            showPanel ? styles.active || '' : '',
            localSelectedKBs.length > 0 ? styles['has-selection'] || '' : ''
          ]
            .filter(Boolean)
            .join(' ')}
          aria-expanded={showPanel}
          onClick={togglePanel}
        >
          {localSelectedKBs.length > 0 ? (
            <span className={styles['paper-chat-knowledge__selected-name']}>
              已选 {localSelectedKBs.length} 个知识库
            </span>
          ) : (
            <span>{compact ? '知识' : '知识库'}</span>
          )}
          {allKnowledgeBases.length > 0 && (
            <span className={styles['paper-chat-knowledge__count']}>
              {allKnowledgeBases.length}
            </span>
          )}
          <span
            className={[
              styles['paper-chat-knowledge__dropdown-arrow'],
              showPanel ? styles.open || '' : ''
            ]
              .filter(Boolean)
              .join(' ')}
          >
            ▼
          </span>
        </button>
      )}

      {showPanelContent && (
        <div
          className={[
            styles['paper-chat-knowledge-panel'],
            'paper-chat-knowledge-panel',
            embedded ? styles['paper-chat-knowledge-panel--embedded'] || '' : ''
          ]
            .filter(Boolean)
            .join(' ')}
        >
          {!embedded && (
            <div className={styles['paper-chat-knowledge-panel__header']}>
              <span className={styles['paper-chat-knowledge-panel__title']}>
                知识库选择（多选）
              </span>
              <span className={styles['paper-chat-knowledge-panel__info']}>
                {allKnowledgeBases.length} 个知识库可用
              </span>
            </div>
          )}

          <div className={styles['paper-chat-knowledge-panel__search']}>
            <input
              className={`input ${styles['paper-chat-knowledge-panel__search-input']}`}
              type="text"
              value={searchQuery}
              placeholder="搜索知识库..."
              aria-label="搜索知识库"
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </div>

          {filteredKnowledgeBases.length > 0 && (
            <div className={styles['paper-chat-knowledge-panel__select-all-bar']}>
              <button
                className={`btn ${styles['paper-chat-knowledge-panel__select-all']}`}
                type="button"
                onClick={toggleSelectAll}
              >
                {isAllSelected ? '取消全选' : '全选'}
              </button>
            </div>
          )}

          <div className={styles['paper-chat-knowledge-panel__list']}>
            {allKnowledgeBases.length === 0 ? (
              <div className={styles['paper-chat-knowledge-panel__empty']}>
                <p>暂无知识库，请在知识库管理页面创建</p>
              </div>
            ) : filteredKnowledgeBases.length === 0 ? (
              <div className={styles['paper-chat-knowledge-panel__empty']}>
                <p>未找到匹配的知识库</p>
              </div>
            ) : (
              filteredKnowledgeBases.map((kb) => {
                const selected = selectedIds.has(kb.id)
                const expanded = expandedDescriptions.has(kb.id)
                return (
                  <div
                    key={kb.id}
                    className={[
                      styles['paper-chat-knowledge-panel__item'],
                      selected ? styles.selected || '' : ''
                    ]
                      .filter(Boolean)
                      .join(' ')}
                    role="button"
                    tabIndex={0}
                    aria-selected={selected}
                    onClick={() => toggleKBSelection(kb)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault()
                        toggleKBSelection(kb)
                      }
                    }}
                  >
                    <div className={styles['paper-chat-knowledge-panel__item-header']}>
                      <span className={styles['paper-chat-knowledge-panel__checkbox']}>
                        {selected ? '☑' : '☐'}
                      </span>
                      <span className={styles['paper-chat-knowledge-panel__name']}>{kb.name}</span>
                    </div>
                    <div className={styles['paper-chat-knowledge-panel__meta']}>
                      <span className={styles['paper-chat-knowledge-panel__doc-count']}>
                        {getDocumentCountText(kb)}
                      </span>
                    </div>
                    {kb.description && (
                      <div className={styles['paper-chat-knowledge-panel__description-wrapper']}>
                        <div
                          ref={(element) => setDescriptionRef(kb.id, element)}
                          className={[
                            styles['paper-chat-knowledge-panel__description'],
                            expanded ? styles.expanded || '' : ''
                          ]
                            .filter(Boolean)
                            .join(' ')}
                        >
                          {kb.description}
                        </div>
                        {needsExpandButton.has(kb.id) && (
                          <button
                            className={styles['paper-chat-knowledge-panel__description-toggle']}
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation()
                              toggleDescription(kb.id)
                            }}
                          >
                            {expanded ? '收起' : '展开'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
