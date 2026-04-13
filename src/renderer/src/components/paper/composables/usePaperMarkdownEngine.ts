import { ref, toRaw, type Ref } from 'vue'
import MarkdownIt from 'markdown-it'
import texmath from 'markdown-it-texmath'
import katex from 'katex'
import type {
  PaperAnnotation,
  PaperReaderDocument,
  PaperReaderSegment,
  PaperReaderSegmentSourceRefs,
  PaperTocItem,
  PaperTocOutline,
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationSegmentKind,
  PaperTranslationStatus
} from '@shared/types/paper'
import { normalizePaperMarkdownForRender } from '@shared/utils/paperMarkdown'
import {
  buildPaperTocOutline,
  isPaperAffiliationLikeSegment,
  isPaperAuthorLikeSegment,
  parsePaperTranslationSegments,
  stripPaperTranslationMarkdown
} from '@shared/utils/paperTranslation'
import {
  usePaperHighlightRenderer,
  type RenderSourceSegment,
  type QuoteHighlight
} from './usePaperHighlightRenderer'
import 'katex/dist/katex.min.css'
import 'markdown-it-texmath/css/texmath.css'

export type { RenderSourceSegment, QuoteHighlight }

export interface RenderedSegment {
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

const EMPTY_SOURCE_REFS: PaperReaderSegmentSourceRefs = {
  pageIndexes: [],
  blockIndexes: []
}

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

export interface PaperMarkdownEngineOptions {
  content: () => string
  basePath: () => string | undefined
  translationVisible: () => boolean
  translationCache: () => PaperTranslationCache | null | undefined
  readerDocument: () => PaperReaderDocument | null | undefined
  annotations: () => PaperAnnotation[] | undefined
  setTocOutline: (outline: PaperTocOutline) => void
  clearToc: () => void
}

export interface PaperMarkdownEngine {
  renderedSegments: Ref<RenderedSegment[]>
  parseError: Ref<string | null>
  getSourceSegments: () => RenderSourceSegment[]
  renderContent: () => void
}

export function usePaperMarkdownEngine(options: PaperMarkdownEngineOptions): PaperMarkdownEngine {
  const renderedSegments = ref<RenderedSegment[]>([])
  const parseError = ref<string | null>(null)

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

  const highlighter = usePaperHighlightRenderer()

  function renderMarkdownBlock(
    markdown: string,
    kind: PaperTranslationSegmentKind,
    headingId?: string
  ): string {
    const normalizedContent = normalizeInlineMath(normalizePaperMarkdownForRender(markdown, kind))
    const rawHtml = markdownRenderer.render(normalizedContent)
    const resolvedHtml = resolveImagePaths(rawHtml, options.basePath())
    return postProcessRenderedHtml(resolvedHtml, headingId)
  }

  function getSourceSegments(): RenderSourceSegment[] {
    const rawDocument = options.readerDocument() ? toRaw(options.readerDocument()!) : null
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

    return createFallbackSourceSegments(options.content())
  }

  function buildTocAndRenderedSegments(): {
    outline: PaperTocOutline
    segments: RenderedSegment[]
  } {
    const sourceSegments = getSourceSegments()
    const rendered: RenderedSegment[] = []
    const translationMap = new Map<string, PaperTranslationEntry>()
    const frontMatterMetadataIds = collectFrontMatterMetadataIds(sourceSegments)
    const currentAnnotations = options.annotations() ?? []
    const outline = buildPaperTocOutline(
      sourceSegments.map((segment) => ({
        id: segment.renderId,
        index: segment.index,
        kind: segment.kind,
        originalMarkdown: segment.originalMarkdown,
        originalText: segment.originalText
      })),
      options.translationCache()?.entries ?? []
    )
    const outlineEntryMap = new Map<string, PaperTocItem | PaperTocOutline['documentTitle']>()
    const annotationsBySegmentId = new Map<string, PaperAnnotation[]>()

    for (const annotation of currentAnnotations) {
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

    for (const entry of options.translationCache()?.entries ?? []) {
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

      const originalHtml = highlighter.applyHighlightsToHtml(
        renderMarkdownBlock(segment.originalMarkdown, segment.kind, headingId),
        highlighter.collectOriginalHighlights(segment, annotations)
      )

      const translationHtml =
        translationEntry &&
        translationEntry.status === 'completed' &&
        translationEntry.translatedMarkdown
          ? highlighter.applyHighlightsToHtml(
              renderMarkdownBlock(translationEntry.translatedMarkdown, translationEntry.kind),
              highlighter.collectTranslationHighlights(translationText, annotations)
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
          options.translationVisible(),
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
    if (!options.content().trim()) {
      renderedSegments.value = []
      options.clearToc()
      return
    }

    try {
      const result = buildTocAndRenderedSegments()
      renderedSegments.value = result.segments
      options.setTocOutline(result.outline)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      parseError.value = `Markdown 解析失败: ${message}`
      renderedSegments.value = []
      options.clearToc()
    }
  }

  return {
    renderedSegments,
    parseError,
    getSourceSegments,
    renderContent
  }
}
