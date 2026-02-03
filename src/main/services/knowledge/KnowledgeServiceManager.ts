import { mkdirSync, existsSync } from 'fs'

import { getConfigDirPath } from '@main/services/config/configPaths'
import { getVectorDBService } from '@main/services/vector'
import { getFileService } from '@main/services/file/FileService'
import { logger } from '@main/services/logger'
import type { KnowledgeBase } from '@shared/types/knowledge'
import { KnowledgeService } from './KnowledgeService'
import { readKnowledgeBases, writeKnowledgeBases } from './KnowledgeService'

export interface KnowledgeBaseIndexingStatus {
  isIndexing: boolean
  indexingFiles: string[]
}

/**
 * 索引任务队列项
 */
interface IndexingTask {
  kbId: string
  task: () => Promise<unknown>
  resolve: (value: unknown) => void
  reject: (reason: Error) => void
}

export class KnowledgeServiceManager {
  private instances: Map<string, KnowledgeService> = new Map()
  private loaded: boolean = false

  // ==================== 并发控制 ====================
  private indexingQueue: IndexingTask[] = []
  private isProcessingIndexing: boolean = false
  private activeIndexingKbId: string | null = null

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
   * 初始化
   */
  initialize(): void {
    try {
      this.ensureDataDir()
      this.loaded = true
      logger.info('知识库服务管理器初始化成功', 'main')
    } catch (error) {
      const errorMessage = `知识库服务管理器初始化失败: ${error instanceof Error ? error.message : String(error)}`
      logger.error(errorMessage)
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
    return readKnowledgeBases()
  }

  /**
   * 根据ID获取知识库
   */
  getKnowledgeBaseById(id: string): KnowledgeBase | null {
    if (!this.loaded) {
      this.initialize()
    }
    const knowledgeBases = readKnowledgeBases()
    return knowledgeBases.find((kb) => kb.id === id) || null
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

    const knowledgeBases = readKnowledgeBases()
    knowledgeBases.unshift(newKB)
    writeKnowledgeBases(knowledgeBases)

    logger.info('知识库创建成功', 'main', { id: newKB.id, name: newKB.name })
    return newKB
  }

  /**
   * 更新知识库
   */
  updateKnowledgeBase(
    id: string,
    updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>
  ): KnowledgeBase | null {
    if (!this.loaded) {
      this.initialize()
    }

    const knowledgeBases = readKnowledgeBases()
    const index = knowledgeBases.findIndex((kb) => kb.id === id)
    if (index === -1) {
      return null
    }

    const updatedKB: KnowledgeBase = {
      ...knowledgeBases[index],
      ...updates,
      id: knowledgeBases[index].id,
      createdAt: knowledgeBases[index].createdAt,
      updatedAt: new Date().toISOString()
    }

    knowledgeBases[index] = updatedKB
    writeKnowledgeBases(knowledgeBases)

    logger.info('知识库更新成功', 'main', { id })

    // 更新现有实例的配置
    const instance = this.instances.get(id)
    if (instance) {
      instance.updateKBData(updatedKB)
    }

    return updatedKB
  }

  /**
   * 删除知识库
   */
  deleteKnowledgeBase(id: string): boolean {
    if (!this.loaded) {
      this.initialize()
    }

    const knowledgeBases = readKnowledgeBases()
    const index = knowledgeBases.findIndex((kb) => kb.id === id)
    if (index === -1) {
      return false
    }

    const kb = knowledgeBases[index]

    // 删除向量数据库
    getVectorDBService().deleteKnowledgeBase(id)

    // 从所有关联的文件中移除此知识库 ID
    if (kb.linkedFileIds && kb.linkedFileIds.length > 0) {
      const fileService = getFileService()
      for (const fileId of kb.linkedFileIds) {
        fileService.unlinkFileFromKB(fileId, id)
      }
    }

    knowledgeBases.splice(index, 1)
    writeKnowledgeBases(knowledgeBases)

    // 移除服务实例
    this.removeInstance(id)

    logger.info('知识库删除成功', 'main', { id })
    return true
  }

  getOrCreateInstance(kbId: string, kbData: KnowledgeBase): KnowledgeService {
    if (this.instances.has(kbId)) {
      const existing = this.instances.get(kbId)!
      logger.debug('使用现有知识库服务实例', 'main', { kbId })
      return existing
    }

    logger.info('创建新的知识库服务实例', 'main', { kbId, name: kbData.name })
    const instance = new KnowledgeService(kbData)
    this.instances.set(kbId, instance)
    return instance
  }

  getInstance(kbId: string): KnowledgeService | undefined {
    return this.instances.get(kbId)
  }

  removeInstance(kbId: string): void {
    const instance = this.instances.get(kbId)
    if (instance) {
      instance.cleanup()
      this.instances.delete(kbId)
      logger.info('知识库服务实例已移除', 'main', { kbId })
    }
  }

  clearAll(): void {
    for (const [kbId, instance] of this.instances) {
      instance.cleanup()
      logger.debug('清理知识库服务实例', 'main', { kbId })
    }
    this.instances.clear()
    logger.info('所有知识库服务实例已清理', 'main')
  }

  getActiveStatus(kbId: string): KnowledgeBaseIndexingStatus | null {
    const instance = this.instances.get(kbId)
    if (!instance) {
      return null
    }

    const indexingFiles = instance.getIndexingFiles().map((f) => f.fileId)

    return {
      isIndexing: instance.isIndexing(),
      indexingFiles
    }
  }

  getAllActiveStatus(): Map<string, KnowledgeBaseIndexingStatus> {
    const statusMap = new Map<string, KnowledgeBaseIndexingStatus>()

    for (const [kbId, instance] of this.instances) {
      const indexingFiles = instance.getIndexingFiles().map((f) => f.fileId)
      statusMap.set(kbId, {
        isIndexing: instance.isIndexing(),
        indexingFiles
      })
    }

    return statusMap
  }

  hasActiveOperation(kbId: string): boolean {
    const instance = this.instances.get(kbId)
    return instance ? instance.isIndexing() : false
  }

  getInstanceCount(): number {
    return this.instances.size
  }

  getInstanceIds(): string[] {
    return Array.from(this.instances.keys())
  }

  // ==================== 并发控制 ====================

  /**
   * 执行索引任务（带并发控制）
   * 同一时间只有一个知识库可以执行索引操作
   */
  async executeIndexingTask<T>(kbId: string, task: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      this.indexingQueue.push({
        kbId,
        task,
        resolve: resolve as (value: unknown) => void,
        reject
      })
      logger.debug('索引任务已加入队列', 'main', {
        kbId,
        queueLength: this.indexingQueue.length,
        isProcessing: this.isProcessingIndexing,
        activeKbId: this.activeIndexingKbId
      })
      void this.processIndexingQueue()
    })
  }

  /**
   * 处理索引任务队列
   */
  private async processIndexingQueue(): Promise<void> {
    if (this.isProcessingIndexing) {
      return
    }

    const nextTask = this.indexingQueue.shift()
    if (!nextTask) {
      return
    }

    this.isProcessingIndexing = true
    this.activeIndexingKbId = nextTask.kbId

    logger.info('开始执行索引任务', 'main', {
      kbId: nextTask.kbId,
      remainingTasks: this.indexingQueue.length
    })

    try {
      const result = await nextTask.task()
      nextTask.resolve(result)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('索引任务执行失败', 'main', { kbId: nextTask.kbId, error: errorMessage })
      nextTask.reject(error instanceof Error ? error : new Error(errorMessage))
    } finally {
      this.isProcessingIndexing = false
      this.activeIndexingKbId = null
      logger.info('索引任务完成', 'main', { kbId: nextTask.kbId })

      // 继续处理队列中的下一个任务
      if (this.indexingQueue.length > 0) {
        void this.processIndexingQueue()
      }
    }
  }

  /**
   * 获取当前正在索引的知识库ID
   */
  getActiveIndexingKbId(): string | null {
    return this.activeIndexingKbId
  }

  /**
   * 获取索引队列长度
   */
  getIndexingQueueLength(): number {
    return this.indexingQueue.length
  }

  /**
   * 检查指定知识库是否有待处理的索引任务
   */
  hasPendingIndexingTask(kbId: string): boolean {
    return this.indexingQueue.some((task) => task.kbId === kbId)
  }
}

let knowledgeServiceManagerInstance: KnowledgeServiceManager | null = null

export function getKnowledgeServiceManager(): KnowledgeServiceManager {
  if (!knowledgeServiceManagerInstance) {
    knowledgeServiceManagerInstance = new KnowledgeServiceManager()
    logger.info('知识库服务管理器已初始化', 'main')
  }
  return knowledgeServiceManagerInstance
}
