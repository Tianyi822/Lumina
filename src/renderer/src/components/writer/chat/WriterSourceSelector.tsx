import { useEffect, useMemo, useState } from 'react'
import type { PaperDocument } from '@shared/types/paper'
import styles from './WriterSourceSelector.module.css'

interface WriterSourceSelectorProps {
  selectedPaperId?: string
  disabled?: boolean
  onSelectPaperId: (paperId: string | undefined) => void
}

/**
 * 写作来源选择：通过 paper.list 展示可搜索论文列表，每次最多选一篇。
 * 不自动读取 lastPaperId。
 */
export default function WriterSourceSelector({
  selectedPaperId,
  disabled,
  onSelectPaperId
}: WriterSourceSelectorProps) {
  const [papers, setPapers] = useState<PaperDocument[]>([])
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    setLoading(true)
    setError('')
    void window.api.paper
      .list()
      .then((result) => {
        if (!active) return
        if (!result.success || !result.data) {
          setPapers([])
          setError(result.error || '加载论文列表失败')
          return
        }
        setPapers(result.data)
      })
      .catch((caught: unknown) => {
        if (!active) return
        setPapers([])
        setError(caught instanceof Error ? caught.message : '加载论文列表失败')
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase()
    if (!normalized) return papers
    return papers.filter((paper) => {
      const title = (paper.title || paper.fileName || '').toLowerCase()
      return title.includes(normalized)
    })
  }, [papers, query])

  const selectedPaper = useMemo(
    () => papers.find((paper) => paper.id === selectedPaperId) || null,
    [papers, selectedPaperId]
  )

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <span className={styles.label}>论文来源</span>
        {selectedPaper ? (
          <button
            type="button"
            className={styles.clear}
            disabled={disabled}
            onClick={() => onSelectPaperId(undefined)}
          >
            清除
          </button>
        ) : null}
      </div>

      {selectedPaper ? (
        <div className={styles.selected} title={selectedPaper.fileName}>
          {selectedPaper.title || selectedPaper.fileName}
        </div>
      ) : (
        <input
          className={styles.search}
          type="search"
          placeholder="搜索论文…"
          value={query}
          disabled={disabled || loading}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="搜索论文"
        />
      )}

      {error ? (
        <div className={styles.error} role="alert">
          {error}
        </div>
      ) : null}

      {!selectedPaper && !loading ? (
        <ul className={styles.list} role="listbox" aria-label="可选论文">
          {filtered.length === 0 ? (
            <li className={styles.empty}>没有可选择的论文</li>
          ) : (
            filtered.slice(0, 40).map((paper) => (
              <li key={paper.id}>
                <button
                  type="button"
                  className={styles.item}
                  disabled={disabled}
                  onClick={() => onSelectPaperId(paper.id)}
                >
                  {paper.title || paper.fileName}
                </button>
              </li>
            ))
          )}
        </ul>
      ) : null}

      {loading ? <div className={styles.hint}>正在加载论文…</div> : null}
    </div>
  )
}
