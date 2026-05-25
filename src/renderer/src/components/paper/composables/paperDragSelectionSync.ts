import { isIgnorableTextBoundaryCharacter } from '@shared/utils/textBoundary'
import {
  buildCanonicalTextIndex,
  getCanonicalOffsetForDomPoint,
  getCanonicalRangeOffsets,
  type CanonicalTextIndex,
  trimCanonicalTextRange
} from './paperCanonicalTextIndex'

export function resolveSelectionSurface(container: Node): HTMLElement | null {
  return container instanceof Element
    ? container.closest<HTMLElement>('[data-paper-selection-surface="true"]')
    : container.parentElement?.closest<HTMLElement>('[data-paper-selection-surface="true"]') ||
        null
}

export function getSelectionContentRoot(surface: HTMLElement): Element {
  return surface.firstElementChild || surface
}

export function resolveRangeOffsetsWithFormulaFallback(
  canonicalIndex: ReturnType<typeof buildCanonicalTextIndex>,
  range: Range
): { startOffset: number; endOffset: number } | null {
  function resolveKatexBoundary(
    container: Node,
    offset: number,
    edge: 'start' | 'end'
  ): { container: Node; offset: number } {
    const element = container instanceof Element ? container : container.parentElement
    if (!element) return { container, offset }

    const katexEl = element.closest('.katex-display, .katex')
    if (!katexEl || !canonicalIndex.root.contains(katexEl)) return { container, offset }

    const parent = katexEl.parentNode
    if (!parent) return { container, offset }

    const katexIndex = Array.prototype.indexOf.call(parent.childNodes, katexEl)
    return {
      container: parent,
      offset: edge === 'start' ? katexIndex : katexIndex + 1
    }
  }

  const adjustedStart = resolveKatexBoundary(range.startContainer, range.startOffset, 'start')
  const adjustedEnd = resolveKatexBoundary(range.endContainer, range.endOffset, 'end')

  if (
    adjustedStart.container !== range.startContainer ||
    adjustedStart.offset !== range.startOffset ||
    adjustedEnd.container !== range.endContainer ||
    adjustedEnd.offset !== range.endOffset
  ) {
    const startOffset = getCanonicalOffsetForDomPoint(
      canonicalIndex,
      adjustedStart.container,
      adjustedStart.offset,
      'start'
    )
    const endOffset = getCanonicalOffsetForDomPoint(
      canonicalIndex,
      adjustedEnd.container,
      adjustedEnd.offset,
      'end'
    )
    if (startOffset !== null && endOffset !== null) {
      return {
        startOffset: Math.min(startOffset, endOffset),
        endOffset: Math.max(startOffset, endOffset)
      }
    }
  }

  return getCanonicalRangeOffsets(canonicalIndex, range)
}

export function normalizeCanonicalSelectionRange(
  canonicalIndex: CanonicalTextIndex,
  rangeOffsets: { startOffset: number; endOffset: number }
): { startOffset: number; endOffset: number } {
  let startOffset = rangeOffsets.startOffset
  const endOffset = rangeOffsets.endOffset

  const startSegment = canonicalIndex.segments.find((segment) => {
    return (
      segment.kind === 'text' &&
      startOffset > segment.startOffset &&
      startOffset <= segment.endOffset
    )
  })

  if (startSegment) {
    let firstVisibleOffset = 0
    while (
      firstVisibleOffset < startSegment.text.length &&
      isIgnorableTextBoundaryCharacter(startSegment.text[firstVisibleOffset])
    ) {
      firstVisibleOffset += 1
    }

    const relativeStartOffset = startOffset - startSegment.startOffset
    if (firstVisibleOffset > 0 && relativeStartOffset === firstVisibleOffset + 1) {
      startOffset -= 1
    }
  }

  return {
    startOffset,
    endOffset
  }
}

/**
 * 监听 document.selectionchange，在拖选过程中实时同步公式 DOM 的
 * `.katex--selected` 类。仅操作 DOM class，不写 React 状态、不打开菜单。
 *
 * @param rootScope - 用于限定只处理该元素内部的 selection surface，
 *                    传 `PaperMarkdownView` 的 scroll container。
 * @returns cleanup 函数
 */
