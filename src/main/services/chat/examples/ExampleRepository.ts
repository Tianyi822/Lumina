// 示例仓库，负责动态示例的持久化存储和管理
// 按会话分文件存储在 ~/.sparrow-manus/few-shot-samples/ 目录下

import { readFile, writeFile, mkdir, unlink } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { EnhancedFewShotExample } from '../prompts/types'
import { logger } from '../../logger'
import { getConfigDirPath } from '../../config/configPaths'

const SHARED_EXAMPLES_SESSION_ID = '_shared'

function normalizeExample(example: EnhancedFewShotExample): EnhancedFewShotExample {
  const toolCalls = example.toolCalls?.map((toolCall) => ({
    ...toolCall
  }))
  const toolsUsed =
    example.toolsUsed && example.toolsUsed.length > 0
      ? example.toolsUsed.filter((tool) => tool.trim().length > 0)
      : (toolCalls?.map((toolCall) => toolCall.name).filter((tool) => tool.trim().length > 0) ?? [])

  return {
    ...example,
    toolCalls,
    qualityScore: example.qualityScore ?? 0,
    usageCount: example.usageCount ?? 0,
    source: 'dynamic',
    toolsUsed,
    createdAt: example.createdAt || new Date().toISOString()
  }
}

function normalizeExamples(examples: EnhancedFewShotExample[]): EnhancedFewShotExample[] {
  return examples.map((example) => normalizeExample(example))
}

// 单个会话的示例文件结构
interface SessionExampleFile {
  // 会话 ID
  sessionId: string
  // 示例列表
  examples: EnhancedFewShotExample[]
  // 最后更新时间
  lastUpdated: string
}

// 索引文件结构
interface ExampleRepositoryIndex {
  // 版本
  version: number
  // 最后更新时间
  lastUpdated: string
  // 会话元数据列表
  sessions: Array<{
    sessionId: string
    exampleCount: number
    lastUpdated: string
  }>
}

// 示例仓库
export class ExampleRepository {
  private index: ExampleRepositoryIndex
  private _samplesDir: string | null = null
  private initialized: boolean = false

  // 延迟获取示例目录路径（确保 app 已初始化）
  private get samplesDir(): string {
    if (!this._samplesDir) {
      this._samplesDir = join(getConfigDirPath(), 'few-shot-samples')
      logger.info('示例仓库目录路径', 'main', { dir: this._samplesDir })
    }
    return this._samplesDir
  }

  // 索引文件路径
  private get indexPath(): string {
    return join(this.samplesDir, 'index.json')
  }

  constructor() {
    this.index = {
      version: 1,
      lastUpdated: new Date().toISOString(),
      sessions: []
    }
  }

  // 初始化仓库（从文件加载索引）
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      // 确保目录存在
      if (!existsSync(this.samplesDir)) {
        await mkdir(this.samplesDir, { recursive: true })
      }

      // 加载或创建索引
      if (existsSync(this.indexPath)) {
        const content = await readFile(this.indexPath, 'utf-8')
        this.index = JSON.parse(content)
        logger.info('示例仓库索引加载成功', 'main', {
          sessionCount: this.index.sessions.length
        })
      } else {
        await this.saveIndex()
        logger.info('示例仓库索引创建成功', 'main')
      }

