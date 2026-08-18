import { useTranslation } from 'react-i18next'
import { useKnowledgeSearch } from './hooks/useKnowledgeSearch'
import type { KnowledgeBase } from '@renderer/types'
import styles from './SearchPanel.module.css'

/** 知识库语义搜索测试面板 */
interface SearchPanelProps {
  currentKB?: KnowledgeBase
}

/** 转义 HTML 特殊字符防止 XSS */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/** 转义正则特殊字符 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 高亮匹配关键词：安全转义后用 <mark> 标签包裹匹配段落 */
function highlightText(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text)

  const escapedQuery = escapeRegex(query.trim())
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>')
}

export default function SearchPanel({ currentKB }: SearchPanelProps) {
  const { t } = useTranslation()
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
          <h3>{t('knowledge.search.title')}</h3>
        </div>
        <span className={styles['search-hint']}>{t('knowledge.search.hint')}</span>
      </div>

      <div className={styles['search-input-row']}>
        <input
          value={searchQuery}
          type="text"
          className={`sm-input ${styles['search-input']}`}
          placeholder={t('knowledge.search.placeholder')}
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
          {searching ? (
            <span className="sm-spinner"></span>
          ) : (
            <span>{t('knowledge.search.submit')}</span>
          )}
        </button>
      </div>

      {searchPerformed && (
        <div className={styles['search-results']}>
          <div className={styles['search-results__header']}>
            <span className={styles['search-results__title']}>
              {t('knowledge.search.resultsTitle')}
            </span>
            <span className={styles['search-results__count']}>
              {t('knowledge.search.resultsCount', { count: searchResults.length })}
            </span>
          </div>

          {searchResults.length === 0 ? (
            <div className={`sm-empty ${styles['search-empty']}`}>
              {t('knowledge.search.empty')}
            </div>
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
                    {t('knowledge.search.chunkPosition', {
                      index: result.chunkIndex,
                      total: result.totalChunks
                    })}
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
