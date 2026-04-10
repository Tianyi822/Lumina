<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import { usePaperReaderStore } from '@renderer/stores/paperReaderStore'
import type {
  CreatePaperAnnotationPayload,
  PaperAnnotation,
  PaperAnnotationTextAnchor,
  PaperReaderDocument,
  PaperReaderSegment,
  PaperReaderSegmentSourceRefs,
  PaperTocOutline,
  PaperTocItem,
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationSegmentKind,
  PaperTranslationStatus,
  ReanchorPaperAnnotationPayload
} from '@shared/types/paper'
import {
  buildPaperTextAnchor,
  findPaperTextAnchorOffset,
  mapPaperTextAnchorBetweenTexts
} from '@shared/utils/paperAnnotationAnchors'
import { normalizePaperMarkdownForRender } from '@shared/utils/paperMarkdown'
import {
  buildPaperTocOutline,
  isPaperAffiliationLikeSegment,
  isPaperAuthorLikeSegment,
  parsePaperTranslationSegments,
  stripPaperTranslationMarkdown
} from '@shared/utils/paperTranslation'
import 'katex/dist/katex.min.css'
import 'markdown-it-texmath/css/texmath.css'

interface RenderSourceSegment {
  renderId: string
  stableId: string
  index: number
  kind: PaperTranslationSegmentKind
  originalMarkdown: string
  originalText: string
  textHash: string
  sourceRevisionId: string
  sourceRefs: PaperReaderSegmentSourceRefs
}

interface QuoteHighlight {
  id: string
  startOffset: number
  endOffset: number
  color: string
}

interface RenderedSegment {
  renderId: string
  stableId: string
  sourceRevisionId: string
  textHash: string
  originalText: string
  originalHtml: string
  translationHtml: string | null
  translationText: string
  translationStatus: PaperTranslationStatus | 'idle'
  showTranslation: boolean
  segmentAnchorId?: string
  isCenteredMeta: boolean
  annotations: PaperAnnotation[]
}

interface SelectionDraft {
  mode: 'create' | 'rebind'
  annotationId?: string
  viewKind: 'original' | 'translation'
  noteType: CreatePaperAnnotationPayload['noteType']
  segmentStableId: string
  renderSegmentId: string
  sourceRevisionId: string
  segmentTextHash: string
  sourceRefs: PaperReaderSegmentSourceRefs
  selectedText: string
  contextBefore: string
  contextAfter: string
  originalAnchor?: PaperAnnotationTextAnchor
  translationAnchor?: PaperAnnotationTextAnchor
  x: number
  y: number
}

const DEFAULT_ANNOTATION_COLOR = '#fde68a'
const EMPTY_SOURCE_REFS: PaperReaderSegmentSourceRefs = {
  pageIndexes: [],
  blockIndexes: []
}

const props = defineProps<{
  content: string
  loading: boolean
  paperId: string
  basePath?: string
  translationVisible: boolean
  translationCache?: PaperTranslationCache | null
  readerDocument?: PaperReaderDocument | null
  annotations?: PaperAnnotation[]
}>()

const paperReaderStore = usePaperReaderStore()

const renderedSegments = ref<RenderedSegment[]>([])
const parseError = ref<string | null>(null)
const composerDraft = ref<SelectionDraft | null>(null)
const composerComment = ref('')
const composerColor = ref(DEFAULT_ANNOTATION_COLOR)
const composerSaving = ref(false)
const composerError = ref<string | null>(null)
const rebindAnnotationId = ref<string | null>(null)
const ignoredOutdatedAnnotationIds = ref<Record<string, true>>({})

const markdownRenderer = new MarkdownIt({
  html: true,
  breaks: true,
  linkify: true
}).use(texmath, {
  engine: katex,
  delimiters: ['dollars', 'beg_end'],
  katexOptions: {
    throwOnError: false,
    strict: 'ignore',
    output: 'htmlAndMathml'
  }
})

const currentTranslationRevisionId = computed(() => {
  const cache = props.translationCache
  if (!cache) {
    return null
  }

  return cache.translationRevisionId || `${cache.sourceHash}:${cache.updatedAt}`
})

const currentTranslationModelName = computed(() => {
  return props.translationCache?.modelName
})

const currentAnnotations = computed(() => props.annotations ?? [])
const currentSegmentStableIds = computed(
  () => new Set(getSourceSegments().map((segment) => segment.stableId))
)
const orphanAnnotations = computed(() => {
  return currentAnnotations.value.filter((annotation) => {
    return (
      annotation.status === 'needs_reanchor' ||
      annotation.status === 'invalid' ||
      !currentSegmentStableIds.value.has(annotation.semanticAnchor.segmentStableId)
    )
  })
})
const outdatedAnnotations = computed(() => {
  return currentAnnotations.value.filter((annotation) => isAnnotationOutdated(annotation))
})
const translationMissingAnnotations = computed(() => {
  return currentAnnotations.value.filter(
    (annotation) => annotation.status === 'translation_missing'
  )
})

function createFallbackSourceSegments(markdown: string): RenderSourceSegment[] {
  return parsePaperTranslationSegments(markdown).map((segment) => ({
    renderId: segment.id,
    stableId: segment.id,
    index: segment.index,
    kind: segment.kind,
    originalMarkdown: segment.originalMarkdown,
    originalText: segment.originalText,
    textHash: segment.id,
    sourceRevisionId: '',
    sourceRefs: EMPTY_SOURCE_REFS
  }))
}

function getSourceSegments(): RenderSourceSegment[] {
  const rawDocument = props.readerDocument ? toRaw(props.readerDocument) : null
  if (rawDocument?.segments?.length) {
    return rawDocument.segments.map((segment: PaperReaderSegment) => ({
      renderId: segment.renderId,
      stableId: segment.stableId,
      index: segment.index,
      kind: segment.kind,
      originalMarkdown: segment.originalMarkdown,
      originalText: segment.originalText,
      textHash: segment.textHash,
      sourceRevisionId: segment.sourceRevisionId,
      sourceRefs: segment.sourceRefs
    }))
  }

  return createFallbackSourceSegments(props.content)
}

function normalizeInlineMath(content: string): string {
  return content.replace(/\$([^\n$]+?)\$/g, (_match, expression: string) => {
    return `$${expression.trim()}$`
  })
}

