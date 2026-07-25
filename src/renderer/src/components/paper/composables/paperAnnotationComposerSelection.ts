import type { PaperAnnotation } from '@shared/types/paper'
import {
  buildPaperTextAnchor,
  mapPaperTextAnchorBetweenTexts
} from '@shared/utils/paperAnnotationAnchors'
import { buildPaperQuoteContext } from '@shared/utils/paperQuoteContext'
import {
  buildCanonicalTextIndex,
  findCanonicalMathSegmentByNode,
  getCanonicalRangeClientRect,
  resolveCanonicalTextPoint,
  trimCanonicalTextRange,
  type CanonicalTextClientRect
} from './paperCanonicalTextIndex'
import type { ComputedRef, SelectionDraft } from './paperAnnotationComposerTypes'
import type { RenderSourceSegment } from './usePaperHighlightRenderer'
import type { RenderedSegment } from '../hooks/usePaperMarkdownEngine'
import {
  getSelectionContentRoot,
  markSelectedFormulas,
  normalizeCanonicalSelectionRange,
  resolveRangeOffsetsWithFormulaFallback,
  resolveSelectionSurface
} from './paperDragSelectionSync'
export { clearSelectedFormulas } from './paperDragSelectionSync'

interface PaperAnnotationSelectionResult {
  draft: SelectionDraft
  rect: CanonicalTextClientRect
  normalizedRange: Range | null
}

interface PaperAnnotationSelectionResolverOptions {
  renderedSegments: ComputedRef<RenderedSegment[]>
  getSourceSegments: () => RenderSourceSegment[]
}

export interface PaperAnnotationSelectionResolver {
  buildSelectionDraftFromAnnotation: (annotation: PaperAnnotation) => SelectionDraft
  buildSelectionDraftFromCurrentSelection: (
    event?: MouseEvent
  ) => PaperAnnotationSelectionResult | null
}

