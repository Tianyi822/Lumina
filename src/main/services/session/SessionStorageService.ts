import { createReadStream, existsSync } from 'fs'
import { appendFile, mkdir, open, readFile, readdir, rename, rm, unlink } from 'fs/promises'
import { join } from 'path'
import { createInterface } from 'readline'
import { logger } from '@main/services/logger'
import type {
  SessionData,
  SessionJsonlRecord,
  SessionListItem,
  SessionMessage,
  SessionMetaData,
  SessionMetaPatch
} from '@shared/types/session'
import {
  getDataDirPath,
  getSessionJsonlFileName,
  extractSessionIdFromFileName,
  isValidSessionId
} from './sessionPaths'

// index 文件名与 schema 版本
const INDEX_FILE_NAME = 'index.json'
const INDEX_SCHEMA_VERSION = 1
// meta 行数超过该阈值时压实文件
const META_COMPACTION_THRESHOLD = 20
// index 写队列的保留键（与 sessionId 命名空间隔离）
const INDEX_QUEUE_KEY = '__index__'

/** index.json 的持久化形状 */
interface SessionIndexFile {
  schemaVersion: number
  sessions: SessionListItem[]
}

/** 会话文件解析结果 */
interface ParsedSessionFile {
  meta: SessionMetaData
  messages: SessionMessage[]
  metaLineCount: number
}

/** meta 行 data 载荷的轻量结构守卫 */
function isSessionMetaData(value: unknown): value is SessionMetaData {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.sessionId === 'string' &&
    typeof record.title === 'string' &&
    typeof record.sessionType === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.updatedAt === 'string'
  )
}

/** message 行 data 载荷的轻量结构守卫 */
function isSessionMessage(value: unknown): value is SessionMessage {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.role === 'string' &&
    typeof record.content === 'string'
  )
}

/** 解析单行 JSONL 记录，无法解析返回 null */
function parseJsonlRecord(line: string): SessionJsonlRecord | null {
  try {
    const parsed = JSON.parse(line) as Record<string, unknown>
    if (parsed.kind === 'meta' && isSessionMetaData(parsed.data)) {
      return { kind: 'meta', v: 1, data: parsed.data }
    }
    if (parsed.kind === 'message' && isSessionMessage(parsed.data)) {
      return { kind: 'message', data: parsed.data }
    }
    return null
  } catch {
    return null
  }
}

/** 从完整会话数据提取 meta 载荷 */
function toMetaData(data: SessionData): SessionMetaData {
  const { messages: _messages, ...meta } = data
  return meta
}

/** 从 meta 载荷组装列表项 */
function toListItem(meta: SessionMetaData): SessionListItem {
  return {
    sessionId: meta.sessionId,
    title: meta.title,
    sessionType: meta.sessionType || 'default',
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    resourceRef: meta.resourceRef
  }
}

/** 序列化一条 JSONL 记录（带换行） */
function serializeRecord(record: SessionJsonlRecord): string {
  return JSON.stringify(record) + '\n'
}

/** 旧格式 SessionData 的最小结构守卫（迁移用） */
function isLegacySessionData(value: unknown): value is SessionData {
  if (typeof value !== 'object' || value === null) {
    return false
  }
  const record = value as Record<string, unknown>
  return (
    typeof record.sessionId === 'string' &&
    isValidSessionId(record.sessionId) &&
    typeof record.title === 'string' &&
    Array.isArray(record.messages)
  )
}

/**
 * 会话 JSONL 存储层
 * 职责：追加写、原子重写、流式加载、index 维护、旧 JSON 迁移、每会话写队列
 * 不做业务编排（由 SessionService 负责）
 */
export class SessionStorageService {
  private readonly rootDirProvider: () => string
  private queueTails = new Map<string, Promise<unknown>>()

  constructor(rootDirProvider: () => string = getDataDirPath) {
    this.rootDirProvider = rootDirProvider
  }

  private get rootDir(): string {
    return this.rootDirProvider()
  }

  private get indexPath(): string {
    return join(this.rootDir, INDEX_FILE_NAME)
  }

  private sessionFilePath(sessionId: string): string {
    return join(this.rootDir, getSessionJsonlFileName(sessionId))
  }

  /**
   * 按键串行化操作：同一会话的所有变更严格排队，会话间互不阻塞
   * index 使用保留键 INDEX_QUEUE_KEY 独立排队
   */
  private runExclusive<T>(key: string, operation: () => Promise<T>): Promise<T> {
    const tail = this.queueTails.get(key) ?? Promise.resolve()
    const next = tail.then(operation, operation)
    this.queueTails.set(
      key,
      next.then(
        () => undefined,
        () => undefined
      )
    )
    return next
  }