function resolveImagePaths(html: string, basePath: string | undefined): string {
  if (!basePath) return html

  return html.replace(
    /src=(['"])(assets\/[^'"]+)\1/g,
    (_match, quote: string, relativePath: string) => {
      const normalizedBase = basePath.endsWith('/') ? basePath : basePath + '/'
      return `src=${quote}file://${normalizedBase}${relativePath}${quote}`
    }
  )
}

function postProcessRenderedHtml(html: string, headingId?: string): string {
  if (typeof DOMParser === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = document.body.firstElementChild
  if (!root) {
    return html
  }

  root.querySelectorAll('hr').forEach((separator) => {
    separator.remove()
  })

  if (headingId) {
    const heading = root.querySelector('h1, h2, h3, h4, h5, h6')
    if (heading) {
      heading.id = headingId
    }
  }

  root.querySelectorAll('table').forEach((table) => {
    if (table.parentElement?.classList.contains('paper-markdown-view__table-wrap')) {
      return
    }

    const wrap = document.createElement('div')
    wrap.className = 'paper-markdown-view__table-wrap'
    table.parentNode?.insertBefore(wrap, table)
    wrap.appendChild(table)
  })

  return root.innerHTML
}

function renderMarkdownBlock(
  markdown: string,
  kind: PaperTranslationSegmentKind,
  headingId?: string
): string {
  const normalizedContent = normalizeInlineMath(normalizePaperMarkdownForRender(markdown, kind))
  const rawHtml = markdownRenderer.render(normalizedContent)
  const resolvedHtml = resolveImagePaths(rawHtml, props.basePath)
  return postProcessRenderedHtml(resolvedHtml, headingId)
}

function shouldRenderTranslationBlock(
  visible: boolean,
  status: PaperTranslationStatus | 'idle',
  translationHtml: string | null
): boolean {
  if (!visible || status === 'idle' || status === 'skipped') {
    return false
  }

  if (status === 'completed') {
    return !!translationHtml
  }

  return true
}

function collectFrontMatterMetadataIds(segments: RenderSourceSegment[]): Set<string> {
  const metadataIds = new Set<string>()
  const startIndex = segments[0]?.kind === 'heading' ? 1 : 0

  for (let index = startIndex; index < segments.length; index += 1) {
    const segment = segments[index]
    if (segment.kind === 'heading') {
      break
    }

    const isMetadataSegment =
      isPaperAuthorLikeSegment(segment) || isPaperAffiliationLikeSegment(segment)

    if (!isMetadataSegment) {
      break
    }

    metadataIds.add(segment.renderId)
  }

  return metadataIds
}

function resolveOriginalViewAnchor(
  segment: RenderSourceSegment,
  translationText: string,
  annotation: PaperAnnotation
): PaperAnnotationTextAnchor | null {
  if (!annotation.originalAnchor && (!translationText || !annotation.translationAnchor)) {
    return null
  }

  if (annotation.originalAnchor) {
    const startOffset = findPaperTextAnchorOffset(segment.originalText, annotation.originalAnchor)
    if (startOffset !== null) {
      return buildPaperTextAnchor(
        segment.originalText,
        startOffset,
        startOffset + annotation.originalAnchor.selectedText.length
      )
    }
  }

  if (translationText && annotation.translationAnchor) {
    const mapped = mapPaperTextAnchorBetweenTexts(
      translationText,
      segment.originalText,
      annotation.translationAnchor
    )
    if (mapped && mapped.confidence >= 0.58) {
      return mapped.anchor
    }
  }

  return null
}

function resolveTranslationViewAnchor(
  segment: RenderSourceSegment,
  translationText: string,
  annotation: PaperAnnotation
): PaperAnnotationTextAnchor | null {
  if (!translationText) {
    return null
  }

  if (annotation.translationAnchor) {
    const startOffset = findPaperTextAnchorOffset(translationText, annotation.translationAnchor)
    if (startOffset !== null) {
      return buildPaperTextAnchor(
        translationText,
        startOffset,
        startOffset + annotation.translationAnchor.selectedText.length
      )
    }
  }

  if (annotation.originalAnchor) {
    const startOffset = findPaperTextAnchorOffset(segment.originalText, annotation.originalAnchor)
    const currentOriginalAnchor =
      startOffset !== null
        ? buildPaperTextAnchor(
            segment.originalText,
            startOffset,
            startOffset + annotation.originalAnchor.selectedText.length
          )
        : annotation.originalAnchor
    const mapped = mapPaperTextAnchorBetweenTexts(
      segment.originalText,
      translationText,
      currentOriginalAnchor
    )
    if (mapped && mapped.confidence >= 0.58) {
      return mapped.anchor
    }
  }

  return null
}

function collectOriginalHighlights(
  segment: RenderSourceSegment,
  translationText: string,
  annotations: PaperAnnotation[]
): QuoteHighlight[] {
  return annotations
    .filter((annotation) => {
      if (annotation.status === 'needs_reanchor' || annotation.status === 'invalid') {
        return false
      }

      return annotation.noteType === 'original_span' || !!annotation.originalAnchor
    })
    .flatMap((annotation) => {
      const resolvedAnchor = resolveOriginalViewAnchor(segment, translationText, annotation)
      if (!resolvedAnchor) {
        return []
      }

      const startOffset = findPaperTextAnchorOffset(segment.originalText, resolvedAnchor)
      if (startOffset === null) {
        return []
      }

      return [
        {
          id: annotation.id,
          startOffset,
          endOffset: startOffset + resolvedAnchor.selectedText.length,
          color: annotation.color
        }
      ]
    })
}

function collectTranslationHighlights(
  segment: RenderSourceSegment,
  translationText: string,
  annotations: PaperAnnotation[]
): QuoteHighlight[] {
  return annotations
    .filter((annotation) => {
      return annotation.status === 'active' || annotation.status === 'translation_missing'
    })
    .flatMap((annotation) => {
      const resolvedAnchor = resolveTranslationViewAnchor(segment, translationText, annotation)
      if (!resolvedAnchor) {
        return []
      }

      const startOffset = findPaperTextAnchorOffset(translationText, resolvedAnchor)
      if (startOffset === null) {
        return []
      }

      return [
        {
          id: annotation.id,
          startOffset,
          endOffset: startOffset + resolvedAnchor.selectedText.length,
          color: annotation.color
        }
      ]
    })
}

function resolveTextPoint(
  root: Element,
  absoluteOffset: number
): { node: Text; offset: number } | null {
  const walker = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let currentOffset = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const length = node.textContent?.length || 0
    const endOffset = currentOffset + length
    if (absoluteOffset <= endOffset) {
      return {
        node,
        offset: Math.max(0, absoluteOffset - currentOffset)
      }
    }
    currentOffset = endOffset
  }

  return null
}

function sortHighlights(highlights: QuoteHighlight[]): QuoteHighlight[] {
  const sorted = [...highlights].sort((left, right) => {
    return left.startOffset - right.startOffset || left.endOffset - right.endOffset
  })

  const filtered: QuoteHighlight[] = []
  let lastEnd = -1
  for (const highlight of sorted) {
    if (highlight.startOffset < lastEnd) {
      continue
    }
    filtered.push(highlight)
    lastEnd = highlight.endOffset
  }

  return filtered
}

function applyHighlightsToHtml(html: string, highlights: QuoteHighlight[]): string {
  if (!html || highlights.length === 0 || typeof DOMParser === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = document.body.firstElementChild
  if (!root) {
    return html
  }

  const sortedHighlights = sortHighlights(highlights)
  for (let index = sortedHighlights.length - 1; index >= 0; index -= 1) {
    const highlight = sortedHighlights[index]
    if (highlight.startOffset >= highlight.endOffset) {
      continue
    }

    const startPoint = resolveTextPoint(root, highlight.startOffset)
    const endPoint = resolveTextPoint(root, highlight.endOffset)
    if (!startPoint || !endPoint) {
      continue
    }

    const range = document.createRange()
    range.setStart(startPoint.node, startPoint.offset)
    range.setEnd(endPoint.node, endPoint.offset)
    if (range.collapsed) {
      continue
    }

    const mark = document.createElement('mark')
    mark.className = 'paper-annotation-highlight'
    mark.setAttribute('data-annotation-id', highlight.id)
    mark.setAttribute('style', `background-color: ${highlight.color};`)

    const fragment = range.extractContents()
    mark.appendChild(fragment)
    range.insertNode(mark)
  }

  return root.innerHTML
}

function buildTocAndRenderedSegments(): { outline: PaperTocOutline; segments: RenderedSegment[] } {
  const sourceSegments = getSourceSegments()
  const rendered: RenderedSegment[] = []
  const translationMap = new Map<string, PaperTranslationEntry>()
  const frontMatterMetadataIds = collectFrontMatterMetadataIds(sourceSegments)
  const outline = buildPaperTocOutline(
    sourceSegments.map((segment) => ({
      id: segment.renderId,
      index: segment.index,
      kind: segment.kind,
      originalMarkdown: segment.originalMarkdown,
      originalText: segment.originalText
    })),
    props.translationCache?.entries ?? []
  )
  const outlineEntryMap = new Map<string, PaperTocItem | PaperTocOutline['documentTitle']>()
  const annotationsBySegmentId = new Map<string, PaperAnnotation[]>()

  for (const annotation of currentAnnotations.value) {
    const segmentStableId = annotation.semanticAnchor.segmentStableId
    const existing = annotationsBySegmentId.get(segmentStableId) || []
    existing.push(annotation)
    annotationsBySegmentId.set(segmentStableId, existing)
  }

  if (outline.documentTitle) {
    outlineEntryMap.set(outline.documentTitle.segmentId, outline.documentTitle)
  }

  for (const item of outline.items) {
    outlineEntryMap.set(item.segmentId, item)
  }

  for (const entry of props.translationCache?.entries ?? []) {
    translationMap.set(entry.id, entry)
  }

  for (const segment of sourceSegments) {
    const outlineEntry = outlineEntryMap.get(segment.renderId)
    const headingId = segment.kind === 'heading' ? outlineEntry?.id : undefined
    const segmentAnchorId = segment.kind === 'heading' ? undefined : outlineEntry?.id
    const annotations = annotationsBySegmentId.get(segment.stableId) || []
    const translationEntry = translationMap.get(segment.renderId)
    const translationStatus = translationEntry?.status ?? 'idle'
    const translationText = translationEntry?.translatedText
      ? translationEntry.translatedText
      : translationEntry?.translatedMarkdown
        ? stripPaperTranslationMarkdown(translationEntry.translatedMarkdown)
        : ''

    const originalHtml = applyHighlightsToHtml(
      renderMarkdownBlock(segment.originalMarkdown, segment.kind, headingId),
      collectOriginalHighlights(segment, translationText, annotations)
    )

    const translationHtml =
      translationEntry &&
      translationEntry.status === 'completed' &&
      translationEntry.translatedMarkdown
        ? applyHighlightsToHtml(
            renderMarkdownBlock(translationEntry.translatedMarkdown, translationEntry.kind),
            collectTranslationHighlights(segment, translationText, annotations)
          )
        : null

    rendered.push({
      renderId: segment.renderId,
      stableId: segment.stableId,
      sourceRevisionId: segment.sourceRevisionId,
      textHash: segment.textHash,
      originalText: segment.originalText,
      originalHtml,
      translationHtml,
      translationText,
      translationStatus,
      showTranslation: shouldRenderTranslationBlock(
        props.translationVisible,
        translationStatus,
        translationHtml
      ),
      segmentAnchorId,
      isCenteredMeta: frontMatterMetadataIds.has(segment.renderId),
      annotations: [...annotations].sort((left, right) =>
        left.createdAt.localeCompare(right.createdAt)
      )
    })
  }

  return {
    outline,
    segments: rendered
  }
}

function renderContent(): void {
  parseError.value = null
  if (!props.content.trim()) {
    renderedSegments.value = []
    paperReaderStore.clearPaperToc()
    return
  }

  try {
    const result = buildTocAndRenderedSegments()
    renderedSegments.value = result.segments
    paperReaderStore.setPaperTocOutline(result.outline)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    parseError.value = `Markdown 解析失败: ${message}`
    renderedSegments.value = []
    paperReaderStore.clearPaperToc()
  }
}

function clearComposer(): void {
  composerDraft.value = null
  composerComment.value = ''
  composerColor.value = DEFAULT_ANNOTATION_COLOR
  composerSaving.value = false
  composerError.value = null
}

function cancelRebindMode(): void {
  rebindAnnotationId.value = null
}

function handleCancelComposer(): void {
  clearComposer()
  if (rebindAnnotationId.value) {
    cancelRebindMode()
  }
}

function getSelectionTextOffset(root: HTMLElement, container: Node, offset: number): number {
  const range = document.createRange()
  range.selectNodeContents(root)
  range.setEnd(container, offset)
  return range.toString().length
}

function getAnnotationById(annotationId: string | null): PaperAnnotation | null {
  if (!annotationId) {
    return null
  }

  return currentAnnotations.value.find((annotation) => annotation.id === annotationId) || null
}

function isAnnotationOutdated(annotation: PaperAnnotation): boolean {
  if (ignoredOutdatedAnnotationIds.value[annotation.id]) {
    return false
  }

  return !!(
    annotation.translationAnchor?.translationRevisionId &&
    currentTranslationRevisionId.value &&
    annotation.translationAnchor.translationRevisionId !== currentTranslationRevisionId.value
  )
}

function createTranslationAnchorPayload(
  anchor: PaperAnnotationTextAnchor | undefined
): CreatePaperAnnotationPayload['translationAnchor'] {
  if (!anchor) {
    return undefined
  }

  return {
    ...anchor,
    translationRevisionId: currentTranslationRevisionId.value || 'missing-translation',
    modelName: currentTranslationModelName.value || undefined
  }
}

function scrollToSegment(stableId: string): void {
  if (typeof document === 'undefined') {
    return
  }

  const segmentElement = document.querySelector<HTMLElement>(
    `[data-paper-segment-stable-id="${stableId}"]`
  )
  segmentElement?.scrollIntoView({
    behavior: 'smooth',
    block: 'center'
  })
}

function startRebind(annotation: PaperAnnotation): void {
  rebindAnnotationId.value = annotation.id
  composerComment.value = annotation.comment
  composerColor.value = annotation.color
  composerError.value = null
  composerDraft.value = null
  scrollToSegment(annotation.semanticAnchor.segmentStableId)
}

async function updateAnnotationToCurrentTranslation(annotation: PaperAnnotation): Promise<void> {
  const segment = renderedSegments.value.find(
    (item) => item.stableId === annotation.semanticAnchor.segmentStableId
  )
  if (!segment || !segment.translationText || !annotation.originalAnchor) {
    startRebind(annotation)
    return
  }

  const mapped = mapPaperTextAnchorBetweenTexts(
    segment.originalText,
    segment.translationText,
    annotation.originalAnchor
  )
  if (!mapped || mapped.confidence < 0.58) {
    startRebind(annotation)
    return
  }

  const payload: ReanchorPaperAnnotationPayload = {
    paperId: props.paperId,
    annotationId: annotation.id,
    semanticAnchor: {
      segmentStableId: segment.stableId,
      renderSegmentIdAtCreation: segment.renderId,
      sourceRevisionId: segment.sourceRevisionId,
      segmentTextHash: segment.textHash,
      sourceRefs:
        getSourceSegments().find((item) => item.stableId === segment.stableId)?.sourceRefs ||
        EMPTY_SOURCE_REFS
    },
    originalAnchor: annotation.originalAnchor,
    translationAnchor: createTranslationAnchorPayload(mapped.anchor),
    selectedTextSnapshot: mapped.anchor.selectedText,
    contextBefore: mapped.anchor.prefixText,
    contextAfter: mapped.anchor.suffixText,
    comment: annotation.comment,
    color: annotation.color
  }

  const result = await paperReaderStore.reanchorAnnotation(payload)
  if (result.success) {
    ignoredOutdatedAnnotationIds.value = {
      ...ignoredOutdatedAnnotationIds.value,
      [annotation.id]: true
    }
    return
  }

  composerError.value = result.error || '更新到当前译文失败'
  startRebind(annotation)
}

function updateComposerFromSelection(): void {
  if (typeof window === 'undefined') {
    return
  }

  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
    return
  }

  const range = selection.getRangeAt(0)
  const startSurface =
    range.startContainer instanceof Element
      ? range.startContainer.closest<HTMLElement>('[data-paper-selection-surface="true"]')
      : range.startContainer.parentElement?.closest<HTMLElement>(
          '[data-paper-selection-surface="true"]'
        )
  const endSurface =
    range.endContainer instanceof Element
      ? range.endContainer.closest<HTMLElement>('[data-paper-selection-surface="true"]')
      : range.endContainer.parentElement?.closest<HTMLElement>(
          '[data-paper-selection-surface="true"]'
        )

  if (!startSurface || !endSurface || startSurface !== endSurface) {
    return
  }

  if (!startSurface.contains(range.startContainer) || !startSurface.contains(range.endContainer)) {
    return
  }

  const selectedText = selection.toString().trim()
  if (!selectedText) {
    return
  }

  const segment = renderedSegments.value.find((item) => {
    return item.stableId === startSurface.dataset.segmentStableId
  })
  if (!segment) {
    return
  }

  const textContent = startSurface.textContent || ''
  const startOffset = getSelectionTextOffset(startSurface, range.startContainer, range.startOffset)
  const endOffset = getSelectionTextOffset(startSurface, range.endContainer, range.endOffset)
  if (startOffset >= endOffset) {
    return
  }

  const textAnchor = buildPaperTextAnchor(textContent, startOffset, endOffset)
  const rect = range.getBoundingClientRect()
  const viewKind = (startSurface.dataset.viewKind as 'original' | 'translation') || 'original'
  const renderSourceSegment = getSourceSegments().find((item) => item.stableId === segment.stableId)
  if (!renderSourceSegment) {
    return
  }

  const targetAnnotation = getAnnotationById(rebindAnnotationId.value)
  const mappedOriginalAnchor =
    viewKind === 'translation' && segment.translationText
      ? mapPaperTextAnchorBetweenTexts(segment.translationText, segment.originalText, textAnchor)
      : null
  const mappedTranslationAnchor =
    viewKind === 'original' && segment.translationText
      ? mapPaperTextAnchorBetweenTexts(segment.originalText, segment.translationText, textAnchor)
      : null

  composerDraft.value = {
    mode: targetAnnotation ? 'rebind' : 'create',
    annotationId: targetAnnotation?.id,
    viewKind,
    noteType:
      targetAnnotation?.noteType ||
      (viewKind === 'original' ? 'original_span' : 'translation_view'),
    segmentStableId: segment.stableId,
    renderSegmentId: segment.renderId,
    sourceRevisionId: segment.sourceRevisionId,
    segmentTextHash: segment.textHash,
    sourceRefs: renderSourceSegment.sourceRefs,
    selectedText: textAnchor.selectedText,
    contextBefore: textContent.slice(Math.max(0, startOffset - 64), startOffset),
    contextAfter: textContent.slice(endOffset, Math.min(textContent.length, endOffset + 64)),
    originalAnchor:
      viewKind === 'original'
        ? textAnchor
        : mappedOriginalAnchor && mappedOriginalAnchor.confidence >= 0.58
          ? mappedOriginalAnchor.anchor
          : undefined,
    translationAnchor:
      viewKind === 'translation'
        ? textAnchor
        : mappedTranslationAnchor && mappedTranslationAnchor.confidence >= 0.58
          ? mappedTranslationAnchor.anchor
          : undefined,
    x: Math.min(window.innerWidth - 456, Math.max(16, rect.left - 16)),
    y: Math.min(window.innerHeight - 420, Math.max(16, rect.bottom + 12))
  }
  composerComment.value = targetAnnotation?.comment || ''
  composerColor.value = targetAnnotation?.color || DEFAULT_ANNOTATION_COLOR
  composerError.value = null
}

async function handleCreateAnnotation(): Promise<void> {
  if (!composerDraft.value) {
    return
  }

  const comment = composerComment.value.trim()
  if (!comment) {
    composerError.value = '请先填写笔记内容'
    return
  }

  composerSaving.value = true
  composerError.value = null
  const draft = composerDraft.value

  try {
    const semanticAnchor = {
      segmentStableId: draft.segmentStableId,
      renderSegmentIdAtCreation: draft.renderSegmentId,
      sourceRevisionId: draft.sourceRevisionId,
      segmentTextHash: draft.segmentTextHash,
      sourceRefs: draft.sourceRefs
    }
    const translationAnchor = createTranslationAnchorPayload(draft.translationAnchor)
    const result =
      draft.mode === 'rebind' && draft.annotationId
        ? await paperReaderStore.reanchorAnnotation({
            paperId: props.paperId,
            annotationId: draft.annotationId,
            semanticAnchor,
            originalAnchor: draft.originalAnchor,
            translationAnchor,
            selectedTextSnapshot: draft.selectedText,
            contextBefore: draft.contextBefore,
            contextAfter: draft.contextAfter,
            comment,
            color: composerColor.value
          } satisfies ReanchorPaperAnnotationPayload)
        : await paperReaderStore.createAnnotation({
            paperId: props.paperId,
            noteType: draft.noteType,
            createdInView: draft.viewKind,
            semanticAnchor,
            originalAnchor: draft.originalAnchor,
            translationAnchor,
            selectedTextSnapshot: draft.selectedText,
            contextBefore: draft.contextBefore,
            contextAfter: draft.contextAfter,
            comment,
            color: composerColor.value
          } satisfies CreatePaperAnnotationPayload)

    if (!result.success) {
      composerSaving.value = false
      composerError.value =
        result.error || (draft.mode === 'rebind' ? '重新绑定笔记失败' : '创建笔记失败')
      return
    }

    if (draft.mode === 'rebind') {
      cancelRebindMode()
    }
    window.getSelection()?.removeAllRanges()
    clearComposer()
  } catch (error) {
    composerSaving.value = false
    composerError.value =
      error instanceof Error ? error.message : String(error) || '操作失败，请重试'
  }
}

async function handleDeleteAnnotation(annotationId: string): Promise<void> {
  if (!props.paperId) {
    return
  }

  await paperReaderStore.deleteAnnotation(props.paperId, annotationId)
  if (rebindAnnotationId.value === annotationId) {
    cancelRebindMode()
  }
  if (composerDraft.value?.annotationId === annotationId) {
    clearComposer()
  }
}

function getAnnotationTypeLabel(annotation: PaperAnnotation): string {
  return annotation.noteType === 'original_span' ? '原文锚定' : '译文视图'
}

function getAnnotationStatusLabel(annotation: PaperAnnotation): string | null {
  if (annotation.status === 'translation_missing') {
    return '译文缺失'
  }
  if (annotation.status === 'needs_reanchor') {
    return '待重新定位'
  }
  if (annotation.status === 'invalid') {
    return '数据异常'
  }

  if (isAnnotationOutdated(annotation)) {
    return '旧译文'
  }

  return null
}

function dismissOutdatedAnnotation(annotationId: string): void {
  ignoredOutdatedAnnotationIds.value = {
    ...ignoredOutdatedAnnotationIds.value,
    [annotationId]: true
  }
}

function handleDocumentPointerDown(event: MouseEvent): void {
  const target = event.target as HTMLElement | null
  if (!target) {
    return
  }

  if (target.closest('.paper-markdown-view__composer')) {
    return
  }

  clearComposer()
}

function handleDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    clearComposer()
    cancelRebindMode()
  }
}