      this.initialized = true
    } catch (error) {
      logger.error('示例仓库初始化失败', 'main', { error })
      this.index = {
        version: 1,
        lastUpdated: new Date().toISOString(),
        sessions: []
      }
      await this.saveIndex()
      this.initialized = true
    }
  }

  // 获取所有示例（从所有会话文件中加载）
  async getAll(): Promise<EnhancedFewShotExample[]> {
    await this.ensureInitialized()
    const allExamples: EnhancedFewShotExample[] = []

    for (const sessionMeta of this.index.sessions) {
      const sessionFile = await this.loadSessionFile(sessionMeta.sessionId)
      if (sessionFile) {
        allExamples.push(...sessionFile.examples)
      }
    }

    return allExamples
  }

  // 根据 ID 获取示例
  async getById(id: string): Promise<EnhancedFewShotExample | null> {
    await this.ensureInitialized()
    const allExamples = await this.getAll()
    return allExamples.find((ex) => ex.id === id) || null
  }

  // 根据工具获取示例
  async getByTool(toolName: string): Promise<EnhancedFewShotExample[]> {
    await this.ensureInitialized()
    const allExamples = await this.getAll()
    return allExamples.filter((ex) => ex.toolsUsed.includes(toolName))
  }

  // 获取动态示例
  async getDynamicExamples(): Promise<EnhancedFewShotExample[]> {
    return this.getAll()
  }

  // 添加示例（按会话分组保存）
  async add(examples: EnhancedFewShotExample[]): Promise<void> {
    await this.ensureInitialized()

    // 按会话 ID 分组
    const examplesBySession = new Map<string, EnhancedFewShotExample[]>()

    for (const example of normalizeExamples(examples)) {
      const sessionId = await this.resolveStorageSessionId(example)
      const existing = examplesBySession.get(sessionId) || []
      existing.push(example)
      examplesBySession.set(sessionId, existing)
    }

    for (const [sessionId, sessionExamples] of examplesBySession.entries()) {
      await this.saveToSessionFile(sessionId, sessionExamples)
    }

    logger.info('示例添加成功', 'main', {
      count: examples.length,
      sessions: examplesBySession.size
    })
  }

  // 保存示例到指定会话文件
  private async saveToSessionFile(
    sessionId: string,
    examples: EnhancedFewShotExample[]
  ): Promise<void> {
    const filePath = join(this.samplesDir, `${sessionId}.json`)

    // 加载现有文件（如果存在）
    let sessionFile: SessionExampleFile
    if (existsSync(filePath)) {
      try {
        const content = await readFile(filePath, 'utf-8')
        const parsed = JSON.parse(content) as SessionExampleFile
        sessionFile = {
          ...parsed,
          sessionId,
          examples: normalizeExamples(parsed.examples || [])
        }
      } catch {
        sessionFile = {
          sessionId,
          examples: [],
          lastUpdated: new Date().toISOString()
        }
      }
    } else {
      sessionFile = {
        sessionId,
        examples: [],
        lastUpdated: new Date().toISOString()
      }
    }

    // 更新或添加示例
    for (const example of normalizeExamples(examples)) {
      const existingIndex = sessionFile.examples.findIndex((ex) => ex.id === example.id)
      if (existingIndex >= 0) {
        sessionFile.examples[existingIndex] = example
      } else {
        sessionFile.examples.push(example)
      }
    }

    sessionFile.lastUpdated = new Date().toISOString()

    // 保存会话文件
    await writeFile(filePath, JSON.stringify(sessionFile, null, 2), 'utf-8')

    // 更新索引
    const sessionMeta = this.index.sessions.find((s) => s.sessionId === sessionId)
    if (sessionMeta) {
      sessionMeta.exampleCount = sessionFile.examples.length
      sessionMeta.lastUpdated = sessionFile.lastUpdated
    } else {
      this.index.sessions.push({
        sessionId,
        exampleCount: sessionFile.examples.length,
        lastUpdated: sessionFile.lastUpdated
      })
    }

    this.index.lastUpdated = new Date().toISOString()
    await this.saveIndex()
  }

  // 加载会话文件
  private async loadSessionFile(sessionId: string): Promise<SessionExampleFile | null> {
    try {
      const filePath = join(this.samplesDir, `${sessionId}.json`)
      if (!existsSync(filePath)) {
        return null
      }
      const content = await readFile(filePath, 'utf-8')
      const sessionFile = JSON.parse(content) as SessionExampleFile
      return {
        ...sessionFile,
        sessionId,
        examples: normalizeExamples(sessionFile.examples || [])
      }
    } catch (error) {
      logger.error('加载会话示例文件失败', 'main', { sessionId, error })
      return null
    }
  }

  // 更新示例
  async update(examples: EnhancedFewShotExample[]): Promise<void> {
    await this.ensureInitialized()

    // 按会话分组更新
    const examplesBySession = new Map<string, EnhancedFewShotExample[]>()

    for (const example of normalizeExamples(examples)) {
      const sessionId = await this.resolveStorageSessionId(example)
      const existing = examplesBySession.get(sessionId) || []
      existing.push(example)
      examplesBySession.set(sessionId, existing)
    }

    for (const [sessionId, sessionExamples] of examplesBySession.entries()) {
      await this.updateInSessionFile(sessionId, sessionExamples)
    }

    logger.info('示例更新成功', 'main', { count: examples.length })
  }

  // 在会话文件中更新示例（不添加新示例）
  private async updateInSessionFile(
    sessionId: string,
    examples: EnhancedFewShotExample[]
  ): Promise<void> {
    const filePath = join(this.samplesDir, `${sessionId}.json`)

    if (!existsSync(filePath)) {
      return
    }

    try {
      const content = await readFile(filePath, 'utf-8')
      const rawSessionFile = JSON.parse(content) as SessionExampleFile
      const sessionFile: SessionExampleFile = {
        ...rawSessionFile,
        sessionId,
        examples: normalizeExamples(rawSessionFile.examples || [])
      }

      for (const example of normalizeExamples(examples)) {
        const index = sessionFile.examples.findIndex((ex) => ex.id === example.id)
        if (index >= 0) {
          sessionFile.examples[index] = example
        }
      }

      sessionFile.lastUpdated = new Date().toISOString()
      await writeFile(filePath, JSON.stringify(sessionFile, null, 2), 'utf-8')

      // 更新索引
      const sessionMeta = this.index.sessions.find((s) => s.sessionId === sessionId)
      if (sessionMeta) {
        sessionMeta.lastUpdated = sessionFile.lastUpdated
      }

      this.index.lastUpdated = new Date().toISOString()
      await this.saveIndex()
    } catch (error) {
      logger.error('更新会话示例文件失败', 'main', { sessionId, error })
    }
  }

  // 删除示例
  async delete(exampleIds: string[]): Promise<void> {
    await this.ensureInitialized()

    let totalDeleted = 0

    // 遍历所有会话文件，删除匹配的示例
    for (const sessionMeta of this.index.sessions) {
      const filePath = join(this.samplesDir, `${sessionMeta.sessionId}.json`)
      if (!existsSync(filePath)) {
        continue
      }

      try {
        const content = await readFile(filePath, 'utf-8')
        const sessionFile: SessionExampleFile = JSON.parse(content)

        const beforeCount = sessionFile.examples.length
        sessionFile.examples = sessionFile.examples.filter((ex) => !exampleIds.includes(ex.id))
        const deletedCount = beforeCount - sessionFile.examples.length

        if (deletedCount > 0) {
          totalDeleted += deletedCount

          if (sessionFile.examples.length === 0) {
            // 如果会话文件为空，删除文件
            await unlink(filePath)
            this.index.sessions = this.index.sessions.filter(
              (s) => s.sessionId !== sessionMeta.sessionId
            )
          } else {
            // 更新文件
            sessionFile.lastUpdated = new Date().toISOString()
            await writeFile(filePath, JSON.stringify(sessionFile, null, 2), 'utf-8')

            // 更新索引
            sessionMeta.exampleCount = sessionFile.examples.length
            sessionMeta.lastUpdated = sessionFile.lastUpdated
          }
        }
      } catch (error) {
        logger.error('删除会话示例失败', 'main', {
          sessionId: sessionMeta.sessionId,
          error
        })
      }
    }

    if (totalDeleted > 0) {
      this.index.lastUpdated = new Date().toISOString()
      await this.saveIndex()
      logger.info('示例删除成功', 'main', { count: totalDeleted })
    }
  }

  // 清空所有动态示例
  async clearDynamicExamples(): Promise<void> {
    await this.ensureInitialized()

    let totalDeleted = 0

    for (const sessionMeta of [...this.index.sessions]) {
      const filePath = join(this.samplesDir, `${sessionMeta.sessionId}.json`)
      if (!existsSync(filePath)) {
        continue
      }

      try {
        const content = await readFile(filePath, 'utf-8')
        const sessionFile: SessionExampleFile = JSON.parse(content)

        const beforeCount = sessionFile.examples.length
        sessionFile.examples = []
        const deletedCount = beforeCount - sessionFile.examples.length

        if (deletedCount > 0) {
          totalDeleted += deletedCount

          if (sessionFile.examples.length === 0) {
            await unlink(filePath)
            this.index.sessions = this.index.sessions.filter(
              (s) => s.sessionId !== sessionMeta.sessionId
            )
          } else {
            sessionFile.lastUpdated = new Date().toISOString()
            await writeFile(filePath, JSON.stringify(sessionFile, null, 2), 'utf-8')
            sessionMeta.exampleCount = sessionFile.examples.length
            sessionMeta.lastUpdated = sessionFile.lastUpdated
          }
        }
      } catch (error) {
        logger.error('清空动态示例失败', 'main', {
          sessionId: sessionMeta.sessionId,
          error
        })
      }
    }

    if (totalDeleted > 0) {
      this.index.lastUpdated = new Date().toISOString()
      await this.saveIndex()
      logger.info('动态示例清空成功', 'main', { count: totalDeleted })
    }
  }

  // 根据质量分数清理示例
  async cleanupByQuality(minQualityScore: number): Promise<number> {
    await this.ensureInitialized()

    let totalDeleted = 0

    for (const sessionMeta of [...this.index.sessions]) {
      const filePath = join(this.samplesDir, `${sessionMeta.sessionId}.json`)
      if (!existsSync(filePath)) {
        continue
      }

      try {
        const content = await readFile(filePath, 'utf-8')
        const sessionFile: SessionExampleFile = JSON.parse(content)

        const beforeCount = sessionFile.examples.length
        sessionFile.examples = sessionFile.examples.filter(
          (ex) => ex.qualityScore >= minQualityScore
        )
        const deletedCount = beforeCount - sessionFile.examples.length

        if (deletedCount > 0) {
          totalDeleted += deletedCount

          if (sessionFile.examples.length === 0) {
            await unlink(filePath)
            this.index.sessions = this.index.sessions.filter(
              (s) => s.sessionId !== sessionMeta.sessionId
            )
          } else {
            sessionFile.lastUpdated = new Date().toISOString()
            await writeFile(filePath, JSON.stringify(sessionFile, null, 2), 'utf-8')
            sessionMeta.exampleCount = sessionFile.examples.length
            sessionMeta.lastUpdated = sessionFile.lastUpdated
          }
        }
      } catch (error) {
        logger.error('按质量清理示例失败', 'main', {
          sessionId: sessionMeta.sessionId,
          error
        })
      }
    }

    if (totalDeleted > 0) {
      this.index.lastUpdated = new Date().toISOString()
      await this.saveIndex()
      logger.info('低质量示例清理成功', 'main', {
        count: totalDeleted,
        minQualityScore
      })
    }

    return totalDeleted
  }

  // 根据时间清理示例
  async cleanupByAge(days: number): Promise<number> {
    await this.ensureInitialized()

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    let totalDeleted = 0

    for (const sessionMeta of [...this.index.sessions]) {
      const filePath = join(this.samplesDir, `${sessionMeta.sessionId}.json`)
      if (!existsSync(filePath)) {
        continue
      }

      try {
        const content = await readFile(filePath, 'utf-8')
        const sessionFile: SessionExampleFile = JSON.parse(content)

        const beforeCount = sessionFile.examples.length
        sessionFile.examples = sessionFile.examples.filter((ex) => {
          const createdDate = new Date(ex.createdAt)
          return createdDate > cutoffDate
        })
        const deletedCount = beforeCount - sessionFile.examples.length

        if (deletedCount > 0) {
          totalDeleted += deletedCount

          if (sessionFile.examples.length === 0) {
            await unlink(filePath)
            this.index.sessions = this.index.sessions.filter(
              (s) => s.sessionId !== sessionMeta.sessionId
            )
          } else {
            sessionFile.lastUpdated = new Date().toISOString()
            await writeFile(filePath, JSON.stringify(sessionFile, null, 2), 'utf-8')
            sessionMeta.exampleCount = sessionFile.examples.length
            sessionMeta.lastUpdated = sessionFile.lastUpdated
          }
        }
      } catch (error) {
        logger.error('按时间清理示例失败', 'main', {
          sessionId: sessionMeta.sessionId,
          error
        })
      }
    }

    if (totalDeleted > 0) {
      this.index.lastUpdated = new Date().toISOString()
      await this.saveIndex()
      logger.info('过期示例清理成功', 'main', { count: totalDeleted, days })
    }

    return totalDeleted
  }

  // 获取统计信息
  async getStats(): Promise<{
    total: number
    dynamic: number
    avgQualityScore: number
    lastUpdated: string
  }> {
    await this.ensureInitialized()

    const allExamples = await this.getAll()
    const avgQualityScore =
      allExamples.length > 0
        ? allExamples.reduce((sum, ex) => sum + ex.qualityScore, 0) / allExamples.length
        : 0

    return {
      total: allExamples.length,
      dynamic: allExamples.length,
      avgQualityScore,
      lastUpdated: this.index.lastUpdated
    }
  }

  // 保存索引文件
  private async saveIndex(): Promise<void> {
    try {
      if (!existsSync(this.samplesDir)) {
        await mkdir(this.samplesDir, { recursive: true })
      }
      await writeFile(this.indexPath, JSON.stringify(this.index, null, 2), 'utf-8')
    } catch (error) {
      logger.error('示例仓库索引保存失败', 'main', { error })
      throw error
    }
  }

  // 确保已初始化
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }

  // 导出为 JSON
  async exportAsJSON(): Promise<string> {
    await this.ensureInitialized()
    const allExamples = await this.getAll()
    return JSON.stringify(
      {
        examples: allExamples,
        lastUpdated: this.index.lastUpdated,
        version: this.index.version
      },
      null,
      2
    )
  }

  // 从 JSON 导入
  async importFromJSON(json: string): Promise<void> {
    try {
      const data = JSON.parse(json)
      const examples = data.examples as EnhancedFewShotExample[]

      if (!Array.isArray(examples)) {
        throw new Error('Invalid examples data')
      }

      // 使用 add 方法，会自动按会话分组
      await this.add(normalizeExamples(examples))

      logger.info('示例导入成功', 'main', { count: examples.length })
    } catch (error) {
      logger.error('示例导入失败', 'main', { error })
      throw error
    }
  }

  // 解析示例的存储会话
  private async resolveStorageSessionId(example: EnhancedFewShotExample): Promise<string> {
    if (example.sourceSessionId) {
      return example.sourceSessionId
    }

    for (const sessionMeta of this.index.sessions) {
      const sessionFile = await this.loadSessionFile(sessionMeta.sessionId)
      if (sessionFile?.examples.some((item) => item.id === example.id)) {
        return sessionMeta.sessionId
      }
    }

    return SHARED_EXAMPLES_SESSION_ID
  }
}

// 默认示例仓库实例
export const exampleRepository = new ExampleRepository()