  /**
   * 初始化：建目录 → 恢复孤儿 tmp → 迁移旧 JSON → 确保 index 可用
   */
  async initialize(): Promise<void> {
    await mkdir(this.rootDir, { recursive: true })
    await this.recoverTemporaryFiles()
    await this.migrateLegacyJsonFiles()
    await this.ensureIndex()
  }

  /** 全量原子重写会话文件（创建 / 编辑 / compaction 共用） */
  async rewriteSession(data: SessionData): Promise<void> {
    await this.runExclusive(data.sessionId, async () => {
      await mkdir(this.rootDir, { recursive: true })
      const meta = toMetaData(data)
      await this.writeSessionFileAtomically(meta, data.messages)
      await this.upsertIndex(toListItem(meta))
    })
  }

  /** 追加一批消息；目标会话不存在返回 false */
  async appendMessages(sessionId: string, messages: SessionMessage[]): Promise<boolean> {
    return this.runExclusive(sessionId, async () => {
      const filePath = this.sessionFilePath(sessionId)
      if (!existsSync(filePath)) {
        return false
      }
      let content = ''
      for (const message of messages) {
        content += serializeRecord({ kind: 'message', data: message })
      }
      await appendFile(filePath, content, 'utf-8')
      await this.touchIndex(sessionId)
      return true
    })
  }

  /**
   * 追加一条合并后的 meta 行（最后一条生效）
   * meta 行数超过阈值时改为压实重写；目标会话不存在返回 false
   */
  async appendMeta(sessionId: string, patch: SessionMetaPatch): Promise<boolean> {
    return this.runExclusive(sessionId, async () => {
      const current = await this.readSessionFile(sessionId)
      if (!current) {
        return false
      }
      const nextMeta: SessionMetaData = {
        ...current.meta,
        ...(patch.title !== undefined ? { title: patch.title } : {}),
        ...(patch.selectionState !== undefined ? { selectionState: patch.selectionState } : {}),
        ...(patch.capabilities !== undefined ? { capabilities: patch.capabilities } : {}),
        updatedAt: new Date().toISOString()
      }
      if (current.metaLineCount + 1 > META_COMPACTION_THRESHOLD) {
        await this.writeSessionFileAtomically(nextMeta, current.messages)
      } else {
        await appendFile(
          this.sessionFilePath(sessionId),
          serializeRecord({ kind: 'meta', v: 1, data: nextMeta }),
          'utf-8'
        )
      }
      await this.upsertIndex(toListItem(nextMeta))
      return true
    })
  }

  /** 流式加载会话；文件不存在或无有效 meta 返回 null */
  async loadSession(sessionId: string): Promise<SessionData | null> {
    const parsed = await this.readSessionFile(sessionId)
    if (!parsed) {
      return null
    }
    return { ...parsed.meta, messages: parsed.messages }
  }

  /** 读取会话列表（index 缺失或损坏时重建） */
  async listSessions(): Promise<SessionListItem[]> {
    const sessions = await this.runExclusive(INDEX_QUEUE_KEY, async () => {
      const existing = await this.readIndex()
      if (existing) {
        return existing
      }
      const rebuilt = await this.scanListItems()
      await this.writeIndexAtomically(rebuilt)
      return rebuilt
    })
    return [...sessions].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  }

  /** 删除会话文件与 index 条目；文件不存在返回 false */
  async deleteSession(sessionId: string): Promise<boolean> {
    return this.runExclusive(sessionId, async () => {
      const filePath = this.sessionFilePath(sessionId)
      const existed = existsSync(filePath)
      await rm(filePath, { force: true })
      await rm(`${filePath}.tmp`, { force: true })
      await this.removeFromIndex(sessionId)
      return existed
    })
  }

  /** 异步遍历全部会话（供批处理），每 10 个让出事件循环 */
  async *iterateSessions(): AsyncGenerator<SessionData, void, void> {
    if (!existsSync(this.rootDir)) {
      return
    }
    const files = await readdir(this.rootDir)
    let processedCount = 0
    for (const file of files) {
      if (!file.endsWith('.jsonl')) {
        continue
      }
      const sessionId = file.slice(0, -'.jsonl'.length)
      if (!isValidSessionId(sessionId)) {
        continue
      }
      const session = await this.loadSession(sessionId)
      if (session) {
        yield session
        processedCount++
        if (processedCount % 10 === 0) {
          await new Promise<void>((resolve) => setImmediate(resolve))
        }
      }
    }
  }

