import { useKnowledgeSearch } from './hooks/useKnowledgeSearch'
import type { KnowledgeBase } from '@renderer/types'
import styles from './SearchPanel.module.css'

interface SearchPanelProps {
  currentKB?: KnowledgeBase
}

function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightText(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text)

  const escapedQuery = escapeRegex(query.trim())
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>')
}

export default function SearchPanel({ currentKB }: SearchPanelProps) {
  const kbId = currentKB?.id

  const {
    searchQuery,
    setSearchQuery,
    searchResults,
    searching,
    searchPerformed,
    handleSearch,
    closeSearchResults
  } = useKnowledgeSearch(kbId)

  return (
    <section className={styles['search-section']}>
      <div className={styles['search-header']}>
        <div>
          <h3>搜索测试</h3>
        </div>
        <span className={styles['search-hint']}>验证当前知识库的召回质量与片段命中情况。</span>
      </div>

      <div className={styles['search-input-row']}>
        <input
          value={searchQuery}
          type="text"
          className={`sm-input ${styles['search-input']}`}
          placeholder="输入测试查询..."
          onChange={(e) => setSearchQuery(e.target.value)}
          onKeyUp={(e) => {
            if (e.key === 'Enter') handleSearch()
            if (e.key === 'Escape') closeSearchResults()
          }}
        />
        <button
          className={`sm-button sm-button--primary ${styles['search-btn']}`}
          disabled={searching || !searchQuery.trim()}
          onClick={handleSearch}
        >
          {searching ? <span className="sm-spinner"></span> : <span>搜索</span>}
        </button>
      </div>

      {searchPerformed && (
        <div className={styles['search-results']}>
          <div className={styles['search-results__header']}>
            <span className={styles['search-results__title']}>结果</span>
            <span className={styles['search-results__count']}>{searchResults.length} 条</span>
          </div>

          {searchResults.length === 0 ? (
            <div className={`sm-empty ${styles['search-empty']}`}>未找到相关结果</div>
          ) : (
            <div className={styles['search-results-list']}>
              {searchResults.map((result) => (
                <div key={result.chunkId} className={styles['search-result-item']}>
                  <div className={styles['result-header']}>
                    <span className={styles['result-file']}>{result.fileName}</span>
                    <span className={styles['result-similarity']}>
                      {(result.similarity * 100).toFixed(1)}%
                    </span>
                  </div>
                  <div
                    className={styles['result-content']}
                    dangerouslySetInnerHTML={{
                      __html: highlightText(result.content, searchQuery)
                    }}
                  ></div>
                  <div className={styles['result-meta']}>
                    块 {result.chunkIndex} / {result.totalChunks}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}
