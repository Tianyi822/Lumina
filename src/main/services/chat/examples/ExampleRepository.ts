// 示例仓库，负责动态示例的持久化存储和管理

import { readFile, writeFile, mkdir } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import type { EnhancedFewShotExample } from '../prompts/types'
import { logger } from '../../logger'
import { getConfigDirPath } from '../../config/configPaths'

// 示例仓库数据结构
interface ExampleRepositoryData {
  // 示例列表
  examples: EnhancedFewShotExample[]
  // 最后更新时间
  lastUpdated: string
  // 版本
  version: number
}

// 示例仓库
export class ExampleRepository {
  private data: ExampleRepositoryData
  private _filePath: string | null = null
  private initialized: boolean = false

  // 延迟获取文件路径（确保 app 已初始化）
  private get filePath(): string {
    if (!this._filePath) {
      this._filePath = join(getConfigDirPath(), 'few-shot-examples.json')
      logger.info('示例仓库文件路径', 'main', { filePath: this._filePath })
    }
    return this._filePath
  }

  constructor() {
    this.data = {
      examples: [],
      lastUpdated: new Date().toISOString(),
      version: 1
    }
  }

  // 初始化仓库（从文件加载）
  async initialize(): Promise<void> {
    if (this.initialized) {
      return
    }

    try {
      if (existsSync(this.filePath)) {
        const content = await readFile(this.filePath, 'utf-8')
        this.data = JSON.parse(content)
        logger.info('示例仓库加载成功', 'main', {
          count: this.data.examples.length
        })
      } else {
        // 文件不存在，创建空仓库
        await this.save()
        logger.info('示例仓库创建成功', 'main')
      }

      this.initialized = true
    } catch (error) {
      logger.error('示例仓库初始化失败', 'main', { error })
      // 创建新仓库
      this.data = {
        examples: [],
        lastUpdated: new Date().toISOString(),
        version: 1
      }
      await this.save()
      this.initialized = true
    }
  }

  // 获取所有示例
  async getAll(): Promise<EnhancedFewShotExample[]> {
    await this.ensureInitialized()
    return [...this.data.examples]
  }

  // 根据 ID 获取示例
  async getById(id: string): Promise<EnhancedFewShotExample | null> {
    await this.ensureInitialized()
    return this.data.examples.find((ex) => ex.id === id) || null
  }

  // 根据工具获取示例
  async getByTool(toolName: string): Promise<EnhancedFewShotExample[]> {
    await this.ensureInitialized()
    return this.data.examples.filter((ex) => ex.toolsUsed.includes(toolName))
  }

  // 获取动态示例
  async getDynamicExamples(): Promise<EnhancedFewShotExample[]> {
    await this.ensureInitialized()
    return this.data.examples.filter((ex) => ex.source === 'dynamic')
  }

  // 添加示例
  async add(examples: EnhancedFewShotExample[]): Promise<void> {
    await this.ensureInitialized()

    for (const example of examples) {
      // 检查是否已存在
      const existingIndex = this.data.examples.findIndex((ex) => ex.id === example.id)
      if (existingIndex >= 0) {
        // 更新现有示例
        this.data.examples[existingIndex] = example
      } else {
        // 添加新示例
        this.data.examples.push(example)
      }
    }

    this.data.lastUpdated = new Date().toISOString()
    await this.save()

    logger.info('示例添加成功', 'main', { count: examples.length })
  }

  // 更新示例
  async update(examples: EnhancedFewShotExample[]): Promise<void> {
    await this.ensureInitialized()

    for (const example of examples) {
      const index = this.data.examples.findIndex((ex) => ex.id === example.id)
      if (index >= 0) {
        this.data.examples[index] = example
      }
    }

    this.data.lastUpdated = new Date().toISOString()
    await this.save()

    logger.info('示例更新成功', 'main', { count: examples.length })
  }

  // 删除示例
  async delete(exampleIds: string[]): Promise<void> {
    await this.ensureInitialized()

    const beforeCount = this.data.examples.length
    this.data.examples = this.data.examples.filter((ex) => !exampleIds.includes(ex.id))
    const deletedCount = beforeCount - this.data.examples.length

    if (deletedCount > 0) {
      this.data.lastUpdated = new Date().toISOString()
      await this.save()
      logger.info('示例删除成功', 'main', { count: deletedCount })
    }
  }