  /** 逐行流式解析会话文件；跳过无法解析的行 */
  private async readSessionFile(sessionId: string): Promise<ParsedSessionFile | null> {
    if (!isValidSessionId(sessionId)) {
      return null
    }
    const filePath = this.sessionFilePath(sessionId)
    if (!existsSync(filePath)) {
      return null
    }
    let meta: SessionMetaData | null = null
    let metaLineCount = 0
    const messages: SessionMessage[] = []
    const reader = createInterface({
      input: createReadStream(filePath, { encoding: 'utf-8' }),
      crlfDelay: Infinity
    })
    for await (const line of reader) {
      if (!line.trim()) {
        continue
      }
      const record = parseJsonlRecord(line)
      if (!record) {
        logger.warn('跳过无法解析的会话记录行', 'main', { sessionId })
        continue
      }
      if (record.kind === 'meta') {
        meta = record.data
        metaLineCount++
      } else {
        messages.push(record.data)
      }
    }
    if (!meta) {
      return null
    }
    return { meta, messages, metaLineCount }
  }

  /** 原子写整份会话文件（tmp → fsync → rename） */
  private async writeSessionFileAtomically(
    meta: SessionMetaData,
    messages: SessionMessage[]
  ): Promise<void> {
    const filePath = this.sessionFilePath(meta.sessionId)
    const temporaryPath = `${filePath}.tmp`
    const file = await open(temporaryPath, 'w')
    try {
      let content = serializeRecord({ kind: 'meta', v: 1, data: meta })
      for (const message of messages) {
        content += serializeRecord({ kind: 'message', data: message })
      }
      await file.writeFile(content)
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporaryPath, filePath)
  }

  /** 读取 index；缺失或损坏返回 null */
  private async readIndex(): Promise<SessionListItem[] | null> {
    try {
      const content = await readFile(this.indexPath, 'utf-8')
      const parsed = JSON.parse(content) as SessionIndexFile
      if (parsed.schemaVersion !== INDEX_SCHEMA_VERSION || !Array.isArray(parsed.sessions)) {
        return null
      }
      return parsed.sessions
    } catch {
      return null
    }
  }

  /** 原子写 index（tmp → fsync → rename） */
  private async writeIndexAtomically(sessions: SessionListItem[]): Promise<void> {
    const payload: SessionIndexFile = { schemaVersion: INDEX_SCHEMA_VERSION, sessions }
    const temporaryPath = `${this.indexPath}.tmp`
    const file = await open(temporaryPath, 'w')
    try {
      await file.writeFile(JSON.stringify(payload, null, 2))
      await file.sync()
    } finally {
      await file.close()
    }
    await rename(temporaryPath, this.indexPath)
  }

  /** 更新或插入一条 index 条目 */
  private async upsertIndex(item: SessionListItem): Promise<void> {
    await this.runExclusive(INDEX_QUEUE_KEY, async () => {
      const sessions = (await this.readIndex()) ?? (await this.scanListItems())
      const next = sessions.filter((entry) => entry.sessionId !== item.sessionId)
      next.push(item)
      await this.writeIndexAtomically(next)
    })
  }

  /** 仅刷新 index 条目的 updatedAt（消息追加后调用） */
  private async touchIndex(sessionId: string): Promise<void> {
    await this.runExclusive(INDEX_QUEUE_KEY, async () => {
      const sessions = (await this.readIndex()) ?? (await this.scanListItems())
      const target = sessions.find((entry) => entry.sessionId === sessionId)
      if (target) {
        target.updatedAt = new Date().toISOString()
      }
      await this.writeIndexAtomically(sessions)
    })
  }

  /** 从 index 移除条目 */
  private async removeFromIndex(sessionId: string): Promise<void> {
    await this.runExclusive(INDEX_QUEUE_KEY, async () => {
      const sessions = (await this.readIndex()) ?? (await this.scanListItems())
      await this.writeIndexAtomically(sessions.filter((entry) => entry.sessionId !== sessionId))
    })
  }

  /** 扫描全部 .jsonl 组装列表项（index 重建路径） */
  private async scanListItems(): Promise<SessionListItem[]> {
    const items: SessionListItem[] = []
    const files = await readdir(this.rootDir)
    for (const file of files) {
      if (!file.endsWith('.jsonl')) {
        continue
      }
      const sessionId = file.slice(0, -'.jsonl'.length)
      if (!isValidSessionId(sessionId)) {
        continue
      }
      const parsed = await this.readSessionFile(sessionId)
      if (parsed) {
        items.push(toListItem(parsed.meta))
      }
    }
    return items
  }

