import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { getConfigDirPath } from '@main/services/config/configPaths'
import { logger } from '@main/services/logger'
import type { KnowledgeBase } from '@shared/types/knowledge'

/**
 * 知识库数据文件路径
 */
function getKnowledgeBaseFilePath(): string {
  return join(getConfigDirPath(), 'knowledge-bases.json')
}

/**
 * 创建空的知识库数据结构
 */
function createEmptyKnowledgeBases(): KnowledgeBase[] {
  return []
}

/**
 * 读取知识库数据
 */
function readKnowledgeBases(): KnowledgeBase[] {
  const filePath = getKnowledgeBaseFilePath()
  if (!existsSync(filePath)) {
    return createEmptyKnowledgeBases()
  }

  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as KnowledgeBase[]
  } catch (error) {
    logger.error('读取知识库数据失败', 'main', { error })
    return createEmptyKnowledgeBases()
  }
}

/**
 * 写入知识库数据
 */
function writeKnowledgeBases(knowledgeBases: KnowledgeBase[]): void {
  const filePath = getKnowledgeBaseFilePath()
  const content = JSON.stringify(knowledgeBases, null, 2)
  writeFileSync(filePath, content, 'utf-8')
}

/**
 * 知识库管理服务
 * 提供知识库的增删改查功能
 */
export class KnowledgeService {
  private knowledgeBases: KnowledgeBase[] = []
  private loaded: boolean = false

  /**
   * 确保数据目录存在
   */
  private ensureDataDir(): void {
    const dataDir = getConfigDirPath()
    if (!existsSync(dataDir)) {
      mkdirSync(dataDir, { recursive: true })
    }
  }

  /**
   * 初始化知识库服务
   */
  initialize(): void {
    try {
      this.ensureDataDir()
      this.knowledgeBases = readKnowledgeBases()
      this.loaded = true
      logger.info('知识库服务初始化成功', 'main', {
        count: this.knowledgeBases.length
      })
    } catch (error) {
      const errorMessage = `知识库服务初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      this.knowledgeBases = []
      this.loaded = true
    }
  }

  /**
   * 获取所有知识库
   */
  getAllKnowledgeBases(): KnowledgeBase[] {
    if (!this.loaded) {
      this.initialize()
    }
    return [...this.knowledgeBases]
  }

  /**
   * 根据ID获取知识库
   */
  getKnowledgeBaseById(id: string): KnowledgeBase | null {
    if (!this.loaded) {
      this.initialize()
    }
    return this.knowledgeBases.find((kb) => kb.id === id) || null
  }

  /**
   * 创建知识库
   */
  createKnowledgeBase(data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>): KnowledgeBase {
    if (!this.loaded) {
      this.initialize()
    }

    const newKB: KnowledgeBase = {
      ...data,
      id: `kb-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    this.knowledgeBases.unshift(newKB)
    this.save()

    logger.info('知识库创建成功', 'main', { id: newKB.id, name: newKB.name })
    return newKB
  }

  /**
   * 更新知识库
   */
  updateKnowledgeBase(id: string, updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>): KnowledgeBase | null {
    if (!this.loaded) {
      this.initialize()
    }

    const index = this.knowledgeBases.findIndex((kb) => kb.id === id)
    if (index === -1) {
      return null
    }

    this.knowledgeBases[index] = {
      ...this.knowledgeBases[index],
      ...updates,
      id: this.knowledgeBases[index].id,
      createdAt: this.knowledgeBases[index].createdAt,
      updatedAt: new Date().toISOString()
    }

    this.save()
    logger.info('知识库更新成功', 'main', { id })
    return this.knowledgeBases[index]
  }

  /**
   * 删除知识库
   */
  deleteKnowledgeBase(id: string): boolean {
    if (!this.loaded) {
      this.initialize()
    }

    const index = this.knowledgeBases.findIndex((kb) => kb.id === id)
    if (index === -1) {
      return false
    }

    this.knowledgeBases.splice(index, 1)
    this.save()

    logger.info('知识库删除成功', 'main', { id })
    return true
  }

  /**
   * 保存知识库数据到文件
   */
  private save(): void {
    try {
      this.ensureDataDir()
      writeKnowledgeBases(this.knowledgeBases)
    } catch (error) {
      const errorMessage = `保存知识库数据失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
      throw new Error(errorMessage)
    }
  }

  /**
   * 检查服务是否已加载
   */
  isLoaded(): boolean {
    return this.loaded
  }
}

// 单例实例
let knowledgeServiceInstance: KnowledgeService | null = null

/**
 * 获取知识库服务单例
 */
export function getKnowledgeService(): KnowledgeService {
  if (!knowledgeServiceInstance) {
    knowledgeServiceInstance = new KnowledgeService()
  }
  return knowledgeServiceInstance
}
