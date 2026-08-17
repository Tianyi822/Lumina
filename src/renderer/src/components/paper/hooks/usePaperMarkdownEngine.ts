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
import { i18n } from '@renderer/i18n'
import { usePaperHighlightRenderer } from '../composables/usePaperHighlightRenderer'
import type { RenderSourceSegment } from '../composables/usePaperHighlightRenderer'
import { postProcessRenderedHtml } from './paperMarkdownPostProcess'
import {
  getSegmentAnnotationRenderKey,
  mergeSegmentAnnotationsForRender,
  sortPaperAnnotationsForRender
} from './paperAnnotationRenderState'
// PERF-PROBE:firstpaint — 临时首屏性能埋点，验证后整体移除
import { probe } from '../perf/paperFirstPaintProfiler'

/** 生成翻译缓存的渲染缓存键，用于判断是否需要重新渲染译文 */
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

export type SegmentHtmlStatus = 'pending' | 'ready' | 'error'

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
  htmlStatus: SegmentHtmlStatus
}

interface SegmentRenderContext {
  sourceSegments: RenderSourceSegment[]
  outline: PaperTocOutline
  outlineEntryMap: Map<string, PaperTocItem | PaperTocOutline['documentTitle']>
  frontMatterMetadataIds: Set<string>
  annotationsBySegmentId: Map<string, PaperAnnotation[]>
  translationMap: Map<string, PaperTranslationEntry>
  basePath: string | undefined
  translationVisible: boolean
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
  const normalizedBase =
    basePath.endsWith('/') || basePath.endsWith('\\') ? basePath.slice(0, -1) : basePath
  const lastSep = Math.max(normalizedBase.lastIndexOf('/'), normalizedBase.lastIndexOf('\\'))
  const paperId = lastSep >= 0 ? normalizedBase.substring(lastSep + 1) : ''
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
  renderSegmentMetas: () => void
  renderSegmentAtIndex: (index: number) => Promise<void>
  invalidateSegmentHtml: (stableIds: string[]) => void
  applyTranslationUpdates: () => void
  applyAnnotationUpdates: () => string[]
  /** @deprecated 使用 renderSegmentMetas + 懒渲染调度 */
  renderContent: () => Promise<void>
  unresolvedAnnotationIds: string[]
}

