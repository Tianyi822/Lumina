/**
 * React hook：Markdown 渲染引擎
 *
 * 从 paper/composables/usePaperMarkdownEngine.ts 迁移。
 * 将 Vue ref/computed/watch 转换为 React useState/useRef/useCallback。
 */

import { useState, useRef, useCallback } from 'react'
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
import {
  normalizePaperInlineMathForRender,
  normalizePaperMarkdownForRender
} from '@shared/utils/paperMarkdown'
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
import { usePaperHighlightRenderer } from '../composables/usePaperHighlightRenderer'
import type { RenderSourceSegment, QuoteHighlight } from '../composables/usePaperHighlightRenderer'
import { postProcessRenderedHtml } from './paperMarkdownPostProcess'

export type { RenderSourceSegment, QuoteHighlight }

export function getTranslationRenderKey(cache: PaperTranslationCache | null | undefined): string {
  if (!cache) {
    return ''
  }

  return [
    cache.sourceHash,
    cache.translationRevisionId || '',
    cache.updatedAt,
    cache.completedSegments,
    cache.totalSegments,
    cache.entries
      .map((entry) =>
        [
          entry.id,
          entry.status,
          entry.updatedAt || '',
          entry.translatedText || '',
          entry.translatedMarkdown || ''
        ].join('')
      )
      .join('')
  ].join('')
}

