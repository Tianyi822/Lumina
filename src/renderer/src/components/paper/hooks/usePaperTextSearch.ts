/**
 * React hook：全文搜索与高亮
 *
 * 从 paper/composables/usePaperTextSearch.ts 迁移。
 * 将 Vue ref/computed 转换为 React useState/useCallback。
 */

import { useState, useCallback, useRef } from 'react'
import {
  buildCanonicalTextIndex,
  resolveCanonicalTextPoint
} from '../composables/paperCanonicalTextIndex'

const SEARCH_HIGHLIGHT_CLASS = 'paper-markdown-view__search-highlight'
const SEARCH_HIGHLIGHT_CURRENT_CLASS = 'paper-markdown-view__search-highlight--current'
const SEARCH_HIGHLIGHT_SELECTOR = `mark.${SEARCH_HIGHLIGHT_CLASS}`

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

interface MatchRange {
  start: number
  end: number
}

function collectMatchRanges(text: string, searchQuery: string): MatchRange[] {
  const regex = new RegExp(escapeRegex(searchQuery), 'gi')
  const ranges: MatchRange[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }

  return ranges
}

interface ResolvedMatch {
  startPoint: { node: Node; offset: number }
  endPoint: { node: Node; offset: number }
  text: string
}

function unwrapHighlight(mark: HTMLElement): void {
  const parent = mark.parentNode
  if (!parent) return

  while (mark.firstChild) {
    parent.insertBefore(mark.firstChild, mark)
  }

  parent.removeChild(mark)
  parent.normalize()
}

export interface TextSearchState {
  isOpen: boolean
  query: string
  matchCount: number
  currentIndex: number
  hasMatches: boolean
}

/** 全文搜索与高亮 Hook，管理搜索状态、高亮匹配项和当前结果导航 */
export function usePaperTextSearch() {
  const [isOpen, setIsOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [currentIndex, setCurrentIndex] = useState(-1)
  const matchesRef = useRef<HTMLElement[]>([])
  const highlightedRootRef = useRef<HTMLElement | null>(null)

  const matchCount = matchesRef.current.length
  const hasMatches = matchCount > 0

  const clearHighlights = useCallback(() => {
    const marks = new Set<HTMLElement>(matchesRef.current)
    highlightedRootRef.current
      ?.querySelectorAll<HTMLElement>(SEARCH_HIGHLIGHT_SELECTOR)
      .forEach((mark) => {
        marks.add(mark)
      })

    for (const mark of marks) {
      unwrapHighlight(mark)
    }

    matchesRef.current = []
    setCurrentIndex(-1)
    highlightedRootRef.current = null
  }, [])

  const openSearch = useCallback(() => {
    setIsOpen(true)
  }, [])

  const closeSearch = useCallback(() => {
    setIsOpen(false)
    clearHighlights()
    setQuery('')
  }, [clearHighlights])

  const scrollToMatch = useCallback((index: number) => {
    const mark = matchesRef.current[index]
    if (!mark) return

    for (const m of matchesRef.current) {
      m.classList.remove(SEARCH_HIGHLIGHT_CURRENT_CLASS)
    }
    mark.classList.add(SEARCH_HIGHLIGHT_CURRENT_CLASS)

    const scrollContainer = mark.closest<HTMLElement>('.paper-markdown-view__scroll')
    if (scrollContainer) {
      const containerRect = scrollContainer.getBoundingClientRect()
      const markRect = mark.getBoundingClientRect()
      const targetTop =
        markRect.top - containerRect.top + scrollContainer.scrollTop - containerRect.height / 2
      scrollContainer.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' })
    } else {
      mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [])

  const search = useCallback(
    (root: HTMLElement, searchQuery: string, options: { preserveCurrentIndex?: boolean } = {}) => {
      const previousIndex = options.preserveCurrentIndex ? currentIndex : -1
      clearHighlights()
      highlightedRootRef.current = root

      const trimmedQuery = searchQuery.trim()
      if (!trimmedQuery) return

      const canonicalIndex = buildCanonicalTextIndex(root)
      const resolvedMatches = collectMatchRanges(canonicalIndex.text, trimmedQuery).flatMap(
        (match): ResolvedMatch[] => {
          const startPoint = resolveCanonicalTextPoint(canonicalIndex, match.start, 'start')
          const endPoint = resolveCanonicalTextPoint(canonicalIndex, match.end, 'end')
          if (!startPoint || !endPoint || match.start >= match.end) {
            return []
          }

          return [
            {
              startPoint,
              endPoint,
              text: canonicalIndex.text.slice(match.start, match.end)
            }
          ]
        }
      )

      const doc = root.ownerDocument

      for (let index = resolvedMatches.length - 1; index >= 0; index -= 1) {
        const match = resolvedMatches[index]
        const range = doc.createRange()
        range.setStart(match.startPoint.node, match.startPoint.offset)
        range.setEnd(match.endPoint.node, match.endPoint.offset)
        if (range.collapsed) {
          continue
        }

        const mark = doc.createElement('mark')
        mark.className = SEARCH_HIGHLIGHT_CLASS
        mark.dataset.searchText = match.text

        mark.appendChild(range.extractContents())
        range.insertNode(mark)
        matchesRef.current.unshift(mark)
      }

      if (matchesRef.current.length === 0) {
        setCurrentIndex(-1)
        return
      }

      if (previousIndex >= 0) {
        const newIndex = Math.min(previousIndex, matchesRef.current.length - 1)
        setCurrentIndex(newIndex)
      } else {
        setCurrentIndex(0)
      }
      scrollToMatch(previousIndex >= 0 ? Math.min(previousIndex, matchesRef.current.length - 1) : 0)
    },
    [currentIndex, clearHighlights, scrollToMatch]
  )

  const goToNext = useCallback(() => {
    if (matchesRef.current.length === 0) return
    const next = (currentIndex + 1) % matchesRef.current.length
    setCurrentIndex(next)
    scrollToMatch(next)
  }, [currentIndex, scrollToMatch])

  const goToPrevious = useCallback(() => {
    if (matchesRef.current.length === 0) return
    const prev = (currentIndex - 1 + matchesRef.current.length) % matchesRef.current.length
    setCurrentIndex(prev)
    scrollToMatch(prev)
  }, [currentIndex, scrollToMatch])

  return {
    isOpen,
    query,
    setQuery,
    matchCount,
    currentIndex,
    hasMatches,
    openSearch,
    closeSearch,
    search,
    goToNext,
    goToPrevious,
    clearHighlights
  }
}
