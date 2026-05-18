import { computed, ref } from 'vue'
import { buildCanonicalTextIndex, resolveCanonicalTextPoint } from './paperCanonicalTextIndex'

export interface TextSearchMatch {
  markElement: HTMLElement
  text: string
}

interface TextSearchOptions {
  preserveCurrentIndex?: boolean
}

interface ResolvedTextSearchMatch {
  startPoint: {
    node: Node
    offset: number
  }
  endPoint: {
    node: Node
    offset: number
  }
  text: string
}

const SEARCH_HIGHLIGHT_CLASS = 'paper-markdown-view__search-highlight'
const SEARCH_HIGHLIGHT_CURRENT_CLASS = 'paper-markdown-view__search-highlight--current'
const SEARCH_HIGHLIGHT_SELECTOR = `mark.${SEARCH_HIGHLIGHT_CLASS}`

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 收集全文匹配范围，统一在 canonical text 上查找以支持跨节点文本与公式内容。
 */
function collectMatchRanges(text: string, searchQuery: string): { start: number; end: number }[] {
  const regex = new RegExp(escapeRegex(searchQuery), 'gi')
  const ranges: { start: number; end: number }[] = []
  let match: RegExpExecArray | null

  while ((match = regex.exec(text)) !== null) {
    ranges.push({ start: match.index, end: match.index + match[0].length })
  }

  return ranges
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

export function usePaperTextSearch(): {
  isOpen: import('vue').Ref<boolean>
  query: import('vue').Ref<string>
  matchCount: import('vue').ComputedRef<number>
  currentIndex: import('vue').Ref<number>
  hasMatches: import('vue').ComputedRef<boolean>
  openSearch: () => void
  closeSearch: () => void
  search: (root: HTMLElement, searchQuery: string, options?: TextSearchOptions) => void
  goToNext: () => void
  goToPrevious: () => void
} {
  const isOpen = ref(false)
  const query = ref('')
  const matches = ref<HTMLElement[]>([])
  const currentIndex = ref(-1)
  let highlightedRoot: HTMLElement | null = null

  const matchCount = computed(() => matches.value.length)
  const hasMatches = computed(() => matchCount.value > 0)

  function openSearch(): void {
    isOpen.value = true
  }

  function closeSearch(): void {
    isOpen.value = false
    clearHighlights()
    query.value = ''
  }

  function clearHighlights(): void {
    const marks = new Set<HTMLElement>(matches.value)
    highlightedRoot?.querySelectorAll<HTMLElement>(SEARCH_HIGHLIGHT_SELECTOR).forEach((mark) => {
      marks.add(mark)
    })

    for (const mark of marks) {
      unwrapHighlight(mark)
    }

    matches.value = []
    currentIndex.value = -1
    highlightedRoot = null
  }

  /**
   * 在指定根元素内搜索文本并高亮所有匹配项
   */
  function search(root: HTMLElement, searchQuery: string, options: TextSearchOptions = {}): void {
    const previousIndex = options.preserveCurrentIndex ? currentIndex.value : -1
    clearHighlights()
    highlightedRoot = root

    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery) return

    const canonicalIndex = buildCanonicalTextIndex(root)
    const resolvedMatches = collectMatchRanges(canonicalIndex.text, trimmedQuery).flatMap(
      (match): ResolvedTextSearchMatch[] => {
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

    const document = root.ownerDocument

    // 从后往前插入，避免前面的 DOM 边界被后续高亮拆分影响。
    for (let index = resolvedMatches.length - 1; index >= 0; index -= 1) {
      const match = resolvedMatches[index]
      const range = document.createRange()
      range.setStart(match.startPoint.node, match.startPoint.offset)
      range.setEnd(match.endPoint.node, match.endPoint.offset)
      if (range.collapsed) {
        continue
      }

      const mark = document.createElement('mark')
      mark.className = SEARCH_HIGHLIGHT_CLASS
      mark.dataset.searchText = match.text

      mark.appendChild(range.extractContents())
      range.insertNode(mark)
      matches.value.unshift(mark)
    }

    if (matches.value.length === 0) {
      return
    }

    if (previousIndex >= 0) {
      currentIndex.value = Math.min(previousIndex, matches.value.length - 1)
    } else {
      currentIndex.value = 0
    }
    scrollToMatch(currentIndex.value)
  }

  function goToNext(): void {
    if (matches.value.length === 0) return
    currentIndex.value = (currentIndex.value + 1) % matches.value.length
    scrollToMatch(currentIndex.value)
  }

  function goToPrevious(): void {
    if (matches.value.length === 0) return
    currentIndex.value = (currentIndex.value - 1 + matches.value.length) % matches.value.length
    scrollToMatch(currentIndex.value)
  }

  function scrollToMatch(index: number): void {
    const mark = matches.value[index]
    if (!mark) return

    // 移除旧的 current 类
    for (const m of matches.value) {
      m.classList.remove(SEARCH_HIGHLIGHT_CURRENT_CLASS)
    }
    // 给当前匹配项添加 current 类
    mark.classList.add(SEARCH_HIGHLIGHT_CURRENT_CLASS)

    mark.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  return {
    isOpen,
    query,
    matchCount,
    currentIndex,
    hasMatches,
    openSearch,
    closeSearch,
    search,
    goToNext,
    goToPrevious
  }
}
