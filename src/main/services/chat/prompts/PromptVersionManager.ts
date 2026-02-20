/**
 * 提示词版本管理系统
 * 负责管理提示词模板的历史版本、回滚和对比功能
 */

import type { ReactPromptSections } from './types'
import type { PromptTemplate } from './PromptTemplateManager'
import { logger } from '../../logger'
import { app } from 'electron'
import * as path from 'path'
import * as fs from 'fs/promises'

/**
 * 提示词版本记录
 */
export interface PromptVersion {
  /** 版本 ID (时间戳) */
  id: string
  /** 语义化版本号 */
  version: string
  /** 变更摘要 */
  summary: string
  /** 变更详情 */
  changes: VersionChange[]
  /** 完整模板内容 */
  template: PromptTemplate
  /** 创建时间 */
  createdAt: string
  /** 创建者 */
  author?: string
  /** 版本标签 */
  tags?: string[]
}

/**
 * 版本变更项
 */
export interface VersionChange {
  /** 变更类型 */
  type: 'added' | 'modified' | 'deleted'
  /** 变更的章节名称 */
  section: keyof ReactPromptSections | 'template'
  /** 变更描述 */
  description: string
  /** 变更前的值 (用于对比) */
  oldValue?: string
  /** 变更后的值 */
  newValue?: string
}

/**
 * 版本对比结果
 */
export interface VersionDiff {
  /** 源版本 */
  fromVersion: string
  /** 目标版本 */
  toVersion: string
  /** 差异项 */
  differences: VersionChange[]
  /** 统计信息 */
  stats: {
    added: number
    modified: number
    deleted: number
  }
}

/**
 * 版本查询选项
 */
export interface VersionQueryOptions {
  /** 起始时间 */
  startDate?: string
  /** 结束时间 */
  endDate?: string
  /** 标签筛选 */
  tags?: string[]
  /** 分页限制 */
  limit?: number
  /** 分页偏移 */
  offset?: number
}

/**
 * 版本管理配置
 */
interface VersionManagerConfig {
  /** 最大保留版本数 */
  maxVersions: number
  /** 版本存储目录 */
  versionsDir: string
  /** 是否自动清理旧版本 */
  autoCleanup: boolean
}

const DEFAULT_CONFIG: VersionManagerConfig = {
  maxVersions: 50,
  versionsDir: 'prompt-versions',
  autoCleanup: true
}

/**
 * 提示词版本管理器
 */
export class PromptVersionManager {
  private config: VersionManagerConfig
  private versions: Map<string, PromptVersion> = new Map()
  private versionsIndex: PromptVersion[] = []
  private initialized = false
  private indexPath: string | null = null

