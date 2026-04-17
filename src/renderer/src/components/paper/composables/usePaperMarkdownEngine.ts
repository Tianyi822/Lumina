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
  buildBase64DataUrl,
  fileUrlToPath,
  getImageMimeTypeFromPath,
  isFileUrl
} from '@shared/utils'
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

const LOCAL_IMAGE_DATA_URL_CACHE_LIMIT = 200
const localImageDataUrlCache = new Map<string, Promise<string | null>>()

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

function resolveLocalImageFilePath(src: string, basePath: string | undefined): string | null {
  if (!src || /^(data:|blob:|https?:\/\/)/i.test(src)) {
    return null
  }

  if (isFileUrl(src)) {
    return fileUrlToPath(src)
  }

  const localAssetPath = String(src)
  if (!basePath || !localAssetPath.startsWith('assets/')) {
    return null
  }

  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  return `${normalizedBase}/${localAssetPath}`
}

function readLocalImageAsDataUrl(localFilePath: string): Promise<string | null> {
  const cached = localImageDataUrlCache.get(localFilePath)
  if (cached) {
    return cached
  }

  if (localImageDataUrlCache.size >= LOCAL_IMAGE_DATA_URL_CACHE_LIMIT) {
    const oldestKey = localImageDataUrlCache.keys().next().value
    if (oldestKey) {
      localImageDataUrlCache.delete(oldestKey)
    }
  }

  const pending = window.api.paper
    .readFileAsBase64(localFilePath)
    .then((result) => {
      if (!result.success || !result.data) {
        return null
      }

      return buildBase64DataUrl(result.data, getImageMimeTypeFromPath(localFilePath))
    })
    .catch(() => null)
  localImageDataUrlCache.set(localFilePath, pending)
  return pending
}

async function resolveImagePaths(html: string, basePath: string | undefined): Promise<string> {
  if (typeof DOMParser === 'undefined' || typeof window === 'undefined') {
    return html
  }

  const parser = new DOMParser()
  const document = parser.parseFromString(`<div>${html}</div>`, 'text/html')
  const root = document.body.firstElementChild
  if (!root) {
    return html
  }

  const images = Array.from(root.querySelectorAll('img'))
  await Promise.all(
    images.map(async (image) => {
      const src = image.getAttribute('src') || ''
      const localFilePath = resolveLocalImageFilePath(src, basePath)
      if (!localFilePath) {
        return
      }

      const dataUrl = await readLocalImageAsDataUrl(localFilePath)
      if (!dataUrl) {
        return
      }

      image.setAttribute('src', dataUrl)
    })
  )

  return root.innerHTML
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
  renderContent: () => Promise<void>
}

export function usePaperMarkdownEngine(options: PaperMarkdownEngineOptions): PaperMarkdownEngine {
  const renderedSegments = ref<RenderedSegment[]>([])
  const parseError = ref<string | null>(null)
  let renderRunId = 0

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

  async function renderMarkdownBlock(
    markdown: string,
    kind: PaperTranslationSegmentKind,
    headingId?: string
  ): Promise<string> {
    const normalizedContent = normalizeInlineMath(normalizePaperMarkdownForRender(markdown, kind))
    const rawHtml = markdownRenderer.render(normalizedContent)
    const resolvedHtml = await resolveImagePaths(rawHtml, options.basePath())
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

  async function buildTocAndRenderedSegments(): Promise<{
    outline: PaperTocOutline
    segments: RenderedSegment[]
  }> {
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
        await renderMarkdownBlock(segment.originalMarkdown, segment.kind, headingId),
        highlighter.collectOriginalHighlights(segment, annotations)
      )

      const translationHtml =
        translationEntry &&
        translationEntry.status === 'completed' &&
        translationEntry.translatedMarkdown
          ? highlighter.applyHighlightsToHtml(
              await renderMarkdownBlock(
                translationEntry.translatedMarkdown,
                translationEntry.kind
              ),
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

  async function renderContent(): Promise<void> {
    const currentRunId = ++renderRunId
    parseError.value = null
    if (!options.content().trim()) {
      renderedSegments.value = []
      options.clearToc()
      return
    }

    try {
      const result = await buildTocAndRenderedSegments()
      if (currentRunId !== renderRunId) {
        return
      }
      renderedSegments.value = result.segments
      options.setTocOutline(result.outline)
    } catch (error) {
      if (currentRunId !== renderRunId) {
        return
      }
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
