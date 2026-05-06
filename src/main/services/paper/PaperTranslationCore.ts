import { createHash } from 'crypto'
import type { LLMConfig } from '../../../shared/types/config'
import type {
  PaperFigureItem,
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationProgress,
  PaperTranslationSegment,
  PaperTranslationSegmentKind
} from '../../../shared/types/paper'
import {
  isPaperAffiliationLikeSegment,
  isPaperAuthorLikeSegment,
  isPaperContactLikeSegment,
  isPaperReferenceLikeSegment,
  parsePaperTranslationSegments,
  stripPaperTranslationMarkdown
} from '../../../shared/utils/paperTranslation.ts'

type ProgressListener = (progress: PaperTranslationProgress) => void

interface TranslationLogger {
  info(message: string, context?: string, meta?: Record<string, unknown>): void
  warn(message: string, context?: string, meta?: Record<string, unknown>): void
  error(message: string, context?: string, meta?: Record<string, unknown>): void
}

export interface PaperTranslationCoreDependencies {
  concurrency?: number
  logger: TranslationLogger
  getDefaultLlmConfig: () => LLMConfig | null
  readCache: (paperId: string) => { success: boolean; data?: PaperTranslationCache; error?: string }
  saveCache: (paperId: string, cache: PaperTranslationCache) => { success: boolean; error?: string }
  clearCache: (paperId: string) => { success: boolean; error?: string }
  translateSegment: (
    llmConfig: LLMConfig,
    prompt: string,
    segment: PaperTranslationSegment,
    signal: AbortSignal
  ) => Promise<string>
  now?: () => string
}

interface ActiveTranslationTask {
  paperId: string
  sourceHash: string
  cache: PaperTranslationCache
  abortController: AbortController
  promise: Promise<void> | null
  retryQueue: number[]
  retryQueuedIndexes: Set<number>
  inFlightIndexes: Set<number>
}

interface PaperTranslationSourceDescriptorEntry {
  id: string
  kind: PaperTranslationSegmentKind
  originalMarkdown: string
}

interface PaperTranslationSource {
  segments: PaperTranslationSegment[]
  descriptorEntries: PaperTranslationSourceDescriptorEntry[]
  sourceHash: string
  sourceHashVersion: 2
}

const DEFAULT_CONCURRENCY = 3
const PAPER_TRANSLATION_SOURCE_HASH_VERSION = 2
const FIGURE_CAPTION_TRANSLATION_ID_PREFIX = 'fig-caption-'
const PROMPT_ARTIFACT_LINE_PATTERN =
  /^\s*(?:\[(?:上一段(?:原文)?参考|下一段(?:原文)?参考|当前(?:需要翻译的)?段落|翻译输出)\]|(?:上一段(?:原文)?参考|下一段(?:原文)?参考|当前(?:需要翻译的)?段落|翻译输出)|(?:previous_context|next_context|current_segment|translation))\s*:?\s*$/i
const PROMPT_ARTIFACT_TAG_PATTERN =
  /<\/?(?:previous_context|next_context|current_segment|translation)(?:\s+[^>]*)?>/gi
const LEADING_MARKER_PATTERN = /^(\s*(?:\[\d+\]|\[\[\d+\]\]|\d+[.)]|[-*+]))\s+/

function createPaperTranslationRevisionId(sourceHash: string, updatedAt: string): string {
  return `${sourceHash.slice(0, 12)}:${updatedAt}`
}

function getFigureCaptionSourceText(figure: PaperFigureItem): string {
  return figure.caption || figure.subCaption || ''
}

function buildFigureCaptionSegments(figures?: PaperFigureItem[]): PaperTranslationSegment[] {
  if (!figures || figures.length === 0) {
    return []
  }

  const segments: PaperTranslationSegment[] = []

  for (const figure of figures) {
    const captionText = getFigureCaptionSourceText(figure)
    if (!captionText) {
      continue
    }

    segments.push({
      id: `fig-caption-${figure.id}`,
      index: segments.length,
      kind: 'paragraph',
      originalMarkdown: captionText,
      originalText: captionText
    })
  }

  return segments
}

function buildPaperTranslationSourceSegments(
  markdown: string,
  figures?: PaperFigureItem[]
): PaperTranslationSegment[] {
  const contentSegments = parsePaperTranslationSegments(markdown)
  const captionSegments = buildFigureCaptionSegments(figures).map((segment, index) => ({
    ...segment,
    index: contentSegments.length + index
  }))

  return [...contentSegments, ...captionSegments]
}