  // 清空所有动态示例
  async clearDynamicExamples(): Promise<void> {
    await this.ensureInitialized()

    const beforeCount = this.data.examples.length
    this.data.examples = this.data.examples.filter((ex) => ex.source === 'static')
    const deletedCount = beforeCount - this.data.examples.length

    if (deletedCount > 0) {
      this.data.lastUpdated = new Date().toISOString()
      await this.save()
      logger.info('动态示例清空成功', 'main', { count: deletedCount })
    }
  }

  // 根据质量分数清理示例
  async cleanupByQuality(minQualityScore: number): Promise<number> {
    await this.ensureInitialized()

    const beforeCount = this.data.examples.length
    this.data.examples = this.data.examples.filter(
      (ex) => ex.source === 'static' || ex.qualityScore >= minQualityScore
    )
    const deletedCount = beforeCount - this.data.examples.length

    if (deletedCount > 0) {
      this.data.lastUpdated = new Date().toISOString()
      await this.save()
      logger.info('低质量示例清理成功', 'main', {
        count: deletedCount,
        minQualityScore
      })
    }

    return deletedCount
  }

  // 根据时间清理示例
  async cleanupByAge(days: number): Promise<number> {
    await this.ensureInitialized()

    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - days)

    const beforeCount = this.data.examples.length
    this.data.examples = this.data.examples.filter((ex) => {
      if (ex.source === 'static') return true
      const createdDate = new Date(ex.createdAt)
      return createdDate > cutoffDate
    })
    const deletedCount = beforeCount - this.data.examples.length

    if (deletedCount > 0) {
      this.data.lastUpdated = new Date().toISOString()
      await this.save()
      logger.info('过期示例清理成功', 'main', { count: deletedCount, days })
    }

    return deletedCount
  }

  // 获取统计信息
  async getStats(): Promise<{
    total: number
    static: number
    dynamic: number
    avgQualityScore: number
    lastUpdated: string
  }> {
    await this.ensureInitialized()

    const dynamic = this.data.examples.filter((ex) => ex.source === 'dynamic')
    const avgQualityScore =
      dynamic.length > 0
        ? dynamic.reduce((sum, ex) => sum + ex.qualityScore, 0) / dynamic.length
        : 0

    return {
      total: this.data.examples.length,
      static: this.data.examples.length - dynamic.length,
      dynamic: dynamic.length,
      avgQualityScore,
      lastUpdated: this.data.lastUpdated
    }
  }

  // 保存到文件
  private async save(): Promise<void> {
    try {
      // 确保目录存在
      const dir = this.filePath.substring(0, this.filePath.lastIndexOf('/'))
      if (!existsSync(dir)) {
        await mkdir(dir, { recursive: true })
      }

      await writeFile(this.filePath, JSON.stringify(this.data, null, 2), 'utf-8')
    } catch (error) {
      logger.error('示例仓库保存失败', 'main', { error })
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
    return JSON.stringify(this.data, null, 2)
  }

  // 从 JSON 导入
  async importFromJSON(json: string): Promise<void> {
    try {
      const data = JSON.parse(json) as ExampleRepositoryData

      // 验证数据结构
      if (!Array.isArray(data.examples)) {
        throw new Error('Invalid examples data')
      }

      // 合并数据
      for (const example of data.examples) {
        const existingIndex = this.data.examples.findIndex((ex) => ex.id === example.id)
        if (existingIndex >= 0) {
          this.data.examples[existingIndex] = example
        } else {
          this.data.examples.push(example)
        }
      }

      this.data.lastUpdated = new Date().toISOString()
      await this.save()

      logger.info('示例导入成功', 'main', { count: data.examples.length })
    } catch (error) {
      logger.error('示例导入失败', 'main', { error })
      throw error
    }
  }
}

// 默认示例仓库实例
export const exampleRepository = new ExampleRepository()