  constructor(config: Partial<VersionManagerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config }
    this.initialize()
  }

  /**
   * 初始化版本管理器
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      const userDataPath = app?.getPath('userData') || process.cwd()
      this.config.versionsDir = path.join(userDataPath, this.config.versionsDir)
      this.indexPath = path.join(this.config.versionsDir, 'versions-index.json')

      // 创建版本目录
      await fs.mkdir(this.config.versionsDir, { recursive: true })

      // 加载版本索引
      await this.loadVersionsIndex()

      this.initialized = true
      logger.info('提示词版本管理器初始化成功', 'main', {
        versionsCount: this.versionsIndex.length
      })
    } catch (error) {
      logger.error('提示词版本管理器初始化失败', 'main', { error })
      this.initialized = true
    }
  }

  /**
   * 创建新版本
   */
  async createVersion(
    template: PromptTemplate,
    summary: string,
    changes: VersionChange[],
    options: {
      author?: string
      tags?: string[]
    } = {}
  ): Promise<PromptVersion> {
    await this.ensureInitialized()

    const versionId = Date.now().toString()
    const version: PromptVersion = {
      id: versionId,
      version: template.version,
      summary,
      changes,
      template: JSON.parse(JSON.stringify(template)),
      createdAt: new Date().toISOString(),
      author: options.author || 'system',
      tags: options.tags || []
    }

    try {
      // 保存版本文件
      const versionPath = path.join(this.config.versionsDir, `${versionId}.json`)
      await fs.writeFile(versionPath, JSON.stringify(version, null, 2), 'utf-8')

      // 更新索引
      this.versions.set(versionId, version)
      this.versionsIndex.unshift(version)

      // 保存索引文件
      await this.saveVersionsIndex()

      // 自动清理旧版本
      if (this.config.autoCleanup) {
        await this.cleanupOldVersions()
      }

      logger.info('创建提示词版本成功', 'main', {
        versionId,
        version: template.version,
        summary
      })

      return version
    } catch (error) {
      logger.error('创建提示词版本失败', 'main', { error })
      throw error
    }
  }

  /**
   * 获取版本列表
   */
  async getVersions(options: VersionQueryOptions = {}): Promise<{
    versions: PromptVersion[]
    total: number
  }> {
    await this.ensureInitialized()

    let filtered = [...this.versionsIndex]

    // 时间筛选
    if (options.startDate) {
      const start = new Date(options.startDate).getTime()
      filtered = filtered.filter(v => new Date(v.createdAt).getTime() >= start)
    }

    if (options.endDate) {
      const end = new Date(options.endDate).getTime()
      filtered = filtered.filter(v => new Date(v.createdAt).getTime() <= end)
    }

    // 标签筛选
    if (options.tags && options.tags.length > 0) {
      filtered = filtered.filter(v =>
        options.tags!.some(tag => v.tags?.includes(tag))
      )
    }

    const total = filtered.length

    // 分页
    const offset = options.offset || 0
    const limit = options.limit || 20
    filtered = filtered.slice(offset, offset + limit)

    return { versions: filtered, total }
  }

  /**
   * 获取单个版本
   */
  async getVersion(versionId: string): Promise<PromptVersion | null> {
    await this.ensureInitialized()

    // 先从内存获取
    if (this.versions.has(versionId)) {
      return this.versions.get(versionId)!
    }

    // 从文件加载
    try {
      const versionPath = path.join(this.config.versionsDir, `${versionId}.json`)
      const content = await fs.readFile(versionPath, 'utf-8')
      const version = JSON.parse(content) as PromptVersion
      this.versions.set(versionId, version)
      return version
    } catch {
      return null
    }
  }

  /**
   * 获取最新版本
   */
  async getLatestVersion(): Promise<PromptVersion | null> {
    await this.ensureInitialized()

    if (this.versionsIndex.length === 0) {
      return null
    }

    return this.versionsIndex[0]
  }

  /**
   * 回滚到指定版本
   */
  async rollbackToVersion(versionId: string): Promise<PromptTemplate | null> {
    await this.ensureInitialized()

    const version = await this.getVersion(versionId)
    if (!version) {
      logger.warn('回滚失败：版本不存在', 'main', { versionId })
      return null
    }

    logger.info('回滚到指定版本', 'main', {
      versionId,
      version: version.version,
      createdAt: version.createdAt
    })

    return version.template
  }

  /**
   * 对比两个版本
   */
  async compareVersions(fromVersionId: string, toVersionId: string): Promise<VersionDiff | null> {
    await this.ensureInitialized()

    const fromVersion = await this.getVersion(fromVersionId)
    const toVersion = await this.getVersion(toVersionId)

    if (!fromVersion || !toVersion) {
      return null
    }

    const differences = this.computeDifferences(
      fromVersion.template,
      toVersion.template
    )

    return {
      fromVersion: fromVersion.version,
      toVersion: toVersion.version,
      differences,
      stats: {
        added: differences.filter(d => d.type === 'added').length,
        modified: differences.filter(d => d.type === 'modified').length,
        deleted: differences.filter(d => d.type === 'deleted').length
      }
    }
  }

  /**
   * 添加版本标签
   */
  async addTag(versionId: string, tag: string): Promise<boolean> {
    await this.ensureInitialized()

    const version = await this.getVersion(versionId)
    if (!version) return false

    if (!version.tags) {
      version.tags = []
    }

    if (!version.tags.includes(tag)) {
      version.tags.push(tag)
      await this.updateVersionFile(version)
    }

    return true
  }

  /**
   * 移除版本标签
   */
  async removeTag(versionId: string, tag: string): Promise<boolean> {
    await this.ensureInitialized()

    const version = await this.getVersion(versionId)
    if (!version || !version.tags) return false

    version.tags = version.tags.filter(t => t !== tag)
    await this.updateVersionFile(version)

    return true
  }

  /**
   * 删除版本
   */
  async deleteVersion(versionId: string): Promise<boolean> {
    await this.ensureInitialized()

    try {
      // 删除文件
      const versionPath = path.join(this.config.versionsDir, `${versionId}.json`)
      await fs.unlink(versionPath)

      // 更新内存和索引
      this.versions.delete(versionId)
      this.versionsIndex = this.versionsIndex.filter(v => v.id !== versionId)
      await this.saveVersionsIndex()

      logger.info('删除版本成功', 'main', { versionId })
      return true
    } catch (error) {
      logger.error('删除版本失败', 'main', { error })
      return false
    }
  }

  /**
   * 获取版本统计信息
   */
  async getStats(): Promise<{
    totalVersions: number
    oldestVersion: string | null
    latestVersion: string | null
    tags: Record<string, number>
  }> {
    await this.ensureInitialized()

    const tags: Record<string, number> = {}
    for (const version of this.versionsIndex) {
      for (const tag of version.tags || []) {
        tags[tag] = (tags[tag] || 0) + 1
      }
    }

    return {
      totalVersions: this.versionsIndex.length,
      oldestVersion: this.versionsIndex[this.versionsIndex.length - 1]?.createdAt || null,
      latestVersion: this.versionsIndex[0]?.createdAt || null,
      tags
    }
  }

  /**
   * 导出版本数据
   */
  async exportVersions(versionIds?: string[]): Promise<string> {
    await this.ensureInitialized()

    let versions: PromptVersion[]

    if (versionIds && versionIds.length > 0) {
      versions = []
      for (const id of versionIds) {
        const version = await this.getVersion(id)
        if (version) versions.push(version)
      }
    } else {
      versions = [...this.versionsIndex]
    }

    return JSON.stringify({
      exportDate: new Date().toISOString(),
      versions
    }, null, 2)
  }

  /**
   * 导入版本数据
   */
  async importVersions(jsonData: string): Promise<{
    imported: number
    skipped: number
    errors: string[]
  }> {
    await this.ensureInitialized()

    const result = { imported: 0, skipped: 0, errors: [] as string[] }

    try {
      const data = JSON.parse(jsonData)
      const versions = data.versions as PromptVersion[]

      for (const version of versions) {
        try {
          // 检查是否已存在相同版本
          const exists = this.versionsIndex.some(
            v => v.version === version.version && v.createdAt === version.createdAt
          )

          if (exists) {
            result.skipped++
            continue
          }

          // 重新生成 ID 避免冲突
          const newId = Date.now().toString() + Math.random().toString(36).substr(2, 9)
          version.id = newId

          // 保存版本
          const versionPath = path.join(this.config.versionsDir, `${newId}.json`)
          await fs.writeFile(versionPath, JSON.stringify(version, null, 2), 'utf-8')

          this.versions.set(newId, version)
          this.versionsIndex.push(version)
          result.imported++
        } catch (error) {
          result.errors.push(`导入版本 ${version.version} 失败: ${error}`)
        }
      }

      // 重新排序并保存索引
      this.versionsIndex.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )
      await this.saveVersionsIndex()

      logger.info('导入版本完成', 'main', result)
    } catch (error) {
      result.errors.push(`解析导入数据失败: ${error}`)
    }

    return result
  }

  /**
   * 计算模板差异
   */
  private computeDifferences(
    from: PromptTemplate,
    to: PromptTemplate
  ): VersionChange[] {
    const differences: VersionChange[] = []

    // 对比版本号
    if (from.version !== to.version) {
      differences.push({
        type: 'modified',
        section: 'template',
        description: `版本号变更: ${from.version} -> ${to.version}`,
        oldValue: from.version,
        newValue: to.version
      })
    }

    // 对比各章节
    const sections = Object.keys(from.sections) as Array<keyof ReactPromptSections>
    for (const section of sections) {
      const oldValue = from.sections[section]
      const newValue = to.sections[section]

      if (!newValue && oldValue) {
        differences.push({
          type: 'deleted',
          section,
          description: `删除章节: ${section}`,
          oldValue
        })
      } else if (newValue && !oldValue) {
        differences.push({
          type: 'added',
          section,
          description: `新增章节: ${section}`,
          newValue
        })
      } else if (oldValue !== newValue) {
        differences.push({
          type: 'modified',
          section,
          description: `修改章节: ${section}`,
          oldValue,
          newValue
        })
      }
    }

    // 检查新增章节
    const toSections = Object.keys(to.sections) as Array<keyof ReactPromptSections>
    for (const section of toSections) {
      if (!(section in from.sections)) {
        differences.push({
          type: 'added',
          section,
          description: `新增章节: ${section}`,
          newValue: to.sections[section]
        })
      }
    }

    return differences
  }

  /**
   * 加载版本索引
   */
  private async loadVersionsIndex(): Promise<void> {
    if (!this.indexPath) return

    try {
      const content = await fs.readFile(this.indexPath, 'utf-8')
      const index = JSON.parse(content) as PromptVersion[]
      this.versionsIndex = index

      // 加载到内存 Map
      for (const version of index) {
        this.versions.set(version.id, version)
      }
    } catch {
      // 索引文件不存在，从目录加载
      await this.rebuildIndexFromDirectory()
    }
  }

  /**
   * 保存版本索引
   */
  private async saveVersionsIndex(): Promise<void> {
    if (!this.indexPath) return

    try {
      // 只保存关键信息到索引，减少文件大小
      const indexData = this.versionsIndex.map(v => ({
        id: v.id,
        version: v.version,
        summary: v.summary,
        createdAt: v.createdAt,
        author: v.author,
        tags: v.tags
      }))

      await fs.writeFile(this.indexPath, JSON.stringify(indexData, null, 2), 'utf-8')
    } catch (error) {
      logger.error('保存版本索引失败', 'main', { error })
    }
  }

  /**
   * 从目录重建索引
   */
  private async rebuildIndexFromDirectory(): Promise<void> {
    try {
      const files = await fs.readdir(this.config.versionsDir)
      const versions: PromptVersion[] = []

      for (const file of files) {
        if (file.endsWith('.json') && file !== 'versions-index.json') {
          try {
            const content = await fs.readFile(
              path.join(this.config.versionsDir, file),
              'utf-8'
            )
            const version = JSON.parse(content) as PromptVersion
            versions.push(version)
            this.versions.set(version.id, version)
          } catch {
            // 忽略无效文件
          }
        }
      }

      // 按时间排序
      versions.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      )

      this.versionsIndex = versions
      await this.saveVersionsIndex()
    } catch (error) {
      logger.error('重建版本索引失败', 'main', { error })
    }
  }

  /**
   * 更新版本文件
   */
  private async updateVersionFile(version: PromptVersion): Promise<void> {
    const versionPath = path.join(this.config.versionsDir, `${version.id}.json`)
    await fs.writeFile(versionPath, JSON.stringify(version, null, 2), 'utf-8')

    // 更新内存中的版本
    this.versions.set(version.id, version)

    // 更新索引中的版本
    const indexItem = this.versionsIndex.find(v => v.id === version.id)
    if (indexItem) {
      Object.assign(indexItem, version)
      await this.saveVersionsIndex()
    }
  }

  /**
   * 清理旧版本
   */
  private async cleanupOldVersions(): Promise<void> {
    if (this.versionsIndex.length <= this.config.maxVersions) return

    const toDelete = this.versionsIndex.slice(this.config.maxVersions)

    for (const version of toDelete) {
      // 保留有标签的版本
      if (version.tags && version.tags.length > 0) continue

      try {
        const versionPath = path.join(this.config.versionsDir, `${version.id}.json`)
        await fs.unlink(versionPath)
        this.versions.delete(version.id)
      } catch {
        // 忽略删除错误
      }
    }

    // 更新索引
    this.versionsIndex = this.versionsIndex.filter(
      v => this.versions.has(v.id)
    )
    await this.saveVersionsIndex()
  }

  /**
   * 确保已初始化
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.initialize()
    }
  }
}

// 单例实例
export const promptVersionManager = new PromptVersionManager()