function buildPaperTranslationSourceDescriptorEntries(
  segments: PaperTranslationSegment[]
): PaperTranslationSourceDescriptorEntry[] {
  return segments.map((segment) => ({
    id: segment.id,
    kind: segment.kind,
    originalMarkdown: segment.originalMarkdown
  }))
}

function serializePaperTranslationSourceDescriptor(
  entries: PaperTranslationSourceDescriptorEntry[]
): string {
  return JSON.stringify({
    version: PAPER_TRANSLATION_SOURCE_HASH_VERSION,
    entries
  })
}

function computePaperTranslationSourceHashFromDescriptor(
  entries: PaperTranslationSourceDescriptorEntry[]
): string {
  return createHash('sha256')
    .update(serializePaperTranslationSourceDescriptor(entries))
    .digest('hex')
}

function buildPaperTranslationSource(
  markdown: string,
  figures?: PaperFigureItem[]
): PaperTranslationSource {
  const segments = buildPaperTranslationSourceSegments(markdown, figures)
  const descriptorEntries = buildPaperTranslationSourceDescriptorEntries(segments)

  return {
    segments,
    descriptorEntries,
    sourceHash: computePaperTranslationSourceHashFromDescriptor(descriptorEntries),
    sourceHashVersion: PAPER_TRANSLATION_SOURCE_HASH_VERSION
  }
}

function buildSourceDescriptorEntriesFromCache(
  cache: PaperTranslationCache
): PaperTranslationSourceDescriptorEntry[] {
  return cache.entries.map((entry) => ({
    id: entry.id,
    kind: entry.kind,
    originalMarkdown: entry.originalMarkdown
  }))
}

function areSourceDescriptorEntriesEqual(
  left: PaperTranslationSourceDescriptorEntry[],
  right: PaperTranslationSourceDescriptorEntry[]
): boolean {
  if (left.length !== right.length) {
    return false
  }

  return left.every((entry, index) => {
    const counterpart = right[index]
    return (
      entry.id === counterpart?.id &&
      entry.kind === counterpart.kind &&
      entry.originalMarkdown === counterpart.originalMarkdown
    )
  })
}

function canReuseSourceDescriptorEntries(
  cachedEntries: PaperTranslationSourceDescriptorEntry[],
  sourceEntries: PaperTranslationSourceDescriptorEntry[]
): boolean {
  const cachedEntryMap = new Map(cachedEntries.map((entry) => [entry.id, entry]))
  const sourceEntryMap = new Map(sourceEntries.map((entry) => [entry.id, entry]))

  const cachedEntriesMatchSource = cachedEntries.every((entry) => {
    const sourceEntry = sourceEntryMap.get(entry.id)
    return (
      !!sourceEntry &&
      entry.kind === sourceEntry.kind &&
      entry.originalMarkdown === sourceEntry.originalMarkdown
    )
  })

  if (!cachedEntriesMatchSource) {
    return false
  }

  return sourceEntries.every((entry) => {
    const cachedEntry = cachedEntryMap.get(entry.id)
    if (cachedEntry) {
      return true
    }

    return entry.id.startsWith(FIGURE_CAPTION_TRANSLATION_ID_PREFIX)
  })
}

export function computePaperTranslationSourceHash(
  markdown: string,
  figures?: PaperFigureItem[]
): string {
  return buildPaperTranslationSource(markdown, figures).sourceHash
}