watch(
  () => [
    props.content,
    props.basePath,
    props.translationVisible,
    props.translationCache?.updatedAt,
    props.translationCache?.completedSegments,
    props.translationCache?.translationRevisionId,
    props.readerDocument?.sourceRevisionId,
    currentAnnotations.value.length,
    currentAnnotations.value.map((annotation) => annotation.updatedAt).join('|')
  ],
  () => {
    renderContent()
    clearComposer()
    cancelRebindMode()
  },
  { immediate: true }
)

const hasContent = computed(() => !!props.content.trim())

if (typeof document !== 'undefined') {
  document.addEventListener('mousedown', handleDocumentPointerDown)
  document.addEventListener('keydown', handleDocumentKeyDown)
}

onBeforeUnmount(() => {
  paperReaderStore.clearPaperToc()
  if (typeof document !== 'undefined') {
    document.removeEventListener('mousedown', handleDocumentPointerDown)
    document.removeEventListener('keydown', handleDocumentKeyDown)
  }
})
</script>

<template>
  <div class="paper-markdown-view">
    <div class="paper-markdown-view__scroll" @mouseup="updateComposerFromSelection">
      <div v-if="loading" class="paper-markdown-view__loading">
        <p>正在加载内容...</p>
      </div>

      <div v-else-if="parseError" class="paper-markdown-view__error">
        <p>{{ parseError }}</p>
      </div>

      <div v-else-if="!hasContent" class="paper-markdown-view__empty">
        <p>暂无内容</p>
      </div>

      <article v-else class="paper-markdown-view__content">
        <section
          v-if="translationMissingAnnotations.length > 0"
          class="paper-markdown-view__status-panel paper-markdown-view__status-panel--warning"
        >
          <div class="paper-markdown-view__status-title">译文已删除，但相关笔记仍然保留</div>
          <p class="paper-markdown-view__status-text">
            {{ translationMissingAnnotations.length }} 条译文笔记已自动降级到原文语义归属，
            重新翻译后可以继续恢复到译文视图。
          </p>
          <div class="paper-markdown-view__status-actions">
            <button
              class="sm-button sm-button--primary"
              type="button"
              @click="paperReaderStore.toggleTranslationVisible()"
            >
              重新翻译
            </button>
            <button
              class="sm-button sm-button--secondary"
              type="button"
              @click="paperReaderStore.hideTranslation()"
            >
              在原文中查看
            </button>
          </div>
        </section>

        <section
          v-if="outdatedAnnotations.length > 0"
          class="paper-markdown-view__status-panel paper-markdown-view__status-panel--info"
        >
          <div class="paper-markdown-view__status-title">检测到基于旧版译文创建的笔记</div>
          <p class="paper-markdown-view__status-text">
            当前共有 {{ outdatedAnnotations.length }} 条笔记依赖旧译文版本。系统会优先保留原文归属，
            你可以直接更新到当前译文，或手动重新绑定到新的选区。
          </p>
        </section>

        <section
          v-if="orphanAnnotations.length > 0 || rebindAnnotationId"
          class="paper-markdown-view__manager"
        >
          <div class="paper-markdown-view__manager-header">
            <div>
              <div class="paper-markdown-view__manager-title">异常笔记管理</div>
              <p class="paper-markdown-view__manager-text">
                这里集中显示需要人工确认的笔记。点击“手动重新绑定”后，直接在正文里重新选择对应文本即可。
              </p>
            </div>
            <button
              v-if="rebindAnnotationId"
              class="sm-button sm-button--secondary"
              type="button"
              @click="handleCancelComposer"
            >
              取消重绑
            </button>
          </div>

          <article
            v-for="annotation in orphanAnnotations"
            :key="annotation.id"
            class="paper-markdown-view__manager-card"
            :class="{
              'paper-markdown-view__manager-card--active': rebindAnnotationId === annotation.id
            }"
          >
            <div class="paper-markdown-view__manager-meta">
              <span class="paper-markdown-view__note-type">
                {{ getAnnotationTypeLabel(annotation) }}
              </span>
              <span class="paper-markdown-view__note-status">
                {{ getAnnotationStatusLabel(annotation) || '待人工处理' }}
              </span>
            </div>
            <div class="paper-markdown-view__manager-comment">{{ annotation.comment }}</div>
            <div class="paper-markdown-view__manager-selection">
              {{ annotation.selectedTextSnapshot }}
            </div>
            <div class="paper-markdown-view__status-actions">
              <button
                class="sm-button sm-button--secondary"
                type="button"
                @click="startRebind(annotation)"
              >
                手动重新绑定
              </button>
              <button
                class="sm-button sm-button--secondary"
                type="button"
                @click="scrollToSegment(annotation.semanticAnchor.segmentStableId)"
              >
                查看当前段落
              </button>
              <button
                class="sm-button sm-button--danger"
                type="button"
                @click="handleDeleteAnnotation(annotation.id)"
              >
                删除笔记
              </button>
            </div>
          </article>
        </section>

        <section
          v-for="segment in renderedSegments"
          :id="segment.segmentAnchorId"
          :key="segment.renderId"
          class="paper-markdown-view__segment"
          :class="{ 'paper-markdown-view__segment--meta': segment.isCenteredMeta }"
          :data-paper-segment-stable-id="segment.stableId"
        >
          <div v-if="segment.annotations.length > 0" class="paper-markdown-view__segment-tag">
            {{ segment.annotations.length }} 条笔记
          </div>

          <div
            class="paper-markdown-view__segment-original paper-markdown-view__markdown"
            data-paper-selection-surface="true"
            data-view-kind="original"
            :data-segment-stable-id="segment.stableId"
          >
            <!-- eslint-disable-next-line vue/no-v-html -->
            <div v-html="segment.originalHtml" />
          </div>

          <div
            v-if="segment.showTranslation"
            class="paper-markdown-view__segment-translation"
            :class="`is-${segment.translationStatus}`"
          >
            <div
              v-if="segment.translationHtml"
              class="paper-markdown-view__segment-translation-body paper-markdown-view__markdown"
              data-paper-selection-surface="true"
              data-view-kind="translation"
              :data-segment-stable-id="segment.stableId"
            >
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div v-html="segment.translationHtml" />
            </div>

            <div
              v-else-if="segment.translationStatus === 'failed'"
              class="paper-markdown-view__translation-error"
            >
              该段翻译暂时失败，再次点击翻译按钮时会继续补全剩余内容。
            </div>

            <div v-else class="paper-markdown-view__translation-placeholder" aria-hidden="true">
              <span class="paper-markdown-view__translation-placeholder-text">正在翻译...</span>
              <span class="paper-markdown-view__translation-placeholder-bar" />
              <span class="paper-markdown-view__translation-placeholder-bar" />
              <span class="paper-markdown-view__translation-placeholder-bar" />
            </div>
          </div>

          <div v-if="segment.annotations.length > 0" class="paper-markdown-view__notes">
            <article
              v-for="annotation in segment.annotations"
              :key="annotation.id"
              class="paper-markdown-view__note"
            >
              <div class="paper-markdown-view__note-meta">
                <span class="paper-markdown-view__note-type">
                  {{ getAnnotationTypeLabel(annotation) }}
                </span>
                <span
                  v-if="getAnnotationStatusLabel(annotation)"
                  class="paper-markdown-view__note-status"
                >
                  {{ getAnnotationStatusLabel(annotation) }}
                </span>
              </div>
              <div class="paper-markdown-view__note-comment">{{ annotation.comment }}</div>
              <div class="paper-markdown-view__note-selection">
                {{ annotation.selectedTextSnapshot }}
              </div>
              <div
                v-if="isAnnotationOutdated(annotation)"
                class="paper-markdown-view__note-banner paper-markdown-view__note-banner--info"
              >
                <div class="paper-markdown-view__note-banner-title">该笔记基于旧版译文创建</div>
                <div class="paper-markdown-view__note-banner-text">
                  当前译文版本已更新，若高亮位置有偏移，可以一键更新到当前译文，或手动重新选择。
                </div>
                <div class="paper-markdown-view__status-actions">
                  <button
                    class="sm-button sm-button--secondary"
                    type="button"
                    @click="paperReaderStore.hideTranslation()"
                  >
                    查看原文位置
                  </button>
                  <button
                    class="sm-button sm-button--primary"
                    type="button"
                    @click="updateAnnotationToCurrentTranslation(annotation)"
                  >
                    更新到当前译文
                  </button>
                  <button
                    class="sm-button sm-button--secondary"
                    type="button"
                    @click="dismissOutdatedAnnotation(annotation.id)"
                  >
                    忽略
                  </button>
                </div>
              </div>
              <div class="paper-markdown-view__note-actions">
                <button
                  v-if="annotation.status === 'needs_reanchor' || annotation.status === 'invalid'"
                  class="sm-button sm-button--secondary sm-button--small"
                  type="button"
                  @click="startRebind(annotation)"
                >
                  手动重新绑定
                </button>
                <button
                  class="paper-markdown-view__note-delete"
                  type="button"
                  @click="handleDeleteAnnotation(annotation.id)"
                >
                  删除
                </button>
              </div>
            </article>
          </div>
        </section>
      </article>
    </div>

    <div
      v-if="composerDraft"
      class="paper-markdown-view__composer"
      :style="{ left: `${composerDraft.x}px`, top: `${composerDraft.y}px` }"
    >
      <div class="paper-markdown-view__composer-title">
        {{
          composerDraft.mode === 'rebind'
            ? composerDraft.viewKind === 'original'
              ? '重新绑定到原文位置'
              : '重新绑定到译文位置'
            : composerDraft.viewKind === 'original'
              ? '新增原文笔记'
              : '新增译文视图笔记'
        }}
      </div>
      <div class="paper-markdown-view__composer-selection">
        {{ composerDraft.selectedText }}
      </div>
      <textarea
        v-model="composerComment"
        class="paper-markdown-view__composer-input"
        rows="7"
        placeholder="写下这段内容的笔记..."
      />
      <div class="paper-markdown-view__composer-row">
        <input v-model="composerColor" class="paper-markdown-view__composer-color" type="color" />
        <button class="sm-button sm-button--secondary" type="button" @click="handleCancelComposer">
          {{ composerDraft.mode === 'rebind' ? '取消重绑' : '取消' }}
        </button>
        <button
          class="sm-button sm-button--primary"
          type="button"
          :disabled="composerSaving"
          @click="handleCreateAnnotation"
        >
          {{
            composerSaving
              ? '保存中...'
              : composerDraft.mode === 'rebind'
                ? '确认重新绑定'
                : '保存笔记'
          }}
        </button>
      </div>
      <p v-if="composerError" class="paper-markdown-view__composer-error">{{ composerError }}</p>
      <p v-if="composerDraft.mode === 'rebind'" class="paper-markdown-view__composer-hint">
        当前正在重绑已有笔记。保存后会保留原始创建时间，只更新定位与笔记内容。
      </p>
      <p v-if="composerDraft.viewKind === 'translation'" class="paper-markdown-view__composer-hint">
        该笔记会归属于当前原文段落语义，译文位置依赖当前翻译版本。
      </p>
    </div>
  </div>