/** Markdown 渲染引擎 Hook，负责将论文段落转换为 HTML，包含公式渲染、高亮应用和 TOC 构建 */
export function usePaperMarkdownEngine(options: PaperMarkdownEngineOptions): PaperMarkdownEngine {
  const [renderedSegments, setRenderedSegments] = useState<RenderedSegment[]>([])
  const [parseError, setParseError] = useState<string | null>(null)
  const [unresolvedAnnotationIds, setUnresolvedAnnotationIds] = useState<string[]>([])
  const renderRunIdRef = useRef(0)
  const renderedSegmentsRef = useRef<RenderedSegment[]>([])
  renderedSegmentsRef.current = renderedSegments
  const segmentRenderContextRef = useRef<SegmentRenderContext | null>(null)
  const originalHtmlCacheRef = useRef(new Map<string, CachedHtmlResult>())
  const translationHtmlCacheRef = useRef(new Map<string, CachedHtmlResult>())
  const optionsRef = useRef(options)
  optionsRef.current = options

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
    const resolvedHtml = await resolveImagePaths(rawHtml, optionsRef.current.basePath)
    return postProcessRenderedHtml(
      resolvedHtml,
      (inlineContent) => markdownRenderer.renderInline(inlineContent),
      headingId
    )
  }

  function getSourceSegments(): RenderSourceSegment[] {
    const currentOptions = optionsRef.current
    if (currentOptions.readerDocument?.segments?.length) {
      return currentOptions.readerDocument.segments.map((segment: PaperReaderSegment) => ({
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

    return createFallbackSourceSegments(currentOptions.content)
  }

  function buildSegmentRenderContext(): SegmentRenderContext | null {
    const currentOptions = optionsRef.current
    if (!currentOptions.content.trim()) {
      return null
    }

    const sourceSegments = getSourceSegments()
    const translationMap = new Map<string, PaperTranslationEntry>()
    const frontMatterMetadataIds = collectFrontMatterMetadataIds(sourceSegments)
    const currentAnnotations = currentOptions.annotations ?? []
    const outline = buildPaperTocOutline(
      sourceSegments.map((segment) => ({
        id: segment.renderId,
        index: segment.index,
        kind: segment.kind,
        originalMarkdown: segment.originalMarkdown,
        originalText: segment.originalText
      })),
      currentOptions.translationCache?.entries ?? []
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

    for (const entry of currentOptions.translationCache?.entries ?? []) {
      translationMap.set(entry.id, entry)
    }

    return {
      sourceSegments,
      outline,
      outlineEntryMap,
      frontMatterMetadataIds,
      annotationsBySegmentId,
      translationMap,
      basePath: currentOptions.basePath,
      translationVisible: currentOptions.translationVisible
    }
  }

  function buildSegmentMetasFromContext(ctx: SegmentRenderContext): RenderedSegment[] {
    return ctx.sourceSegments.map((segment) => {
      const outlineEntry = ctx.outlineEntryMap.get(segment.renderId)
      const segmentAnchorId = outlineEntry?.id
      const annotations = ctx.annotationsBySegmentId.get(segment.stableId) || []
      const translationEntry = ctx.translationMap.get(segment.renderId)
      const translationStatus = translationEntry?.status ?? 'idle'
      const translationText = translationEntry?.translatedText
        ? translationEntry.translatedText
        : translationEntry?.translatedMarkdown
          ? stripPaperTranslationMarkdown(translationEntry.translatedMarkdown)
          : ''

      return {
        renderId: segment.renderId,
        stableId: segment.stableId,
        sourceRevisionId: segment.sourceRevisionId,
        textHash: segment.textHash,
        kind: segment.kind,
        originalText: segment.originalText,
        originalHtml: '',
        translationHtml: null,
        translationText,
        translationStatus,
        showTranslation: shouldRenderTranslationBlock(
          ctx.translationVisible,
          translationStatus,
          translationEntry?.status === 'completed'
            ? (translationEntry.translatedMarkdown ?? null)
            : null
        ),
        segmentAnchorId,
        isCenteredMeta: ctx.frontMatterMetadataIds.has(segment.renderId),
        annotations: sortPaperAnnotationsForRender(annotations),
        htmlStatus: 'pending' as const
      }
    })
  }

  async function renderSegmentHtmlAt(
    ctx: SegmentRenderContext,
    index: number
  ): Promise<{
    originalHtml: string
    translationHtml: string | null
    showTranslation: boolean
    failedIds: string[]
  }> {
    const segment = ctx.sourceSegments[index]
    if (!segment) {
      throw new Error(`段落索引无效: ${index}`)
    }

    const outlineEntry = ctx.outlineEntryMap.get(segment.renderId)
    const headingId = segment.kind === 'heading' ? outlineEntry?.id : undefined
    const annotations = ctx.annotationsBySegmentId.get(segment.stableId) || []
    const translationEntry = ctx.translationMap.get(segment.renderId)
    const translationStatus = translationEntry?.status ?? 'idle'
    const translationText = translationEntry?.translatedText
      ? translationEntry.translatedText
      : translationEntry?.translatedMarkdown
        ? stripPaperTranslationMarkdown(translationEntry.translatedMarkdown)
        : ''
    const annotationRenderKey = getSegmentAnnotationRenderKey(annotations)
    const failedIds: string[] = []

    const originalHtmlResult = await getOrCreateCachedHtmlResult(
      originalHtmlCacheRef.current,
      [
        segment.renderId,
        segment.sourceRevisionId,
        ctx.basePath ?? '',
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
    failedIds.push(...originalHtmlResult.failedIds)

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
              ctx.basePath ?? '',
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
      failedIds.push(...translationHtmlResult.failedIds)
    }

    return {
      originalHtml: originalHtmlResult.html,
      translationHtml: translationHtmlResult?.html ?? null,
      showTranslation: shouldRenderTranslationBlock(
        ctx.translationVisible,
        translationStatus,
        translationHtmlResult?.html ?? null
      ),
      failedIds
    }
  }

  const renderSegmentMetas = useCallback((): void => {
    const currentRunId = ++renderRunIdRef.current
    const currentOptions = optionsRef.current
    setParseError(null)

    if (!currentOptions.content.trim()) {
      segmentRenderContextRef.current = null
      setRenderedSegments([])
      setUnresolvedAnnotationIds([])
      currentOptions.clearToc()
      return
    }

    try {
      const ctx = buildSegmentRenderContext()
      if (!ctx || currentRunId !== renderRunIdRef.current) {
        return
      }

      segmentRenderContextRef.current = ctx
      originalHtmlCacheRef.current.clear()
      translationHtmlCacheRef.current.clear()
      setRenderedSegments(buildSegmentMetasFromContext(ctx))
      setUnresolvedAnnotationIds([])
      currentOptions.setTocOutline(ctx.outline)
    } catch (error) {
      if (currentRunId !== renderRunIdRef.current) {
        return
      }
      const message = error instanceof Error ? error.message : String(error)
      setParseError(`${i18n.t('paper.reader.parseErrorPrefix')}${message}`)
      segmentRenderContextRef.current = null
      setRenderedSegments([])
      currentOptions.clearToc()
    }
  }, [])

  const renderSegmentAtIndex = useCallback(async (index: number): Promise<void> => {
    const currentRunId = renderRunIdRef.current
    const ctx = segmentRenderContextRef.current
    const segment = renderedSegmentsRef.current[index]

    if (!ctx || !segment || segment.htmlStatus === 'ready') {
      return
    }

    try {
      const probeT0 = performance.now() // PERF-PROBE:firstpaint
      const html = await renderSegmentHtmlAt(ctx, index)
      probe.recordSample(performance.now() - probeT0) // PERF-PROBE:firstpaint
      if (currentRunId !== renderRunIdRef.current) {
        return
      }

      setRenderedSegments((previous) => {
        const target = previous[index]
        if (!target || target.stableId !== segment.stableId) {
          return previous
        }
        const next = [...previous]
        next[index] = {
          ...target,
          originalHtml: html.originalHtml,
          translationHtml: html.translationHtml,
          showTranslation: html.showTranslation,
          htmlStatus: 'ready'
        }
        return next
      })

      if (html.failedIds.length > 0) {
        setUnresolvedAnnotationIds((previous) => [...previous, ...html.failedIds])
      }
    } catch {
      if (currentRunId !== renderRunIdRef.current) {
        return
      }
      setRenderedSegments((previous) => {
        const target = previous[index]
        if (!target || target.stableId !== segment.stableId) {
          return previous
        }
        const next = [...previous]
        next[index] = { ...target, htmlStatus: 'error' }
        return next
      })
    }
  }, [])

  const invalidateSegmentHtml = useCallback((stableIds: string[]): void => {
    if (stableIds.length === 0) {
      return
    }
    const idSet = new Set(stableIds)
    setRenderedSegments((previous) =>
      previous.map((segment) =>
        idSet.has(segment.stableId)
          ? {
              ...segment,
              originalHtml: '',
              translationHtml: null,
              htmlStatus: 'pending' as const
            }
          : segment
      )
    )
  }, [])

  /**
   * 增量应用译文更新（翻译进度推送 / 翻译显隐切换）。
   *
   * 与 renderSegmentMetas 的全量重建不同：本方法保留每个段落已渲染的原文 HTML 与缓存，
   * 仅在译文元数据（状态/文本/是否展示）真正变化时更新对应段落，避免翻译过程中
   * 所有段落被重置为 pending 导致内容塌缩成骨架屏/「正在翻译」、虚拟列表高度剧变触发抖动与滚动跳变。
   *
   * - 译文进入 completed 态且缺少对应 HTML（首次完成或重译文本变化）：重置该段 htmlStatus 为 pending
   *   触发调度器补渲染译文；originalHtml 保留，原文区块据此兜底显示，不会闪回骨架屏。
   * - 其他态（排队/翻译中/失败/隐藏）：仅更新元数据并清空旧译文 HTML，由占位符按状态展示，原文保持可见。
   */
  const applyTranslationUpdates = useCallback((): void => {
    const ctx = buildSegmentRenderContext()
    if (!ctx) {
      return
    }
    segmentRenderContextRef.current = ctx
    // 译文标题可能影响 TOC（译后标题），同步大纲
    optionsRef.current.setTocOutline(ctx.outline)
    setRenderedSegments((previous) =>
      previous.map((segment) => {
        const translationEntry = ctx.translationMap.get(segment.renderId)
        const translationStatus = translationEntry?.status ?? 'idle'
        const translationText = translationEntry?.translatedText
          ? translationEntry.translatedText
          : translationEntry?.translatedMarkdown
            ? stripPaperTranslationMarkdown(translationEntry.translatedMarkdown)
            : ''
        const showTranslation = shouldRenderTranslationBlock(
          ctx.translationVisible,
          translationStatus,
          translationEntry?.status === 'completed'
            ? (translationEntry.translatedMarkdown ?? null)
            : null
        )

        const metaChanged =
          segment.translationStatus !== translationStatus ||
          segment.translationText !== translationText ||
          segment.showTranslation !== showTranslation

        if (!metaChanged) {
          return segment
        }

        // 译文完成但尚无对应 HTML（首次完成）或译文文本变化（重新翻译）时，需要重渲染译文
        const needsTranslationHtml =
          translationStatus === 'completed' &&
          (!segment.translationHtml || segment.translationText !== translationText)

        if (needsTranslationHtml) {
          return {
            ...segment,
            translationStatus,
            translationText,
            showTranslation,
            translationHtml: null,
            htmlStatus: 'pending' as const
          }
        }

        return {
          ...segment,
          translationStatus,
          translationText,
          showTranslation,
          // 非完成态清空旧译文 HTML，确保占位符正确展示当前状态
          translationHtml: translationStatus === 'completed' ? segment.translationHtml : null
        }
      })
    )
  }, [])

  const applyAnnotationUpdates = useCallback((): string[] => {
    const ctx = buildSegmentRenderContext()
    if (!ctx) {
      return []
    }
    segmentRenderContextRef.current = ctx
    const affectedStableIds: string[] = []
    let hasSegmentChanges = false
    const nextSegments = renderedSegmentsRef.current.map((segment) => {
      const mergeResult = mergeSegmentAnnotationsForRender(
        segment,
        ctx.annotationsBySegmentId.get(segment.stableId) || []
      )
      if (mergeResult.segment !== segment) {
        hasSegmentChanges = true
      }
      if (mergeResult.visualChanged) {
        affectedStableIds.push(segment.stableId)
      }
      return mergeResult.segment
    })

    if (!hasSegmentChanges) {
      return affectedStableIds
    }

    renderedSegmentsRef.current = nextSegments
    setRenderedSegments(nextSegments)
    return affectedStableIds
  }, [])

  const renderContent = useCallback(async (): Promise<void> => {
    renderSegmentMetas()
  }, [renderSegmentMetas])

  return {
    renderedSegments,
    parseError,
    getSourceSegments,
    renderSegmentMetas,
    renderSegmentAtIndex,
    invalidateSegmentHtml,
    applyTranslationUpdates,
    applyAnnotationUpdates,
    renderContent,
    unresolvedAnnotationIds
  }
}