function normalizeSegmentForFormulaDetection(segment: string): string {
  return segment
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(div|p|li|tr|td|th|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function isStandaloneFormulaDelimiter(segment: string): boolean {
  return /^(?:\${1,2}|\\\(|\\\)|\\\[|\\\])$/.test(segment.trim())
}

function hasFormulaDelimiters(segment: string): boolean {
  const normalized = normalizeSegmentForFormulaDetection(segment)
  if (!normalized) {
    return false
  }

  // 仅匹配独立的展示公式块（整个段落是公式），不匹配包含内联公式的正常文本
  const trimmed = normalized.trim()
  return /^\$\$[\s\S]*\$\$$/.test(trimmed) || /^\\\[.*\\\]$/.test(trimmed)
}

function hasLatexEnvironment(segment: string): boolean {
  return /\\(?:begin|end)\{[^}]+\}/.test(normalizeSegmentForFormulaDetection(segment))
}

function looksLikeFormulaBody(segment: string): boolean {
  const normalized = normalizeSegmentForFormulaDetection(segment)
  if (!normalized) {
    return false
  }

  const texCommandCount = (normalized.match(/\\[A-Za-z]+/g) || []).length
  const mathStructureCount = (normalized.match(/[=^_{}]/g) || []).length
  const formulaLikeWordCount = (normalized.match(/[A-Za-z]{2,}/g) || []).length

  if (/^\\[A-Za-z]+/.test(normalized)) {
    return true
  }

  if (texCommandCount >= 2) {
    return true
  }

  if (texCommandCount >= 1 && mathStructureCount >= 2) {
    return true
  }

  if (
    texCommandCount >= 1 &&
    mathStructureCount >= 1 &&
    formulaLikeWordCount <= texCommandCount + 4 &&
    !/[.!?。？！]/.test(normalized)
  ) {
    return true
  }

  return false
}

const NATURAL_LANGUAGE_KINDS: ReadonlySet<PaperTranslationSegmentKind> = new Set([
  'paragraph',
  'heading',
  'list',
  'quote'
])

function isFormulaLikeSegment(segment: PaperTranslationSegment): boolean {
  const source = segment.originalMarkdown.trim()

  if (
    isStandaloneFormulaDelimiter(source) ||
    hasFormulaDelimiters(source) ||
    hasLatexEnvironment(source)
  ) {
    return true
  }

  if (NATURAL_LANGUAGE_KINDS.has(segment.kind)) {
    return false
  }

  return looksLikeFormulaBody(source)
}

function isStructuralMarkerSegment(segment: PaperTranslationSegment): boolean {
  const trimmed = segment.originalMarkdown.trim()
  if (!trimmed) return true
  if (/^<!--[\s\S]*-->$/.test(trimmed)) return true
  if (/^[-*_]{3,}\s*$/.test(trimmed)) return true
  return false
}

function shouldSkipTranslationSegment(segment: PaperTranslationSegment): boolean {
  if (segment.kind === 'heading') {
    return isStructuralMarkerSegment(segment)
  }

  return (
    segment.kind === 'image' ||
    segment.kind === 'table' ||
    segment.kind === 'code' ||
    isStructuralMarkerSegment(segment) ||
    isFormulaLikeSegment(segment) ||
    isPaperContactLikeSegment(segment) ||
    isPaperAuthorLikeSegment(segment)
  )
}

function stripPromptArtifacts(content: string): string {
  const translationMatch = content.match(/<translation>([\s\S]*?)<\/translation>/i)
  const strippedContent = translationMatch ? translationMatch[1] : content

  return strippedContent
    .replace(PROMPT_ARTIFACT_TAG_PATTERN, '')
    .split('\n')
    .filter((line) => !PROMPT_ARTIFACT_LINE_PATTERN.test(line.trim()))
    .join('\n')
    .trim()
}

function getFirstMeaningfulBlock(content: string): string {
  return (
    content
      .split(/\n{2,}/)
      .map((block) => block.trim())
      .find(Boolean) ?? ''
  )
}

function preserveLeadingMarker(segment: PaperTranslationSegment, content: string): string {
  const sourceMarkerMatch = segment.originalMarkdown.match(LEADING_MARKER_PATTERN)
  if (!sourceMarkerMatch) {
    return content
  }

  const sourceMarker = sourceMarkerMatch[1].trim()
  const trimmedContent = content.trimStart()
  const translatedMarkerMatch = trimmedContent.match(LEADING_MARKER_PATTERN)

  if (!translatedMarkerMatch) {
    return `${sourceMarker} ${trimmedContent}`
  }

  if (translatedMarkerMatch[1].trim() === sourceMarker) {
    return content
  }

  if (segment.kind === 'list' || isPaperReferenceLikeSegment(segment)) {
    return trimmedContent.replace(LEADING_MARKER_PATTERN, `${sourceMarker} `)
  }

  return content
}

function cloneEntry(entry: PaperTranslationEntry): PaperTranslationEntry {
  return { ...entry }
}

function countCompletedSegments(entries: PaperTranslationEntry[]): number {
  return entries.filter((entry) => entry.status === 'completed' || entry.status === 'skipped')
    .length
}

function hasRunningEntries(entries: PaperTranslationEntry[]): boolean {
  return entries.some((entry) => entry.status === 'queued' || entry.status === 'translating')
}

export class PaperTranslationCore {
  private readonly deps: PaperTranslationCoreDependencies

  private readonly concurrency: number

  private readonly now: () => string

  private readonly tasks = new Map<string, ActiveTranslationTask>()

  private readonly progressListeners = new Map<string, Set<ProgressListener>>()

  constructor(deps: PaperTranslationCoreDependencies) {
    this.deps = deps
    this.concurrency = Math.max(1, deps.concurrency ?? DEFAULT_CONCURRENCY)
    this.now = deps.now ?? (() => new Date().toISOString())
  }

  onProgress(paperId: string, listener: ProgressListener): () => void {
    const listeners = this.progressListeners.get(paperId) ?? new Set<ProgressListener>()
    listeners.add(listener)
    this.progressListeners.set(paperId, listeners)

    return () => {
      const currentListeners = this.progressListeners.get(paperId)
      if (!currentListeners) {
        return
      }

      currentListeners.delete(listener)
      if (currentListeners.size === 0) {
        this.progressListeners.delete(paperId)
      }
    }
  }

  isRunning(paperId: string): boolean {
    return this.tasks.has(paperId)
  }

  cancelTranslation(paperId: string): void {
    const task = this.tasks.get(paperId)
    if (!task) {
      return
    }

    task.abortController.abort()
    this.tasks.delete(paperId)
  }

  getTranslationState(
    paperId: string,
    markdown: string,
    figures?: PaperFigureItem[]
  ): {
    success: boolean
    data?: { cache: PaperTranslationCache | null; isRunning: boolean }
    error?: string
  } {
    const source = buildPaperTranslationSource(markdown, figures)
    const validCache = this.readValidCache(paperId, source)
    const runningTask = this.tasks.get(paperId)

    return {
      success: true,
      data: {
        cache: runningTask?.cache ?? validCache,
        isRunning: runningTask?.sourceHash === source.sourceHash
      }
    }
  }

  async startTranslation(
    paperId: string,
    markdown: string,
    figures?: PaperFigureItem[]
  ): Promise<{ success: boolean; alreadyRunning?: boolean; error?: string }> {
    const source = buildPaperTranslationSource(markdown, figures)

    if (source.segments.length === 0) {
      return { success: false, error: '没有可翻译的正文内容' }
    }

    const existingTask = this.tasks.get(paperId)
    if (existingTask && existingTask.sourceHash === source.sourceHash) {
      return { success: true, alreadyRunning: true }
    }

    if (existingTask) {
      existingTask.abortController.abort()
      this.tasks.delete(paperId)
    }

    const cache = this.buildCache(paperId, source)

    const pendingEntries = cache.entries.filter(
      (entry) => entry.status === 'queued' || entry.status === 'failed'
    )

    let llmConfig: LLMConfig | null = null
    if (pendingEntries.length > 0) {
      llmConfig = this.deps.getDefaultLlmConfig()
      if (!llmConfig) {
        return { success: false, error: '未找到可用的默认模型配置' }
      }

      cache.modelName = llmConfig.model_name
    }

    if (!cache.translationRevisionId) {
      cache.translationRevisionId = createPaperTranslationRevisionId(
        cache.sourceHash,
        cache.updatedAt
      )
    }

    this.persistCache(paperId, cache)

    if (pendingEntries.length === 0) {
      return { success: true }
    }

    const task: ActiveTranslationTask = {
      paperId,
      sourceHash: source.sourceHash,
      cache,
      abortController: new AbortController(),
      promise: null,
      retryQueue: [],
      retryQueuedIndexes: new Set(),
      inFlightIndexes: new Set()
    }

    this.tasks.set(paperId, task)
    task.promise = this.runTask(task, llmConfig!)

    return { success: true }
  }

  private readValidCache(
    paperId: string,
    source: PaperTranslationSource
  ): PaperTranslationCache | null {
    const cachedResult = this.deps.readCache(paperId)
    if (!cachedResult.success || !cachedResult.data) {
      return null
    }

    const cachedCache = cachedResult.data
    if (
      cachedCache.sourceHash === source.sourceHash &&
      cachedCache.sourceHashVersion === source.sourceHashVersion
    ) {
      if (cachedCache.translationRevisionId) {
        return cachedCache
      }

      const upgradedCache: PaperTranslationCache = {
        ...cachedCache,
        translationRevisionId: createPaperTranslationRevisionId(
          cachedCache.sourceHash,
          cachedCache.updatedAt
        )
      }
      const saveResult = this.deps.saveCache(paperId, upgradedCache)
      if (!saveResult.success) {
        this.deps.logger.warn('补齐翻译修订信息失败', 'main', {
          paperId,
          error: saveResult.error
        })
      }

      return upgradedCache
    }

    const cachedDescriptorEntries = buildSourceDescriptorEntriesFromCache(cachedCache)
    if (
      areSourceDescriptorEntriesEqual(cachedDescriptorEntries, source.descriptorEntries) ||
      canReuseSourceDescriptorEntries(cachedDescriptorEntries, source.descriptorEntries)
    ) {
      const upgradedCache: PaperTranslationCache = {
        ...cachedCache,
        paperId,
        sourceHash: source.sourceHash,
        translationRevisionId:
          cachedCache.translationRevisionId ||
          createPaperTranslationRevisionId(source.sourceHash, cachedCache.updatedAt),
        sourceHashVersion: source.sourceHashVersion,
        totalSegments: source.segments.length,
        completedSegments: countCompletedSegments(cachedCache.entries),
        updatedAt: this.now()
      }

      if (
        cachedCache.sourceHash !== upgradedCache.sourceHash ||
        cachedCache.sourceHashVersion !== upgradedCache.sourceHashVersion ||
        cachedCache.totalSegments !== upgradedCache.totalSegments ||
        cachedCache.completedSegments !== upgradedCache.completedSegments
      ) {
        const saveResult = this.deps.saveCache(paperId, upgradedCache)
        if (!saveResult.success) {
          this.deps.logger.warn('升级翻译缓存指纹失败', 'main', {
            paperId,
            error: saveResult.error
          })
        }
      }

      return upgradedCache
    }

    const clearResult = this.deps.clearCache(paperId)
    if (!clearResult.success) {
      this.deps.logger.warn('翻译缓存失效后清理失败', 'main', {
        paperId,
        error: clearResult.error
      })
    }

    return null
  }

  private buildCache(paperId: string, source: PaperTranslationSource): PaperTranslationCache {
    const existingCache = this.readValidCache(paperId, source)
    const previousEntries = new Map(
      (existingCache?.entries ?? []).map((entry) => [entry.id, entry] as const)
    )
    const updatedAt = this.now()

    const entries = source.segments.map<PaperTranslationEntry>((segment) => {
      const previousEntry = previousEntries.get(segment.id)
      const shouldSkip = shouldSkipTranslationSegment(segment)
      const hasStaleVerbatimTranslation =
        previousEntry?.status === 'completed' &&
        previousEntry.translatedMarkdown?.trim() === segment.originalMarkdown.trim() &&
        !/[\u4e00-\u9fff]/.test(segment.originalText) &&
        (isPaperAffiliationLikeSegment(segment) || isPaperReferenceLikeSegment(segment))

      if (shouldSkip) {
        return {
          ...segment,
          status: 'skipped',
          translatedMarkdown: segment.originalMarkdown,
          translatedText: segment.originalText,
          updatedAt
        }
      }

      if (hasStaleVerbatimTranslation) {
        return {
          ...segment,
          status: 'queued'
        }
      }

      if (
        previousEntry &&
        previousEntry.originalMarkdown === segment.originalMarkdown &&
        (previousEntry.status === 'completed' ||
          (previousEntry.status === 'skipped' && shouldSkip)) &&
        previousEntry.translatedMarkdown
      ) {
        return {
          ...segment,
          status: previousEntry.status,
          translatedMarkdown: previousEntry.translatedMarkdown,
          translatedText: previousEntry.translatedText,
          updatedAt: previousEntry.updatedAt ?? updatedAt
        }
      }

      return {
        ...segment,
        status: 'queued'
      }
    })

    return {
      paperId,
      sourceHash: source.sourceHash,
      translationRevisionId:
        existingCache?.translationRevisionId ||
        createPaperTranslationRevisionId(source.sourceHash, updatedAt),
      modelName: existingCache?.modelName,
      sourceHashVersion: source.sourceHashVersion,
      totalSegments: entries.length,
      completedSegments: countCompletedSegments(entries),
      entries,
      updatedAt
    }
  }

  async retranslateSegment(
    paperId: string,
    markdown: string,
    figures: PaperFigureItem[] | undefined,
    segmentId: string
  ): Promise<{ success: boolean; entry?: PaperTranslationEntry; error?: string }> {
    const source = buildPaperTranslationSource(markdown, figures)
    const runningTask = this.tasks.get(paperId)
    if (runningTask) {
      if (runningTask.sourceHash !== source.sourceHash) {
        return { success: false, error: '翻译任务正在进行中，请稍后再试' }
      }

      const entryIndex = runningTask.cache.entries.findIndex((e) => e.id === segmentId)
      if (entryIndex === -1) {
        return { success: false, error: '未找到指定段落' }
      }

      const entry = runningTask.cache.entries[entryIndex]
      if (runningTask.inFlightIndexes.has(entryIndex)) {
        return { success: true, entry: cloneEntry(entry) }
      }

      entry.status = 'queued'
      entry.errorMessage = undefined
      entry.translatedMarkdown = undefined
      entry.translatedText = undefined
      entry.updatedAt = this.now()

      if (!runningTask.retryQueuedIndexes.has(entryIndex)) {
        runningTask.retryQueue.push(entryIndex)
        runningTask.retryQueuedIndexes.add(entryIndex)
      }

      this.persistCache(paperId, runningTask.cache)
      this.emitProgress(runningTask, entry)
      return { success: true, entry: cloneEntry(entry) }
    }

    let cache = this.readValidCache(paperId, source)
    if (!cache) {
      cache = this.buildCache(paperId, source)
    }

    const entryIndex = cache.entries.findIndex((e) => e.id === segmentId)
    if (entryIndex === -1) {
      return { success: false, error: '未找到指定段落' }
    }

    const llmConfig = this.deps.getDefaultLlmConfig()
    if (!llmConfig) {
      return { success: false, error: '未找到可用的默认模型配置' }
    }

    const entry = cache.entries[entryIndex]
    entry.status = 'translating'
    entry.errorMessage = undefined
    entry.updatedAt = this.now()
    this.persistCache(paperId, cache)

    const tempTask: ActiveTranslationTask = {
      paperId,
      sourceHash: cache.sourceHash,
      cache,
      abortController: new AbortController(),
      promise: null,
      retryQueue: [],
      retryQueuedIndexes: new Set(),
      inFlightIndexes: new Set()
    }

    this.emitProgress(tempTask, entry)

    try {
      const prompt = this.buildPrompt(cache.entries, entryIndex)
      const translatedMarkdown = this.sanitizeTranslatedMarkdown(
        entry,
        await this.deps.translateSegment(llmConfig, prompt, entry, tempTask.abortController.signal)
      )

      if (tempTask.abortController.signal.aborted) {
        return { success: false, error: '翻译已取消' }
      }

      entry.status = 'completed'
      entry.translatedMarkdown = translatedMarkdown
      entry.translatedText = stripPaperTranslationMarkdown(translatedMarkdown)
      entry.errorMessage = undefined
      entry.updatedAt = this.now()
      cache.updatedAt = entry.updatedAt
      cache.completedSegments = countCompletedSegments(cache.entries)
      cache.translationRevisionId = createPaperTranslationRevisionId(
        cache.sourceHash,
        cache.updatedAt
      )
      this.persistCache(paperId, cache)
      this.emitProgress(tempTask, entry)
      return { success: true, entry: cloneEntry(entry) }
    } catch (error) {
      if (tempTask.abortController.signal.aborted) {
        return { success: false, error: '翻译已取消' }
      }

      const errorMessage = error instanceof Error ? error.message : String(error)
      entry.status = 'failed'
      entry.errorMessage = errorMessage
      entry.updatedAt = this.now()
      this.persistCache(paperId, cache)
      this.emitProgress(tempTask, entry, errorMessage)

      this.deps.logger.warn('段落重新翻译失败', 'main', {
        paperId,
        segmentId,
        error: errorMessage
      })
      return { success: false, error: errorMessage }
    }
  }

  private async runTask(task: ActiveTranslationTask, llmConfig: LLMConfig): Promise<void> {
    const pendingIndexes = task.cache.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.status === 'queued' || entry.status === 'failed')
      .map(({ index }) => index)

    let cursor = 0
    const claimNextEntryIndex = (): number | null => {
      while (cursor < pendingIndexes.length) {
        const entryIndex = pendingIndexes[cursor]
        cursor += 1

        const entry = task.cache.entries[entryIndex]
        if (
          entry &&
          (entry.status === 'queued' || entry.status === 'failed') &&
          !task.inFlightIndexes.has(entryIndex)
        ) {
          task.retryQueuedIndexes.delete(entryIndex)
          return entryIndex
        }
      }

      while (task.retryQueue.length > 0) {
        const entryIndex = task.retryQueue.shift()
        if (entryIndex === undefined) {
          continue
        }

        task.retryQueuedIndexes.delete(entryIndex)

        const entry = task.cache.entries[entryIndex]
        if (
          entry &&
          (entry.status === 'queued' || entry.status === 'failed') &&
          !task.inFlightIndexes.has(entryIndex)
        ) {
          return entryIndex
        }
      }

      return null
    }

    const workerCount = Math.min(this.concurrency, pendingIndexes.length)

    try {
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (!task.abortController.signal.aborted) {
            const entryIndex = claimNextEntryIndex()
            if (entryIndex === null) {
              return
            }

            await this.translateEntry(task, entryIndex, llmConfig)
          }
        })
      )

      this.deps.logger.info('论文翻译任务结束', 'main', {
        paperId: task.paperId,
        completedSegments: task.cache.completedSegments,
        totalSegments: task.cache.totalSegments
      })
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      this.deps.logger.error('论文翻译任务执行失败', 'main', {
        paperId: task.paperId,
        error: errorMessage
      })
    } finally {
      this.tasks.delete(task.paperId)
    }
  }

  private async translateEntry(
    task: ActiveTranslationTask,
    entryIndex: number,
    llmConfig: LLMConfig
  ): Promise<void> {
    const entry = task.cache.entries[entryIndex]
    if (!entry || task.abortController.signal.aborted) {
      return
    }

    task.inFlightIndexes.add(entryIndex)
    try {
      entry.status = 'translating'
      entry.errorMessage = undefined
      entry.updatedAt = this.now()
      this.persistCache(task.paperId, task.cache)
      this.emitProgress(task, entry)

      try {
        const prompt = this.buildPrompt(task.cache.entries, entryIndex)
        const translatedMarkdown = this.sanitizeTranslatedMarkdown(
          entry,
          await this.deps.translateSegment(llmConfig, prompt, entry, task.abortController.signal)
        )

        if (task.abortController.signal.aborted) {
          return
        }

        entry.status = 'completed'
        entry.translatedMarkdown = translatedMarkdown
        entry.translatedText = stripPaperTranslationMarkdown(translatedMarkdown)
        entry.errorMessage = undefined
        entry.updatedAt = this.now()
        this.persistCache(task.paperId, task.cache)
        this.emitProgress(task, entry)
        return
      } catch (error) {
        if (task.abortController.signal.aborted) {
          return
        }

        const errorMessage = error instanceof Error ? error.message : String(error)
        entry.status = 'failed'
        entry.errorMessage = errorMessage
        entry.updatedAt = this.now()
        this.persistCache(task.paperId, task.cache)
        this.emitProgress(task, entry, errorMessage)

        this.deps.logger.warn('段落翻译失败', 'main', {
          paperId: task.paperId,
          segmentId: entry.id,
          error: errorMessage
        })
      }
    } finally {
      task.inFlightIndexes.delete(entryIndex)
    }
  }

  private buildPrompt(entries: PaperTranslationEntry[], currentIndex: number): string {
    const currentEntry = entries[currentIndex]
    const previousEntry = entries[currentIndex - 1]
    const nextEntry = entries[currentIndex + 1]
    const isAffiliationSegment = isPaperAffiliationLikeSegment(currentEntry)
    const isReferenceSegment = isPaperReferenceLikeSegment(currentEntry)

    const parts = [
      '你是一个专业的学术论文翻译助手，请将当前 Markdown 段落翻译成中文。',
      '只翻译 <current_segment> 标签内的内容。',
      '<previous_context> 和 <next_context> 仅用于术语与语境参考，绝不能复述、复制或翻译到输出中。',
      '翻译要求：',
      '1. 只输出翻译后的 Markdown，不要输出解释、前言、注释或额外说明。',
      '2. 作者姓名、人名、邮箱、ORCID 保持原样不要翻译；机构、院系、实验室、学校和地名请翻译为常用中文译法，必要时保留英文缩写。',
      '3. 保留公式、变量名、引用编号、列表序号、链接、图片语法、表格结构和列表层级。',
      '4. 如原文已经是中文，仅做必要的学术化润色并保持原意。',
      '5. 不要遗漏内容，也不要补充原文没有的信息。',
      '6. 如果当前段落是标题，只输出标题本身，不要并入后续正文。',
      '7. 不要输出任何 XML 标签。',
      '8. 专有名词（如技术术语、模型名称、数据集名称、协议名称等）保持英文原文，不要翻译，以免造成歧义。'
    ]

    if (isAffiliationSegment) {
      parts.push(
        '8. 当前段落是作者机构信息：请完整翻译单位、院系、实验室与地址信息，但保留邮箱、人员姓名与常见英文缩写。'
      )
    }

    if (isReferenceSegment) {
      parts.push(
        '9. 当前段落是参考文献：保留作者姓名、年份、卷期、页码、DOI、arXiv、编号和链接；翻译论文标题、书名、期刊/会议名称、出版说明以及连接词（如 In:）。'
      )
    }

    if (previousEntry) {
      parts.push('<previous_context>')
      parts.push(previousEntry.originalMarkdown)
      parts.push('</previous_context>')
    }

    parts.push(`<current_segment kind="${currentEntry.kind}">`)
    parts.push(currentEntry.originalMarkdown)
    parts.push('</current_segment>')

    if (nextEntry) {
      parts.push('<next_context>')
      parts.push(nextEntry.originalMarkdown)
      parts.push('</next_context>')
    }

    return parts.join('\n\n')
  }

  private sanitizeTranslatedMarkdown(segment: PaperTranslationSegment, rawOutput: string): string {
    let content = rawOutput.trim()
    const fenceMatch = content.match(/^```(?:markdown)?\s*([\s\S]*?)\s*```$/i)
    if (fenceMatch) {
      content = fenceMatch[1].trim()
    }

    content = stripPromptArtifacts(content)

    if (!content) {
      throw new Error('模型未返回有效翻译结果')
    }

    if (segment.kind === 'heading') {
      const headingMatch = segment.originalMarkdown.match(/^(#{1,6})\s+/)
      if (headingMatch) {
        const headingPrefix = headingMatch[1]
        const headingBlock = getFirstMeaningfulBlock(content)
        const headingText = headingBlock
          .split('\n')
          .map((line) => line.trim())
          .filter(Boolean)
          .join(' ')
          .replace(/^#{1,6}\s+/, '')
          .trim()

        if (!headingText) {
          throw new Error('标题段翻译结果为空')
        }

        content = `${headingPrefix} ${headingText}`
      }
    }

    return preserveLeadingMarker(segment, content)
  }

  private persistCache(paperId: string, cache: PaperTranslationCache): void {
    cache.completedSegments = countCompletedSegments(cache.entries)
    cache.updatedAt = this.now()

    const saveResult = this.deps.saveCache(paperId, cache)
    if (!saveResult.success) {
      this.deps.logger.warn('写入翻译缓存失败', 'main', {
        paperId,
        error: saveResult.error
      })
    }
  }

  private emitProgress(
    task: ActiveTranslationTask,
    entry: PaperTranslationEntry,
    errorMessage?: string
  ): void {
    const listeners = this.progressListeners.get(task.paperId)
    if (!listeners || listeners.size === 0) {
      return
    }

    const progress: PaperTranslationProgress = {
      paperId: task.paperId,
      sourceHash: task.sourceHash,
      segmentId: entry.id,
      status: entry.status,
      completedSegments: task.cache.completedSegments,
      totalSegments: task.cache.totalSegments,
      isRunning: hasRunningEntries(task.cache.entries),
      entry: cloneEntry(entry),
      translationRevisionId: task.cache.translationRevisionId,
      errorMessage
    }

    listeners.forEach((listener) => {
      listener(progress)
    })
  }
}