</template>

<style scoped>
.paper-markdown-view {
  flex: 1;
  width: 100%;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.paper-markdown-view__scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding: var(--sm-space-3) var(--sm-space-4) var(--sm-space-6);
}

.paper-markdown-view__loading,
.paper-markdown-view__error,
.paper-markdown-view__empty {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 200px;
  font-size: 14px;
  color: var(--sm-color-text-tertiary);
}

.paper-markdown-view__error {
  color: var(--sm-color-status-danger);
}

.paper-markdown-view__content {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.paper-markdown-view__status-panel,
.paper-markdown-view__manager {
  margin-bottom: var(--sm-space-4);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 16px;
  background: var(--sm-color-surface-1);
  padding: var(--sm-space-4);
}

.paper-markdown-view__status-panel--warning {
  background: linear-gradient(180deg, var(--sm-color-surface-1), var(--sm-color-surface-2));
}

.paper-markdown-view__status-panel--info {
  background: linear-gradient(
    180deg,
    color-mix(in srgb, var(--sm-color-accent-08) 70%, var(--sm-color-surface-1)),
    var(--sm-color-surface-1)
  );
}

.paper-markdown-view__status-title,
.paper-markdown-view__manager-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__status-text,
.paper-markdown-view__manager-text {
  margin: 8px 0 0;
  font-size: 13px;
  line-height: 1.7;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__manager-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--sm-space-3);
}

