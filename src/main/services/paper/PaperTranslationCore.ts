import { createHash } from 'crypto'
import type { LLMConfig } from '../../../shared/types/config'
import type {
  PaperTranslationCache,
  PaperTranslationEntry,
  PaperTranslationProgress,
  PaperTranslationSegment
} from '../../../shared/types/paper'
import {
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
}

const DEFAULT_CONCURRENCY = 3

export function computePaperTranslationSourceHash(markdown: string): string {
  return createHash('sha256').update(markdown).digest('hex')
}

export function isAuthorLikeSegment(segment: PaperTranslationSegment): boolean {
  if (segment.kind === 'code') {
    return true
  }

  const text = segment.originalText.replace(/\s+/g, ' ').trim()
  if (!text) {
    return true
  }

  if (
    /@/.test(text) ||
    /\bORCID\b/i.test(text) ||
    /correspond(?:ing)?\s+author/i.test(text) ||
    /通讯作者|共同一作|equal contribution/i.test(text)
  ) {
    return true
  }

  if (/^\d+(?:\s*,\s*\d+)*$/.test(text)) {
    return true
  }

  if (/^\*+\s*[A-Za-z]/.test(text)) {
    return true
  }

  const compactText = text.replace(/\s+/g, ' ').trim()
  const personClusterPattern =
    /^(?:[A-Z][A-Za-z.'-]+(?:\s+[A-Z][A-Za-z.'-]+){1,3}(?:\s+\d+(?:,\d+)*[*†‡]*)?\s*){2,}$/

  return personClusterPattern.test(compactText)
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
    markdown: string
  ): {
    success: boolean
    data?: { cache: PaperTranslationCache | null; isRunning: boolean }
    error?: string
  } {
    const sourceHash = computePaperTranslationSourceHash(markdown)
    const validCache = this.readValidCache(paperId, sourceHash)
    const runningTask = this.tasks.get(paperId)

    return {
      success: true,
      data: {
        cache: runningTask?.cache ?? validCache,
        isRunning: runningTask?.sourceHash === sourceHash
      }
    }
  }

  async startTranslation(
    paperId: string,
    markdown: string
  ): Promise<{ success: boolean; alreadyRunning?: boolean; error?: string }> {
    const sourceHash = computePaperTranslationSourceHash(markdown)
    const segments = parsePaperTranslationSegments(markdown)

    if (segments.length === 0) {
      return { success: false, error: '没有可翻译的正文内容' }
    }

    const existingTask = this.tasks.get(paperId)
    if (existingTask && existingTask.sourceHash === sourceHash) {
      return { success: true, alreadyRunning: true }
    }

    if (existingTask) {
      existingTask.abortController.abort()
      this.tasks.delete(paperId)
    }

    const cache = this.buildCache(paperId, sourceHash, segments)
    this.persistCache(paperId, cache)

    const pendingEntries = cache.entries.filter(
      (entry) => entry.status === 'queued' || entry.status === 'failed'
    )

    if (pendingEntries.length === 0) {
      return { success: true }
    }

    const llmConfig = this.deps.getDefaultLlmConfig()
    if (!llmConfig) {
      return { success: false, error: '未找到可用的默认模型配置' }
    }

    const task: ActiveTranslationTask = {
      paperId,
      sourceHash,
      cache,
      abortController: new AbortController(),
      promise: null
    }

    this.tasks.set(paperId, task)
    task.promise = this.runTask(task, llmConfig)

    return { success: true }
  }

  private readValidCache(paperId: string, sourceHash: string): PaperTranslationCache | null {
    const cachedResult = this.deps.readCache(paperId)
    if (!cachedResult.success || !cachedResult.data) {
      return null
    }

    if (cachedResult.data.sourceHash !== sourceHash) {
      const clearResult = this.deps.clearCache(paperId)
      if (!clearResult.success) {
        this.deps.logger.warn('翻译缓存失效后清理失败', 'main', {
          paperId,
          error: clearResult.error
        })
      }
      return null
    }

    return cachedResult.data
  }

  private buildCache(
    paperId: string,
    sourceHash: string,
    segments: PaperTranslationSegment[]
  ): PaperTranslationCache {
    const existingCache = this.readValidCache(paperId, sourceHash)
    const previousEntries = new Map(
      (existingCache?.entries ?? []).map((entry) => [entry.id, entry] as const)
    )
    const updatedAt = this.now()

    const entries = segments.map<PaperTranslationEntry>((segment) => {
      const previousEntry = previousEntries.get(segment.id)
      const shouldSkip = isAuthorLikeSegment(segment)

      if (shouldSkip) {
        return {
          ...segment,
          status: 'skipped',
          translatedMarkdown: segment.originalMarkdown,
          translatedText: segment.originalText,
          updatedAt
        }
      }

      if (
        previousEntry &&
        previousEntry.originalMarkdown === segment.originalMarkdown &&
        (previousEntry.status === 'completed' || previousEntry.status === 'skipped') &&
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
      sourceHash,
      totalSegments: entries.length,
      completedSegments: countCompletedSegments(entries),
      entries,
      updatedAt
    }
  }

  private async runTask(task: ActiveTranslationTask, llmConfig: LLMConfig): Promise<void> {
    const pendingIndexes = task.cache.entries
      .map((entry, index) => ({ entry, index }))
      .filter(({ entry }) => entry.status === 'queued' || entry.status === 'failed')
      .map(({ index }) => index)

    let cursor = 0

    const workerCount = Math.min(this.concurrency, pendingIndexes.length)

    try {
      await Promise.all(
        Array.from({ length: workerCount }, async () => {
          while (!task.abortController.signal.aborted) {
            const nextCursor = cursor
            cursor += 1

            if (nextCursor >= pendingIndexes.length) {
              return
            }

            const entryIndex = pendingIndexes[nextCursor]
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
  }

  private buildPrompt(entries: PaperTranslationEntry[], currentIndex: number): string {
    const currentEntry = entries[currentIndex]
    const previousEntry = entries[currentIndex - 1]
    const nextEntry = entries[currentIndex + 1]

    const parts = [
      '你是一个专业的学术论文翻译助手，请将当前 Markdown 段落翻译成中文。',
      '翻译要求：',
      '1. 只输出翻译后的 Markdown，不要输出解释、前言、注释或额外说明。',
      '2. 作者姓名、人名、邮箱、ORCID、参考文献中的作者名、机构专名保持原样，不要翻译。',
      '3. 保留公式、变量名、引用编号、链接、图片语法、表格结构和列表层级。',
      '4. 如原文已经是中文，仅做必要的学术化润色并保持原意。',
      '5. 不要遗漏内容，也不要补充原文没有的信息。'
    ]

    if (previousEntry) {
      parts.push('[上一段原文参考]')
      parts.push(previousEntry.originalMarkdown)
    }

    parts.push('[当前需要翻译的段落]')
    parts.push(currentEntry.originalMarkdown)

    if (nextEntry) {
      parts.push('[下一段原文参考]')
      parts.push(nextEntry.originalMarkdown)
    }

    return parts.join('\n\n')
  }

  private sanitizeTranslatedMarkdown(segment: PaperTranslationSegment, rawOutput: string): string {
    let content = rawOutput.trim()
    const fenceMatch = content.match(/^```(?:markdown)?\s*([\s\S]*?)\s*```$/i)
    if (fenceMatch) {
      content = fenceMatch[1].trim()
    }

    if (!content) {
      throw new Error('模型未返回有效翻译结果')
    }

    if (segment.kind === 'heading') {
      const headingMatch = segment.originalMarkdown.match(/^(#{1,6})\s+/)
      if (headingMatch) {
        const headingPrefix = headingMatch[1]
        content = `${headingPrefix} ${content.replace(/^#{1,6}\s+/, '').trim()}`
      }
    }

    return content
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
      errorMessage
    }

    listeners.forEach((listener) => {
      listener(progress)
    })
  }
}