export interface RenderedSegment {
  renderId: string
  stableId: string
  sourceRevisionId: string
  textHash: string
  kind: PaperTranslationSegmentKind
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

interface CachedHtmlResult {
  html: string
  failedIds: string[]
}

const LOCAL_IMAGE_DATA_URL_CACHE_LIMIT = 200
const SEGMENT_HTML_CACHE_LIMIT = 1800
const localImageDataUrlCache = new Map<string, Promise<string | null>>()
function setBoundedCacheValue<T>(
  cache: Map<string, T>,
  key: string,
  value: T,
  limit: number
): void {
  if (cache.size >= limit) {
    const oldestKey = cache.keys().next().value
    if (oldestKey) {
      cache.delete(oldestKey)
    }
  }
  cache.set(key, value)
}

async function getOrCreateCachedHtmlResult(
  cache: Map<string, CachedHtmlResult>,
  key: string,
  factory: () => Promise<CachedHtmlResult>
): Promise<CachedHtmlResult> {
  const cached = cache.get(key)
  if (cached) {
    return cached
  }

  const result = await factory()
  setBoundedCacheValue(cache, key, result, SEGMENT_HTML_CACHE_LIMIT)
  return result
}

function getSegmentAnnotationRenderKey(annotations: PaperAnnotation[]): string {
  return annotations
    .map((annotation) =>
      [
        annotation.id,
        annotation.kind,
        annotation.noteType,
        annotation.createdInView,
        annotation.colorKey,
        annotation.status,
        annotation.updatedAt,
        annotation.semanticAnchor.segmentTextHash,
        annotation.originalAnchor?.startOffset ?? '',
        annotation.originalAnchor?.endOffset ?? '',
        annotation.translationAnchor?.startOffset ?? '',
        annotation.translationAnchor?.endOffset ?? ''
      ].join('\u0002')
    )
    .join('\u0001')
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

function resolveLocalImageFilePath(src: string, basePath: string | undefined): string | null {
  if (!src || /^(data:|blob:|https?:\/\/|lumina:\/\/)/i.test(src)) {
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

/**
 * 将论文相对图片路径转换为 lumina:// 协议 URL
 * basePath 格式: /path/to/.lumina/papers/{paperId}
 * src 格式: assets/page-0001/figure-001.png
 */
function resolvePaperImageUrl(src: string, basePath: string | undefined): string | null {
  if (!src || /^(data:|blob:|https?:\/\/|lumina:\/\/)/i.test(src)) {
    return null
  }

  const localAssetPath = String(src)
  if (!basePath || !localAssetPath.startsWith('assets/')) {
    return null
  }

  // 从 basePath 提取 paperId（最后一个路径段）
  const normalizedBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath
  const lastSlash = normalizedBase.lastIndexOf('/')
  const paperId = lastSlash >= 0 ? normalizedBase.substring(lastSlash + 1) : ''
  if (!paperId) {
    return null
  }

  return `lumina://paper/${paperId}/${localAssetPath}`
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
      // 优先使用 lumina:// 协议 URL（避免 Base64 IPC 传输）
      const luminaUrl = resolvePaperImageUrl(src, basePath)
      if (luminaUrl) {
        image.setAttribute('src', luminaUrl)
        return
      }
      // fallback：使用 IPC 读取 Base64
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
  content: string
  basePath: string | undefined
  translationVisible: boolean
  translationCache: PaperTranslationCache | null | undefined
  readerDocument: PaperReaderDocument | null | undefined
  annotations: PaperAnnotation[]
  setTocOutline: (outline: PaperTocOutline) => void
  clearToc: () => void
}

export interface PaperMarkdownEngine {
  renderedSegments: RenderedSegment[]
  parseError: string | null
  getSourceSegments: () => RenderSourceSegment[]
  renderContent: () => Promise<void>
  unresolvedAnnotationIds: string[]
}

export function usePaperMarkdownEngine(options: PaperMarkdownEngineOptions): PaperMarkdownEngine {
  const [renderedSegments, setRenderedSegments] = useState<RenderedSegment[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [unresolvedAnnotationIds, setUnresolvedAnnotationIds] = useState<string[]>([])
  const renderRunIdRef = useRef(0)
  const originalHtmlCacheRef = useRef(new Map<string, CachedHtmlResult>())
  const translationHtmlCacheRef = useRef(new Map<string, CachedHtmlResult>())

  const markdownRendererRef = useRef(
    new MarkdownIt({
      html: true,
      breaks: true,
      linkify: true
    }).use(texmath, {
      engine: katex,
      delimiters: ['dollars', 'brackets', 'beg_end'],
      katexOptions: {
        throwOnError: false,
        strict: 'warn',
        output: 'htmlAndMathml',
        maxSize: 500,
        maxExpand: 1000
      }
    })
  )

  const highlighterRef = useRef(usePaperHighlightRenderer())

  const markdownRenderer = markdownRendererRef.current
  const highlighter = highlighterRef.current

  async function renderMarkdownBlock(
    markdown: string,
    kind: PaperTranslationSegmentKind,
    headingId?: string
  ): Promise<string> {
    const normalizedContent = normalizePaperInlineMathForRender(
      normalizePaperMarkdownForRender(markdown, kind),
      kind
    )
    const rawHtml = markdownRenderer.render(normalizedContent)
    const resolvedHtml = await resolveImagePaths(rawHtml, options.basePath)
    return postProcessRenderedHtml(
      resolvedHtml,
      (inlineContent) => markdownRenderer.renderInline(inlineContent),
      headingId
    )
  }

  function getSourceSegments(): RenderSourceSegment[] {
    if (options.readerDocument?.segments?.length) {
      return options.readerDocument.segments.map((segment: PaperReaderSegment) => ({
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

    return createFallbackSourceSegments(options.content)
  }

  async function buildTocAndRenderedSegments(): Promise<{
    outline: PaperTocOutline
    segments: RenderedSegment[]
    unresolvedAnnotationIds: string[]
  }> {
    const sourceSegments = getSourceSegments()
    const rendered: RenderedSegment[] = []
    const translationMap = new Map<string, PaperTranslationEntry>()
    const frontMatterMetadataIds = collectFrontMatterMetadataIds(sourceSegments)
    const currentAnnotations = options.annotations ?? []
    const outline = buildPaperTocOutline(
      sourceSegments.map((segment) => ({
        id: segment.renderId,
        index: segment.index,
        kind: segment.kind,
        originalMarkdown: segment.originalMarkdown,
        originalText: segment.originalText
      })),
      options.translationCache?.entries ?? []
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

    for (const entry of options.translationCache?.entries ?? []) {
      translationMap.set(entry.id, entry)
    }

    const allFailedIds: string[] = []

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
      const annotationRenderKey = getSegmentAnnotationRenderKey(annotations)

      const originalHtmlResult = await getOrCreateCachedHtmlResult(
        originalHtmlCacheRef.current,
        [
          segment.renderId,
          segment.sourceRevisionId,
          options.basePath ?? '',
          headingId ?? '',
          annotationRenderKey
        ].join('\u0001'),
        async () => {
          const originalCollect = highlighter.collectOriginalHighlights(segment, annotations)
          const originalHighlightResult = highlighter.applyHighlightsToHtml(
            await renderMarkdownBlock(segment.originalMarkdown, segment.kind, headingId),
            originalCollect.highlights
          )
          return {
            html: originalHighlightResult.html,
            failedIds: [...originalCollect.failedIds, ...originalHighlightResult.failedIds]
          }
        }
      )
      allFailedIds.push(...originalHtmlResult.failedIds)

      const translationHtmlResult =
        translationEntry &&
        translationEntry.status === 'completed' &&
        translationEntry.translatedMarkdown
          ? await getOrCreateCachedHtmlResult(
              translationHtmlCacheRef.current,
              [
                translationEntry.id,
                translationEntry.status,
                translationEntry.updatedAt || translationEntry.translatedMarkdown,
                options.basePath ?? '',
                annotationRenderKey
              ].join('\u0001'),
              async () => {
                const translationCollect = highlighter.collectTranslationHighlights(
                  translationText,
                  annotations,
                  segment.originalText
                )
                const translationHighlightResult = highlighter.applyHighlightsToHtml(
                  await renderMarkdownBlock(
                    translationEntry.translatedMarkdown || '',
                    translationEntry.kind
                  ),
                  translationCollect.highlights
                )
                return {
                  html: translationHighlightResult.html,
                  failedIds: [
                    ...translationCollect.failedIds,
                    ...translationHighlightResult.failedIds
                  ]
                }
              }
            )
          : null
      if (translationHtmlResult) {
        allFailedIds.push(...translationHtmlResult.failedIds)
      }

      rendered.push({
        renderId: segment.renderId,
        stableId: segment.stableId,
        sourceRevisionId: segment.sourceRevisionId,
        textHash: segment.textHash,
        kind: segment.kind,
        originalText: segment.originalText,
        originalHtml: originalHtmlResult.html,
        translationHtml: translationHtmlResult?.html ?? null,
        translationText,
        translationStatus,
        showTranslation: shouldRenderTranslationBlock(
          options.translationVisible,
          translationStatus,
          translationHtmlResult?.html ?? null
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
      segments: rendered,
      unresolvedAnnotationIds: allFailedIds
    }
  }

  const renderContent = useCallback(async (): Promise<void> => {
    const currentRunId = ++renderRunIdRef.current
    setParseError(null)
    if (!options.content.trim()) {
      setRenderedSegments([])
      options.clearToc()
      return
    }

    try {
      const result = await buildTocAndRenderedSegments()
      if (currentRunId !== renderRunIdRef.current) {
        return
      }
      setRenderedSegments(result.segments)
      setUnresolvedAnnotationIds(result.unresolvedAnnotationIds)
      options.setTocOutline(result.outline)
    } catch (error) {
      if (currentRunId !== renderRunIdRef.current) {
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      setParseError(`Markdown 解析失败: ${message}`)
      setRenderedSegments([])
      options.clearToc()
    }
  }, [
    options.content,
    options.basePath,
    options.translationVisible,
    options.translationCache,
    options.readerDocument,
    options.annotations
  ])

  return {
    renderedSegments,
    parseError,
    getSourceSegments,
    renderContent,
    unresolvedAnnotationIds
  }
}
