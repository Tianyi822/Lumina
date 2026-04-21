import { computed, ref } from 'vue'

export interface TextSearchMatch {
  markElement: HTMLElement
  text: string
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 判断文本节点是否应被排除在搜索范围外
 */
function shouldSkipTextNode(node: Text): boolean {
  const parent = node.parentElement
  if (!parent) return true
  // 跳过已有的 mark、script、style、noscript
  if (parent.closest('mark, script, style, noscript')) return true
  return false
}

export function usePaperTextSearch(): {
  isOpen: import('vue').Ref<boolean>
  query: import('vue').Ref<string>
  matchCount: import('vue').ComputedRef<number>
  currentIndex: import('vue').Ref<number>
  hasMatches: import('vue').ComputedRef<boolean>
  openSearch: () => void
  closeSearch: () => void
  search: (root: HTMLElement, searchQuery: string) => void
  goToNext: () => void
  goToPrevious: () => void
} {
  const isOpen = ref(false)
  const query = ref('')
  const matches = ref<HTMLElement[]>([])
  const currentIndex = ref(-1)

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
    for (const mark of matches.value) {
      const parent = mark.parentNode
      if (!parent) continue

      const text = document.createTextNode(mark.textContent || '')
      parent.replaceChild(text, mark)
      parent.normalize()
    }
    matches.value = []
    currentIndex.value = -1
  }

  /**
   * 在指定根元素内搜索文本并高亮所有匹配项
   */
  function search(root: HTMLElement, searchQuery: string): void {
    clearHighlights()

    const trimmedQuery = searchQuery.trim()
    if (!trimmedQuery) return

    const regex = new RegExp(escapeRegex(trimmedQuery), 'gi')

    // 收集所有文本节点（从后往前收集，后续也从后往前处理）
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: (node) => {
        if (shouldSkipTextNode(node as Text)) return NodeFilter.FILTER_REJECT
        return NodeFilter.FILTER_ACCEPT
      }
    })

    const textNodes: Text[] = []
    while (walker.nextNode()) {
      textNodes.push(walker.currentNode as Text)
    }

    // 从后往前处理，避免 splitText 导致后续节点索引变化
    for (let i = textNodes.length - 1; i >= 0; i--) {
      const node = textNodes[i]
      const text = node.textContent || ''
      const parent = node.parentNode
      if (!parent) continue

      // 收集该文本节点中的所有匹配位置
      const matchIndices: { start: number; end: number }[] = []
      let match: RegExpExecArray | null
      while ((match = regex.exec(text)) !== null) {
        matchIndices.push({ start: match.index, end: match.index + match[0].length })
      }

      if (matchIndices.length === 0) continue

      // 从后往前拆分并插入 mark，保持正向顺序
      let referenceNode: Text = node
      for (let j = matchIndices.length - 1; j >= 0; j--) {
        const { start, end } = matchIndices[j]

        // 拆分为: [node..start] [start..end] [end..]
        const afterNode = referenceNode.splitText(end)
        const matchedNode = referenceNode.splitText(start)

        const mark = document.createElement('mark')
        mark.className = 'paper-markdown-view__search-highlight'
        mark.textContent = matchedNode.textContent
        parent.insertBefore(mark, afterNode)
        parent.removeChild(matchedNode)

        // 从头部插入，保持文档顺序
        matches.value.unshift(mark)

        const prev = mark.previousSibling
        referenceNode = prev instanceof Text ? prev : node
      }
    }

    if (matches.value.length > 0) {
      currentIndex.value = 0
      scrollToMatch(0)
    }
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
      m.classList.remove('paper-markdown-view__search-highlight--current')
    }
    // 给当前匹配项添加 current 类
    mark.classList.add('paper-markdown-view__search-highlight--current')

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
