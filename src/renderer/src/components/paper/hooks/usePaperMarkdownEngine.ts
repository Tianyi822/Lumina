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
const RAW_TABLE_INLINE_MATH_PATTERN = /\$([^\n$]+?)\$/g
const RAW_TABLE_INLINE_MATH_TEST_PATTERN = /\$[^\n$]+?\$/
const RAW_TABLE_INLINE_MATH_SKIP_SELECTOR = [
  'code',
  'pre',
  'math',
  'eq',
  'eqn',
  '.katex',
  '.katex-display',
  '.texmath'
].join(', ')

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

function shouldRenderRawTableInlineMathNode(node: Text): boolean {
  const content = node.textContent || ''
  if (!RAW_TABLE_INLINE_MATH_TEST_PATTERN.test(content)) {
    return false
  }

  const parent = node.parentElement
  return !!parent && !parent.closest(RAW_TABLE_INLINE_MATH_SKIP_SELECTOR)
}

function renderRawTableInlineMathNode(
  doc: Document,
  textNode: Text,
  renderInline: (content: string) => string
): void {
  const content = textNode.textContent || ''
  const parent = textNode.parentNode
  if (!parent) {
    return
  }

  const fragment = doc.createDocumentFragment()
  let cursor = 0

  for (const match of content.matchAll(RAW_TABLE_INLINE_MATH_PATTERN)) {
    const matchIndex = match.index ?? 0
    const mathSource = match[0]

    if (matchIndex > cursor) {
      fragment.appendChild(doc.createTextNode(content.slice(cursor, matchIndex)))
    }

    const template = doc.createElement('template')
    template.innerHTML = renderInline(normalizePaperInlineMathForRender(mathSource, 'table'))
    if (template.content.childNodes.length > 0) {
      fragment.appendChild(template.content)
    } else {
      fragment.appendChild(doc.createTextNode(mathSource))
    }

    cursor = matchIndex + mathSource.length
  }

  if (cursor < content.length) {
    fragment.appendChild(doc.createTextNode(content.slice(cursor)))
  }

  parent.insertBefore(fragment, textNode)
  parent.removeChild(textNode)
}

function renderRawTableInlineMath(root: Element, renderInline: (content: string) => string): void {
  root.querySelectorAll('table').forEach((table) => {
    const textNodes: Text[] = []
    const walker = table.ownerDocument.createTreeWalker(table, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
      const currentNode = walker.currentNode
      if (currentNode instanceof Text && shouldRenderRawTableInlineMathNode(currentNode)) {
        textNodes.push(currentNode)
      }
    }

    textNodes.forEach((textNode) => {
      renderRawTableInlineMathNode(table.ownerDocument, textNode, renderInline)
    })
  })
}

// 代码块内的行内公式渲染（伪代码块中的 $...$ 公式）
const RAW_CODE_INLINE_MATH_PATTERN = /\$([^\n$]+?)\$/g
const RAW_CODE_INLINE_MATH_TEST_PATTERN = /\$[^\n$]+?\$/
const RAW_CODE_INLINE_MATH_SKIP_SELECTOR = ['.katex', '.katex-display', '.texmath'].join(', ')

function renderRawCodeBlockInlineMath(
  root: Element,
  renderInline: (content: string) => string
): void {
  root.querySelectorAll('pre code').forEach((codeBlock) => {
    const textNodes: Text[] = []
    const walker = codeBlock.ownerDocument.createTreeWalker(codeBlock, NodeFilter.SHOW_TEXT)

    while (walker.nextNode()) {
      const currentNode = walker.currentNode
      if (
        currentNode instanceof Text &&
        RAW_CODE_INLINE_MATH_TEST_PATTERN.test(currentNode.textContent || '')
      ) {
        const parent = currentNode.parentElement
        if (parent && !parent.closest(RAW_CODE_INLINE_MATH_SKIP_SELECTOR)) {
          textNodes.push(currentNode)
        }
      }
    }

    textNodes.forEach((textNode) => {
      const content = textNode.textContent || ''
      const parent = textNode.parentNode
      if (!parent) return

      const doc = codeBlock.ownerDocument
      const fragment = doc.createDocumentFragment()
      let cursor = 0

      for (const match of content.matchAll(RAW_CODE_INLINE_MATH_PATTERN)) {
        const matchIndex = match.index ?? 0
        const mathSource = match[0]

        if (matchIndex > cursor) {
          fragment.appendChild(doc.createTextNode(content.slice(cursor, matchIndex)))
        }

        const template = doc.createElement('template')
        template.innerHTML = renderInline(
          normalizePaperInlineMathForRender(mathSource, 'paragraph')
        )
        if (template.content.childNodes.length > 0) {
          fragment.appendChild(template.content)
        } else {
          fragment.appendChild(doc.createTextNode(mathSource))
        }

        cursor = matchIndex + mathSource.length
      }

      if (cursor < content.length) {
        fragment.appendChild(doc.createTextNode(content.slice(cursor)))
      }

      parent.insertBefore(fragment, textNode)
      parent.removeChild(textNode)
    })
  })
}

function postProcessRenderedHtml(
  html: string,
  renderInline: (content: string) => string,
  headingId?: string
): string {
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

  renderRawTableInlineMath(root, renderInline)
  renderRawCodeBlockInlineMath(root, renderInline)

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

      const originalCollect = highlighter.collectOriginalHighlights(segment, annotations)
      const originalHtmlResult = highlighter.applyHighlightsToHtml(
        await renderMarkdownBlock(segment.originalMarkdown, segment.kind, headingId),
        originalCollect.highlights
      )
      allFailedIds.push(...originalCollect.failedIds, ...originalHtmlResult.failedIds)

      const translationCollect = highlighter.collectTranslationHighlights(
        translationText,
        annotations,
        segment.originalText
      )
      const translationHtmlResult =
        translationEntry &&
        translationEntry.status === 'completed' &&
        translationEntry.translatedMarkdown
          ? highlighter.applyHighlightsToHtml(
              await renderMarkdownBlock(translationEntry.translatedMarkdown, translationEntry.kind),
              translationCollect.highlights
            )
          : null
      allFailedIds.push(...translationCollect.failedIds)
      if (translationHtmlResult) {
        allFailedIds.push(...translationHtmlResult.failedIds)
      }

      rendered.push({
        renderId: segment.renderId,
        stableId: segment.stableId,
        sourceRevisionId: segment.sourceRevisionId,
        textHash: segment.textHash,
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