/** 创建选区解析器的工厂函数，将 DOM 选择或已有批注转换为 SelectionDraft */
export function createPaperAnnotationSelectionResolver(
  options: PaperAnnotationSelectionResolverOptions
): PaperAnnotationSelectionResolver {
  function buildSelectionDraftFromAnnotation(annotation: PaperAnnotation): SelectionDraft {
    return {
      mode: 'create',
      annotationId: annotation.id,
      viewKind: annotation.noteType === 'translation_view' ? 'translation' : 'original',
      noteType: annotation.noteType,
      segmentStableId: annotation.semanticAnchor.segmentStableId,
      renderSegmentId: annotation.semanticAnchor.renderSegmentIdAtCreation,
      sourceRevisionId: annotation.semanticAnchor.sourceRevisionId,
      segmentTextHash: annotation.semanticAnchor.segmentTextHash,
      sourceRefs: annotation.semanticAnchor.sourceRefs,
      selectedText: annotation.selectedTextSnapshot,
      contextBefore: annotation.contextBefore,
      contextAfter: annotation.contextAfter,
      originalAnchor: annotation.originalAnchor,
      translationAnchor: annotation.translationAnchor
    }
  }

  function buildSelectionResult(
    surface: HTMLElement,
    canonicalText: string,
    selectedRange: { startOffset: number; endOffset: number },
    selectionRect: CanonicalTextClientRect,
    segment: RenderedSegment,
    renderSourceSegment: RenderSourceSegment,
    normalizedRange: Range | null = null
  ): PaperAnnotationSelectionResult {
    const textAnchor = buildPaperTextAnchor(
      canonicalText,
      selectedRange.startOffset,
      selectedRange.endOffset
    )
    const viewKind = (surface.dataset.viewKind as 'original' | 'translation') || 'original'
    const mappedOriginalAnchor =
      viewKind === 'translation' && segment.translationText
        ? mapPaperTextAnchorBetweenTexts(canonicalText, segment.originalText, textAnchor)
        : null

    return {
      rect: selectionRect,
      normalizedRange,
      draft: {
        mode: 'create',
        viewKind,
        noteType: viewKind === 'original' ? 'original_span' : 'translation_view',
        segmentStableId: segment.stableId,
        renderSegmentId: segment.renderId,
        sourceRevisionId: segment.sourceRevisionId,
        segmentTextHash: segment.textHash,
        sourceRefs: renderSourceSegment.sourceRefs,
        selectedText: textAnchor.selectedText,
        contextBefore: canonicalText.slice(
          Math.max(0, selectedRange.startOffset - 64),
          selectedRange.startOffset
        ),
        contextAfter: canonicalText.slice(
          selectedRange.endOffset,
          Math.min(canonicalText.length, selectedRange.endOffset + 64)
        ),
        quoteContext: buildPaperQuoteContext(canonicalText, textAnchor),
        originalAnchor:
          viewKind === 'original'
            ? textAnchor
            : mappedOriginalAnchor && mappedOriginalAnchor.confidence >= 0.58
              ? mappedOriginalAnchor.anchor
              : undefined,
        translationAnchor: viewKind === 'translation' ? textAnchor : undefined
      }
    }
  }

  function buildNativeRangeFromCanonicalRange(
    contentRoot: Element,
    canonicalIndex: ReturnType<typeof buildCanonicalTextIndex>,
    selectedRange: { startOffset: number; endOffset: number }
  ): Range | null {
    const startPoint = resolveCanonicalTextPoint(canonicalIndex, selectedRange.startOffset, 'start')
    const endPoint = resolveCanonicalTextPoint(canonicalIndex, selectedRange.endOffset, 'end')
    if (!startPoint || !endPoint) {
      return null
    }

    const range = contentRoot.ownerDocument.createRange()
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    return range
  }

  function buildFormulaSelectionFromPointerTarget(
    target: EventTarget | null
  ): PaperAnnotationSelectionResult | null {
    if (!(target instanceof Element)) {
      return null
    }

    const mathElement = target.closest('.katex-display') || target.closest('.katex')
    const surface = target.closest<HTMLElement>('[data-paper-selection-surface="true"]')
    if (!mathElement || !surface) {
      return null
    }

    const contentRoot = getSelectionContentRoot(surface)
    if (!contentRoot.contains(mathElement)) {
      return null
    }

    const segment = options.renderedSegments.value.find((item) => {
      return item.stableId === surface.dataset.segmentStableId
    })
    const renderSourceSegment = options
      .getSourceSegments()
      .find((item) => item.stableId === segment?.stableId)
    if (!segment || !renderSourceSegment) {
      return null
    }

    const canonicalIndex = buildCanonicalTextIndex(contentRoot)
    const mathSegment = findCanonicalMathSegmentByNode(canonicalIndex, mathElement)
    if (!mathSegment) {
      return null
    }

    const selectionRect = getCanonicalRangeClientRect(
      canonicalIndex,
      mathSegment.startOffset,
      mathSegment.endOffset
    )
    if (!selectionRect) {
      return null
    }

    markSelectedFormulas(
      contentRoot,
      canonicalIndex,
      mathSegment.startOffset,
      mathSegment.endOffset
    )

    return buildSelectionResult(
      surface,
      canonicalIndex.text,
      {
        startOffset: mathSegment.startOffset,
        endOffset: mathSegment.endOffset
      },
      selectionRect,
      segment,
      renderSourceSegment,
      buildNativeRangeFromCanonicalRange(contentRoot, canonicalIndex, {
        startOffset: mathSegment.startOffset,
        endOffset: mathSegment.endOffset
      })
    )
  }

  function buildSelectionDraftFromCurrentSelection(
    event?: MouseEvent
  ): PaperAnnotationSelectionResult | null {
    if (typeof window === 'undefined') {
      return null
    }

    const selection = window.getSelection()
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
      return null
    }

    const range = selection.getRangeAt(0)
    const startSurface = resolveSelectionSurface(range.startContainer)
    const endSurface = resolveSelectionSurface(range.endContainer)

    if (!startSurface || !endSurface || startSurface !== endSurface) {
      return buildFormulaSelectionFromPointerTarget(event?.target || null)
    }

    if (
      !startSurface.contains(range.startContainer) ||
      !startSurface.contains(range.endContainer)
    ) {
      return buildFormulaSelectionFromPointerTarget(event?.target || null)
    }

    const contentRoot = getSelectionContentRoot(startSurface)
    if (!contentRoot.contains(range.startContainer) || !contentRoot.contains(range.endContainer)) {
      return buildFormulaSelectionFromPointerTarget(event?.target || null)
    }

    const segment = options.renderedSegments.value.find((item) => {
      return item.stableId === startSurface.dataset.segmentStableId
    })
    const renderSourceSegment = options
      .getSourceSegments()
      .find((item) => item.stableId === segment?.stableId)
    if (!segment || !renderSourceSegment) {
      return null
    }

    const canonicalIndex = buildCanonicalTextIndex(contentRoot)

    // 使用增强的偏移量解析（含公式回退逻辑）
    const rangeOffsets = resolveRangeOffsetsWithFormulaFallback(canonicalIndex, range)
    if (!rangeOffsets) {
      return buildFormulaSelectionFromPointerTarget(event?.target || null)
    }

    const normalizedRange = normalizeCanonicalSelectionRange(canonicalIndex, rangeOffsets)
    const trimmedRange = trimCanonicalTextRange(
      canonicalIndex.text,
      normalizedRange.startOffset,
      normalizedRange.endOffset
    )
    if (!trimmedRange) {
      return buildFormulaSelectionFromPointerTarget(event?.target || null)
    }

    const selectionRect = getCanonicalRangeClientRect(
      canonicalIndex,
      trimmedRange.startOffset,
      trimmedRange.endOffset,
      range
    )
    if (!selectionRect) {
      return buildFormulaSelectionFromPointerTarget(event?.target || null)
    }

    const normalizedNativeRange = buildNativeRangeFromCanonicalRange(
      contentRoot,
      canonicalIndex,
      trimmedRange
    )

    markSelectedFormulas(
      contentRoot,
      canonicalIndex,
      trimmedRange.startOffset,
      trimmedRange.endOffset
    )

    return buildSelectionResult(
      startSurface,
      canonicalIndex.text,
      trimmedRange,
      selectionRect,
      segment,
      renderSourceSegment,
      normalizedNativeRange
    )
  }

  return {
    buildSelectionDraftFromAnnotation,
    buildSelectionDraftFromCurrentSelection
  }
}