export function syncFormulaSelectionOnDrag(rootScope: Element | null): () => void {
  let pendingRafId: number | null = null

  function handleSelectionChange(): void {
    if (typeof requestAnimationFrame !== 'function') {
      syncOnce()
      return
    }

    if (pendingRafId !== null) return
    pendingRafId = requestAnimationFrame(() => {
      pendingRafId = null
      syncOnce()
    })
  }

  function syncOnce(): void {
    if (!rootScope || typeof window === 'undefined') return

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      clearSelectedFormulas(rootScope)
      return
    }

    const range = selection.getRangeAt(0)
    const startSurface = resolveSelectionSurface(range.startContainer)
    const endSurface = resolveSelectionSurface(range.endContainer)

    if (!startSurface || !endSurface || startSurface !== endSurface) {
      clearSelectedFormulas(rootScope)
      return
    }

    // 确认 surface 在 rootScope 内
    if (!rootScope.contains(startSurface)) {
      clearSelectedFormulas(rootScope)
      return
    }

    const contentRoot = getSelectionContentRoot(startSurface)
    if (!contentRoot.contains(range.startContainer) || !contentRoot.contains(range.endContainer)) {
      clearSelectedFormulas(rootScope)
      return
    }

    const canonicalIndex = buildCanonicalTextIndex(contentRoot)
    const rangeOffsets = resolveRangeOffsetsWithFormulaFallback(canonicalIndex, range)
    if (!rangeOffsets) {
      clearSelectedFormulas(rootScope)
      return
    }

    const normalizedRange = normalizeCanonicalSelectionRange(canonicalIndex, rangeOffsets)
    const trimmedRange = trimCanonicalTextRange(
      canonicalIndex.text,
      normalizedRange.startOffset,
      normalizedRange.endOffset
    )
    if (!trimmedRange) {
      clearSelectedFormulas(rootScope)
      return
    }

    markSelectedFormulas(
      contentRoot,
      canonicalIndex,
      trimmedRange.startOffset,
      trimmedRange.endOffset
    )
  }

  if (typeof document === 'undefined') {
    return () => {}
  }

  document.addEventListener('selectionchange', handleSelectionChange)
  return () => {
    document.removeEventListener('selectionchange', handleSelectionChange)
    if (pendingRafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(pendingRafId)
      pendingRafId = null
    }
  }
}

/** 清除所有公式的整体选中高亮标记 */
export function clearSelectedFormulas(root?: Element): void {
  if (!root && typeof document === 'undefined') {
    return
  }

  const base = root ?? document
  base.querySelectorAll('.katex--selected').forEach((el) => {
    el.classList.remove('katex--selected')
  })
}

function hasMutableClassList(
  node: Node
): node is Node & { classList: Pick<DOMTokenList, 'add' | 'remove'> } {
  const maybeNode = node as Node & { classList?: { add?: unknown; remove?: unknown } }
  return (
    typeof maybeNode.classList?.add === 'function' &&
    typeof maybeNode.classList.remove === 'function'
  )
}

/**
 * 根据 canonical text index 标记被选区完整覆盖的公式。
 *
 * 遍历 index 中 math / display_math 类型的 segments，如果其偏移范围
 * 完全落在 [startOffset, endOffset] 内，则给对应的 DOM 元素添加
 * `katex--selected` 类以显示统一高亮。
 *
 * 对 display_math，segment.sourceNode 是外层 `.katex-display`，
 * 因此只标记外层，不重复标记内部的 `.katex`。
 */
export function markSelectedFormulas(
  root: Element,
  canonicalIndex: ReturnType<typeof buildCanonicalTextIndex>,
  startOffset: number,
  endOffset: number
): void {
  clearSelectedFormulas(root)

  for (const segment of canonicalIndex.segments) {
    if (segment.kind !== 'math' && segment.kind !== 'display_math') {
      continue
    }

    if (segment.startOffset >= startOffset && segment.endOffset <= endOffset) {
      const el = segment.sourceNode
      if (hasMutableClassList(el)) {
        el.classList.add('katex--selected')
      }
    }
  }
}