.paper-markdown-view__manager-card {
  margin-top: var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 14px;
  background: var(--sm-color-surface-2);
  padding: var(--sm-space-3);
}

.paper-markdown-view__manager-card--active {
  border-color: var(--sm-color-border-accent);
  background: color-mix(in srgb, var(--sm-color-accent-08) 68%, var(--sm-color-surface-2));
}

.paper-markdown-view__manager-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--sm-space-2);
  align-items: center;
}

.paper-markdown-view__manager-comment {
  margin-top: var(--sm-space-2);
  font-size: 13px;
  line-height: 1.75;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__manager-selection {
  margin-top: var(--sm-space-2);
  font-size: 12px;
  line-height: 1.65;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__segment {
  position: relative;
}

.paper-markdown-view__segment + .paper-markdown-view__segment {
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__segment-tag {
  position: absolute;
  top: -8px;
  right: 0;
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--sm-color-accent-12);
  color: var(--sm-color-text-secondary);
  font-size: 11px;
  z-index: 1;
}

.paper-markdown-view__segment-original,
.paper-markdown-view__segment-translation {
  box-sizing: border-box;
}

.paper-markdown-view__segment-translation {
  margin-top: var(--sm-space-2);
}

.paper-markdown-view__segment-translation.is-queued,
.paper-markdown-view__segment-translation.is-translating {
  opacity: 0.9;
}

.paper-markdown-view__translation-error {
  color: var(--sm-color-text-secondary);
  font-size: 13px;
  line-height: 1.7;
}

.paper-markdown-view__translation-placeholder {
  display: grid;
  gap: var(--sm-space-2);
  padding: var(--sm-space-1) 0;
}

.paper-markdown-view__translation-placeholder-text {
  display: block;
  font-size: 13px;
  color: var(--sm-color-text-tertiary);
  margin-bottom: var(--sm-space-1);
}

.paper-markdown-view__translation-placeholder-bar {
  display: block;
  width: 100%;
  height: 12px;
  border-radius: 999px;
  background: linear-gradient(
    90deg,
    color-mix(in srgb, var(--sm-color-border-subtle) 65%, transparent) 0%,
    color-mix(in srgb, var(--sm-color-text-tertiary) 16%, transparent) 50%,
    color-mix(in srgb, var(--sm-color-border-subtle) 65%, transparent) 100%
  );
  background-size: 180% 100%;
  animation: paper-translation-breathe 1.8s ease-in-out infinite;
}

.paper-markdown-view__translation-placeholder-bar:nth-child(2) {
  width: 92%;
  animation-delay: 0.12s;
}

.paper-markdown-view__translation-placeholder-bar:nth-child(3) {
  width: 78%;
  animation-delay: 0.24s;
}

.paper-markdown-view__markdown {
  width: 100%;
  font-size: 15px;
  line-height: 1.75;
  color: var(--sm-color-text-primary);
  user-select: text;
  box-sizing: border-box;
  overflow-x: hidden;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

.paper-markdown-view__segment-translation-body {
  width: 100%;
}

.paper-markdown-view__segment--meta .paper-markdown-view__markdown {
  text-align: center;
}

.paper-markdown-view__notes {
  display: grid;
  gap: 8px;
  margin-top: 10px;
}

.paper-markdown-view__note {
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  border-radius: 12px;
  padding: 12px 14px;
}

.paper-markdown-view__note-meta {
  display: flex;
  gap: 8px;
  align-items: center;
  margin-bottom: 6px;
}

.paper-markdown-view__note-type,
.paper-markdown-view__note-status {
  display: inline-flex;
  align-items: center;
  padding: 2px 8px;
  border-radius: 999px;
  font-size: 11px;
  line-height: 1.4;
}

.paper-markdown-view__note-type {
  background: var(--sm-color-accent-12);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__note-status {
  background: color-mix(in srgb, var(--sm-color-status-warning) 18%, transparent);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__note-comment {
  font-size: 13px;
  line-height: 1.7;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__note-selection {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-tertiary);
}

.paper-markdown-view__note-banner {
  margin-top: var(--sm-space-3);
  border: 1px solid var(--sm-color-border-default);
  border-radius: 12px;
  padding: 12px;
  background: var(--sm-color-surface-2);
}

.paper-markdown-view__note-banner--info {
  border-color: var(--sm-color-border-accent);
  background: color-mix(in srgb, var(--sm-color-accent-08) 72%, var(--sm-color-surface-2));
}

.paper-markdown-view__note-banner-title {
  font-size: 13px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__note-banner-text {
  margin-top: 6px;
  font-size: 12px;
  line-height: 1.65;
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__note-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sm-space-2);
  margin-top: var(--sm-space-3);
}

.paper-markdown-view__note-delete {
  border: none;
  background: transparent;
  color: var(--sm-color-text-secondary);
  font-size: 12px;
  cursor: pointer;
  padding: 0;
}

.paper-markdown-view__composer {
  position: fixed;
  width: min(440px, calc(100vw - 32px));
  min-height: 320px;
  padding: 18px;
  border-radius: 18px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-1);
  box-shadow:
    0 24px 56px rgba(15, 23, 42, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.04);
  z-index: 20;
  backdrop-filter: blur(18px);
}

.paper-markdown-view__composer-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__composer-selection {
  margin-top: 8px;
  padding: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-subtle);
  background: var(--sm-color-surface-2);
  font-size: 12px;
  line-height: 1.6;
  color: var(--sm-color-text-secondary);
  max-height: 104px;
  overflow: auto;
}

.paper-markdown-view__composer-input {
  width: 100%;
  min-height: 180px;
  margin-top: 12px;
  border-radius: 12px;
  border: 1px solid var(--sm-color-border-default);
  background: var(--sm-color-surface-2);
  color: var(--sm-color-text-primary);
  padding: 12px;
  resize: vertical;
  font: inherit;
  box-sizing: border-box;
}

.paper-markdown-view__composer-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}

.paper-markdown-view__composer-color {
  width: 40px;
  height: 40px;
  padding: 0;
  border: 1px solid var(--sm-color-border-default);
  border-radius: 12px;
  background: var(--sm-color-surface-2);
}

.paper-markdown-view__composer-error {
  margin: 8px 0 0;
  color: var(--sm-color-status-danger);
  font-size: 12px;
}

.paper-markdown-view__composer-hint {
  margin: 8px 0 0;
  color: var(--sm-color-text-tertiary);
  font-size: 12px;
  line-height: 1.6;
}

.paper-markdown-view__markdown > :first-child {
  margin-top: 0;
}

.paper-markdown-view__markdown > :last-child {
  margin-bottom: 0;
}

.paper-markdown-view__markdown :deep(mark.paper-annotation-highlight) {
  border-radius: 4px;
  color: inherit;
  padding: 0 1px;
}

.paper-markdown-view__markdown :deep(h1) {
  font-size: 24px;
  font-weight: 700;
  line-height: 1.3;
  margin: 1.2em 0 0.6em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(h2) {
  font-size: 20px;
  font-weight: 600;
  line-height: 1.35;
  margin: 1.1em 0 0.55em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(h3) {
  font-size: 17px;
  font-weight: 600;
  line-height: 1.4;
  margin: 1em 0 0.5em;
  color: var(--sm-color-text-primary);
}

.paper-markdown-view__markdown :deep(p) {
  margin: 0.8em 0;
}

.paper-markdown-view__markdown :deep(a) {
  color: var(--sm-color-accent-hover);
  text-decoration: underline;
  text-underline-offset: 2px;
}

.paper-markdown-view__markdown :deep(a:hover) {
  opacity: 0.85;
}

.paper-markdown-view__markdown :deep(eq) {
  display: inline-block;
  vertical-align: baseline;
}

.paper-markdown-view__markdown :deep(eqn) {
  display: block;
}

.paper-markdown-view__markdown :deep(.katex) {
  font-size: 1em;
}

.paper-markdown-view__markdown :deep(.katex-display) {
  margin: 1.25em 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 0.2em 0;
}

.paper-markdown-view__markdown :deep(.katex-display > .katex) {
  display: inline-block;
  min-width: min-content;
}

.paper-markdown-view__markdown :deep(pre) {
  margin: 1em 0;
  padding: var(--sm-space-4);
  border-radius: var(--sm-radius-sm);
  background: var(--sm-color-surface-1);
  font-family: var(--sm-font-mono);
  font-size: 13px;
  line-height: 1.6;
  overflow-x: auto;
}

.paper-markdown-view__markdown :deep(code) {
  font-family: var(--sm-font-mono);
  font-size: 0.9em;
}

.paper-markdown-view__markdown :deep(:not(pre) > code) {
  padding: 2px 6px;
  border-radius: 4px;
  background: var(--sm-color-surface-hover);
  font-size: 0.88em;
}

.paper-markdown-view__markdown :deep(img) {
  max-width: 100%;
  height: auto;
  border-radius: 8px;
  margin: 16px auto;
  display: block;
}

.paper-markdown-view__markdown :deep(.paper-markdown-view__table-wrap) {
  display: block;
  width: 100%;
  max-width: 100%;
  margin: 1em 0;
  overflow-x: auto;
  overflow-y: hidden;
  -webkit-overflow-scrolling: touch;
  scrollbar-gutter: stable both-edges;
}

.paper-markdown-view__markdown :deep(.paper-markdown-view__table-wrap > table) {
  width: max-content;
  min-width: 100%;
  margin: 0;
  border-collapse: collapse;
  border-spacing: 0;
  table-layout: auto;
  font-size: 14px;
}

.paper-markdown-view__markdown :deep(th),
.paper-markdown-view__markdown :deep(td) {
  padding: var(--sm-space-2) var(--sm-space-3);
  border: 1px solid var(--sm-color-border-subtle);
  text-align: left;
  vertical-align: top;
}

.paper-markdown-view__markdown :deep(th) {
  font-weight: 600;
  background: var(--sm-color-surface-1);
}

.paper-markdown-view__markdown :deep(blockquote) {
  margin: 1em 0;
  padding: var(--sm-space-3) var(--sm-space-4);
  border-left: 3px solid var(--sm-color-border-strong);
  border-radius: 0 var(--sm-radius-sm) var(--sm-radius-sm) 0;
  background: var(--sm-color-surface-1);
  color: var(--sm-color-text-secondary);
}

.paper-markdown-view__markdown :deep(blockquote p) {
  margin: 0.4em 0;
}

.paper-markdown-view__markdown :deep(ul),
.paper-markdown-view__markdown :deep(ol) {
  margin: 0.6em 0;
  padding-inline-start: 2.8em;
}

.paper-markdown-view__markdown :deep(li) {
  margin: 0.25em 0;
}

.paper-markdown-view__markdown :deep(li > p) {
  margin: 0.2em 0;
}

.paper-markdown-view__markdown :deep(li > ul),
.paper-markdown-view__markdown :deep(li > ol) {
  margin: 0.25em 0;
}

@keyframes paper-translation-breathe {
  0%,
  100% {
    background-position: 0% 50%;
  }

  50% {
    background-position: 100% 50%;
  }
}
</style>