  /** index 不可用时重建并写盘 */
  private async ensureIndex(): Promise<void> {
    await this.runExclusive(INDEX_QUEUE_KEY, async () => {
      if ((await this.readIndex()) !== null) {
        return
      }
      await this.writeIndexAtomically(await this.scanListItems())
    })
  }

  /** 启动恢复：孤儿 .jsonl.tmp 与 index.json.tmp */
  private async recoverTemporaryFiles(): Promise<void> {
    const files = await readdir(this.rootDir)
    for (const file of files) {
      if (!file.endsWith('.jsonl.tmp')) {
        continue
      }
      const targetName = file.slice(0, -'.tmp'.length)
      const sessionId = targetName.slice(0, -'.jsonl'.length)
      const temporaryPath = join(this.rootDir, file)
      const targetPath = join(this.rootDir, targetName)
      if (!isValidSessionId(sessionId) || existsSync(targetPath)) {
        await rm(temporaryPath, { force: true })
        continue
      }
      try {
        // 校验 tmp 内容首条 meta 有效且 sessionId 匹配后才恢复
        const content = await readFile(temporaryPath, 'utf-8')
        const firstLine = content.split('\n').find((line) => line.trim().length > 0)
        const record = firstLine ? parseJsonlRecord(firstLine) : null
        if (record?.kind === 'meta' && record.data.sessionId === sessionId) {
          await rename(temporaryPath, targetPath)
        } else {
          await rm(temporaryPath, { force: true })
        }
      } catch {
        await rm(temporaryPath, { force: true })
      }
    }
    // index tmp：目标缺失且可解析时恢复，否则清理
    const indexTemporaryPath = `${this.indexPath}.tmp`
    if (existsSync(indexTemporaryPath)) {
      let recovered = false
      if (!existsSync(this.indexPath)) {
        try {
          const content = await readFile(indexTemporaryPath, 'utf-8')
          const parsed = JSON.parse(content) as SessionIndexFile
          if (parsed.schemaVersion === INDEX_SCHEMA_VERSION && Array.isArray(parsed.sessions)) {
            await rename(indexTemporaryPath, this.indexPath)
            recovered = true
          }
        } catch {
          // 解析失败走清理分支
        }
      }
      if (!recovered) {
        await rm(indexTemporaryPath, { force: true })
      }
    }
  }

  /** 一次性迁移旧格式 {sessionId}-{title}.json → {sessionId}.jsonl */
  private async migrateLegacyJsonFiles(): Promise<void> {
    const files = await readdir(this.rootDir)
    for (const file of files) {
      if (!file.endsWith('.json') || file === INDEX_FILE_NAME) {
        continue
      }
      const sessionId = extractSessionIdFromFileName(file)
      if (!sessionId) {
        logger.warn('跳过无法识别的旧会话文件', 'main', { file })
        continue
      }
      const legacyPath = join(this.rootDir, file)
      const targetPath = this.sessionFilePath(sessionId)
      if (existsSync(targetPath)) {
        // 幂等保护：新数据已存在，旧文件改名避免每次启动重复处理
        await rename(legacyPath, `${legacyPath}.migrated`)
        logger.warn('旧会话文件对应的 JSONL 已存在，已改名保留', 'main', { file })
        continue
      }
      try {
        const content = await readFile(legacyPath, 'utf-8')
        const parsed = JSON.parse(content) as unknown
        if (!isLegacySessionData(parsed) || parsed.sessionId !== sessionId) {
          logger.error('旧会话文件结构无效，保留原样', 'main', { file })
          continue
        }
        await this.writeSessionFileAtomically(toMetaData(parsed), parsed.messages)
        // 迁移后校验可读，再删除旧文件
        const verified = await this.readSessionFile(sessionId)
        if (!verified) {
          logger.error('迁移结果校验失败，保留旧文件', 'main', { file })
          await rm(targetPath, { force: true })
          continue
        }
        await unlink(legacyPath)
        logger.info('旧会话文件迁移成功', 'main', { sessionId })
      } catch (error) {
        logger.error('旧会话文件迁移失败，保留原样', 'main', {
          file,
          error: error instanceof Error ? error.message : String(error)
        })
      }
    }
  }
}
