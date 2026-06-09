import { getVectorDBService } from '@main/services/vector'
import { getFileService } from '@main/services/file/FileService'
import { logger } from '@main/services/logger'
import type { KnowledgeBase, KnowledgeIndexInvalidatedFile } from '@shared/types/knowledge'
import type { FileProcessingProgress } from './KnowledgeService'
import { KnowledgeService } from './KnowledgeService'
import { readKnowledgeBases, writeKnowledgeBases } from './KnowledgeService'
import { initializeKnowledgeStorage } from './knowledgePaths'

/**
 * 知识库索引状态接口
 */
export interface KnowledgeBaseIndexingStatus {
  isIndexing: boolean
  indexingFiles: string[]
  fileProgress: Map<string, FileProcessingProgress>
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

// 知识库服务管理器
// 负责管理所有知识库的创建、更新、删除和查询
// 同时控制索引操作的并发执行，确保同一时间只有一个知识库可以执行索引操作
export class KnowledgeServiceManager {
  private instances: Map<string, KnowledgeService> = new Map()
  private loaded: boolean = false

  // ==================== 并发控制 ====================
  private indexingQueue: IndexingTask[] = []
  private isProcessingIndexing: boolean = false
  private activeIndexingKbId: string | null = null

  /**
   * 初始化知识库服务管理器
   * 创建必要的存储目录
   */
  initialize(): void {
    try {
      initializeKnowledgeStorage()
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
  async getAllKnowledgeBases(): Promise<KnowledgeBase[]> {
    if (!this.loaded) {
      this.initialize()
    }
    return await readKnowledgeBases()
  }

  /**
   * 根据 ID 获取知识库
   * @param id 知识库 ID
   */
  async getKnowledgeBaseById(id: string): Promise<KnowledgeBase | null> {
    if (!this.loaded) {
      this.initialize()
    }
    const knowledgeBases = await readKnowledgeBases()
    return knowledgeBases.find((kb) => kb.id === id) || null
  }

  /**
   * 创建知识库
   * @param data 知识库数据（不含 id/createdAt/updatedAt）
   */
  async createKnowledgeBase(
    data: Omit<KnowledgeBase, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<KnowledgeBase> {
    if (!this.loaded) {
      this.initialize()
    }

    const newKB: KnowledgeBase = {
      ...data,
      id: `kb-${Date.now()}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    }

    const knowledgeBases = await readKnowledgeBases()
    knowledgeBases.unshift(newKB)
    await writeKnowledgeBases(knowledgeBases)

    logger.info('知识库创建成功', 'main', { id: newKB.id, name: newKB.name })
    return newKB
  }

  /**
   * 更新知识库
   * @param id 知识库 ID
   * @param updates 更新字段
   */
  async updateKnowledgeBase(
    id: string,
    updates: Partial<Omit<KnowledgeBase, 'id' | 'createdAt'>>
  ): Promise<KnowledgeBase | null> {
    if (!this.loaded) {
      this.initialize()
    }

    const knowledgeBases = await readKnowledgeBases()
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
    await writeKnowledgeBases(knowledgeBases)

    logger.info('知识库更新成功', 'main', { id })

    // 更新现有实例的配置
    const instance = this.instances.get(id)
    if (instance) {
      instance.updateKBData(updatedKB)
    }

    return updatedKB
  }

  /**
   * 标记知识库需要重新索引
   * 当关联文件发生变化时，将知识库标记为需要重新索引
   * @param kbIds 需要重新索引的知识库 ID 列表
   * @param invalidatedFile 失效的文件信息
   * @returns 受影响的知识库列表
   */
  async markKnowledgeBasesNeedReindex(
    kbIds: string[],
    invalidatedFile: KnowledgeIndexInvalidatedFile
  ): Promise<Array<{ id: string; name: string }>> {
    if (!this.loaded) {
      this.initialize()
    }

    const uniqueKbIds = Array.from(new Set(kbIds))
    if (uniqueKbIds.length === 0) {
      return []
    }

    const knowledgeBases = await readKnowledgeBases()
    const now = new Date().toISOString()
    const affectedKnowledgeBases: Array<{ id: string; name: string }> = []
    let changed = false

    for (const kbId of uniqueKbIds) {
      const kbIndex = knowledgeBases.findIndex((kb) => kb.id === kbId)
      if (kbIndex === -1) {
        continue
      }

      const kb = knowledgeBases[kbIndex]
      const existingInvalidation = kb.indexInvalidation
      const existingFiles = existingInvalidation?.files || []
      const fileIndex = existingFiles.findIndex((file) => file.fileId === invalidatedFile.fileId)
      const nextFiles =
        fileIndex >= 0
          ? existingFiles.map((file, index) => (index === fileIndex ? invalidatedFile : file))
          : [...existingFiles, invalidatedFile]

      knowledgeBases[kbIndex] = {
        ...kb,
        updatedAt: now,
        indexInvalidation: {
          needsReindex: true,
          reason: 'paper_note_updated',
          markedAt: now,
          files: nextFiles
        }
      }

      affectedKnowledgeBases.push({ id: kb.id, name: kb.name })
      changed = true
    }

    if (changed) {
      await writeKnowledgeBases(knowledgeBases)
      for (const kb of knowledgeBases) {
        const instance = this.instances.get(kb.id)
        if (instance) {
          instance.updateKBData(kb)
        }
      }
      logger.info('知识库已标记为需要重新索引', 'main', {
        kbIds: affectedKnowledgeBases.map((kb) => kb.id),
        fileId: invalidatedFile.fileId
      })
    }

    return affectedKnowledgeBases
  }

  /**
   * 清除知识库的索引失效标记
   * @param kbId 知识库 ID
   */
  async clearKnowledgeBaseInvalidation(kbId: string): Promise<KnowledgeBase | null> {
    if (!this.loaded) {
      this.initialize()
    }

    const knowledgeBases = await readKnowledgeBases()
    const kbIndex = knowledgeBases.findIndex((kb) => kb.id === kbId)
    if (kbIndex === -1) {
      return null
    }

    if (!knowledgeBases[kbIndex].indexInvalidation) {
      return knowledgeBases[kbIndex]
    }

    const updatedKB: KnowledgeBase = {
      ...knowledgeBases[kbIndex],
      updatedAt: new Date().toISOString(),
      indexInvalidation: undefined
    }
    knowledgeBases[kbIndex] = updatedKB
    await writeKnowledgeBases(knowledgeBases)

    const instance = this.instances.get(kbId)
    if (instance) {
      instance.updateKBData(updatedKB)
    }

    logger.info('知识库索引失效状态已清除', 'main', { kbId })
    return updatedKB
  }

  /**
   * 清除知识库中特定文件的索引失效标记
   * @param kbId 知识库 ID
   * @param fileId 文件 ID
   */
  async clearKnowledgeBaseFileInvalidation(
    kbId: string,
    fileId: string
  ): Promise<KnowledgeBase | null> {
    if (!this.loaded) {
      this.initialize()
    }

    const knowledgeBases = await readKnowledgeBases()
    const kbIndex = knowledgeBases.findIndex((kb) => kb.id === kbId)
    if (kbIndex === -1) {
      return null
    }

    const invalidation = knowledgeBases[kbIndex].indexInvalidation
    if (!invalidation) {
      return knowledgeBases[kbIndex]
    }

    const nextFiles = invalidation.files.filter((file) => file.fileId !== fileId)
    const updatedKB: KnowledgeBase = {
      ...knowledgeBases[kbIndex],
      updatedAt: new Date().toISOString(),
      indexInvalidation:
        nextFiles.length > 0
          ? {
              ...invalidation,
              files: nextFiles
            }
          : undefined
    }

    knowledgeBases[kbIndex] = updatedKB
    await writeKnowledgeBases(knowledgeBases)

    const instance = this.instances.get(kbId)
    if (instance) {
      instance.updateKBData(updatedKB)
    }

    logger.info('知识库文件索引失效状态已清除', 'main', { kbId, fileId })
    return updatedKB
  }

  // 删除知识库
  // 如果知识库正在索引，会先停止索引操作
  // 同时删除向量数据库、解除文件关联、从配置中移除、清理服务实例
  async deleteKnowledgeBase(id: string): Promise<{ success: boolean; error?: string }> {
    if (!this.loaded) {
      this.initialize()
    }

    const knowledgeBases = await readKnowledgeBases()
    const index = knowledgeBases.findIndex((kb) => kb.id === id)
    if (index === -1) {
      return { success: false, error: '知识库不存在' }
    }

    const kb = knowledgeBases[index]

    logger.info('开始删除知识库', 'main', { id, name: kb.name })

    try {
      // 1. 检查是否有正在进行的索引操作
      const isIndexing = this.hasActiveOperation(id)
      const isInQueue = this.hasPendingIndexingTask(id)

      if (isIndexing || isInQueue) {
        logger.info('知识库正在索引中，准备停止索引操作', 'main', {
          id,
          isIndexing,
          isInQueue
        })

        // 2. 取消队列中的任务
        if (isInQueue) {
          this.cancelPendingIndexingTasks(id)
          logger.info('已取消知识库的待处理索引任务', 'main', { id })
        }

        // 3. 停止当前正在进行的索引操作
        if (isIndexing) {
          const instance = this.instances.get(id)
          if (instance) {
            instance.stopIndexing()
            logger.info('已请求停止知识库的索引操作', 'main', { id })
          }
        }

        // 4. 等待一段时间让索引操作有时间响应停止请求
        // 注意：这里不等待索引完成，只是给出一个信号
        // 实际的清理会在 cleanup 中处理
      }

      // 5. 删除向量数据库
      try {
        getVectorDBService().deleteKnowledgeBase(id)
        logger.info('已删除知识库的向量数据库', 'main', { id })
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error)
        logger.error('删除向量数据库失败', 'main', { id, error: errorMessage })
        // 继续删除其他数据，不中断流程
      }

      // 6. 从所有关联的文件中移除此知识库 ID
      if (kb.linkedFileIds && kb.linkedFileIds.length > 0) {
        const fileService = getFileService()
        for (const fileId of kb.linkedFileIds) {
          try {
            await fileService.unlinkFileFromKB(fileId, id)
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error)
            logger.warn('从文件解除知识库关联失败', 'main', {
              fileId,
              kbId: id,
              error: errorMessage
            })
          }
        }
        logger.info('已解除知识库与文件的关联', 'main', { id, fileCount: kb.linkedFileIds.length })
      }

      // 7. 从配置中移除知识库
      knowledgeBases.splice(index, 1)
      await writeKnowledgeBases(knowledgeBases)
      logger.info('已从配置中移除知识库', 'main', { id })

      // 8. 移除服务实例（这会调用 cleanup 清理资源）
      this.removeInstance(id)

      logger.info('知识库删除成功', 'main', { id, name: kb.name })
      return { success: true }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error)
      logger.error('删除知识库失败', 'main', { id, error: errorMessage })
      return { success: false, error: errorMessage }
    }
  }

  // 停止知识库的索引操作
  // 取消队列中的任务并请求停止当前索引
  stopKnowledgeBaseIndexing(kbId: string): boolean {
    const instance = this.instances.get(kbId)
    if (!instance) {
      logger.warn('无法停止索引：知识库服务实例不存在', 'main', { kbId })
      return false
    }

    // 取消队列中的任务
    this.cancelPendingIndexingTasks(kbId)

    // 请求停止当前索引
    instance.stopIndexing()

    logger.info('已请求停止知识库索引', 'main', { kbId })
    return true
  }

  // 取消指定知识库的所有待处理索引任务
  private cancelPendingIndexingTasks(kbId: string): number {
    const initialLength = this.indexingQueue.length

    // 过滤掉指定知识库的任务
    this.indexingQueue = this.indexingQueue.filter((task) => task.kbId !== kbId)

    const cancelledCount = initialLength - this.indexingQueue.length

    if (cancelledCount > 0) {
      logger.info('已取消知识库的待处理索引任务', 'main', {
        kbId,
        cancelledCount
      })
    }

    return cancelledCount
  }

  /**
   * 获取或创建知识库服务实例
   * 如果实例已存在则更新配置并返回，否则创建新实例
   * @param kbId 知识库 ID
   * @param kbData 知识库数据
   */
  getOrCreateInstance(kbId: string, kbData: KnowledgeBase): KnowledgeService {
    if (this.instances.has(kbId)) {
      const existing = this.instances.get(kbId)!
      existing.updateKBData(kbData)
      logger.debug('使用现有知识库服务实例', 'main', { kbId })
      return existing
    }

    logger.info('创建新的知识库服务实例', 'main', { kbId, name: kbData.name })
    const instance = new KnowledgeService(kbData)
    this.instances.set(kbId, instance)
    return instance
  }

  /**
   * 获取知识库服务实例
   * @param kbId 知识库 ID
   */
  getInstance(kbId: string): KnowledgeService | undefined {
    return this.instances.get(kbId)
  }

  /**
   * 移除知识库服务实例
   * 清理实例资源并从内存中移除
   * @param kbId 知识库 ID
   */
  removeInstance(kbId: string): void {
    const instance = this.instances.get(kbId)
    if (instance) {
      instance.cleanup()
      this.instances.delete(kbId)
      logger.info('知识库服务实例已移除', 'main', { kbId })
    }
  }

  /**
   * 清理所有知识库服务实例
   */
  clearAll(): void {
    for (const [kbId, instance] of this.instances) {
      instance.cleanup()
      logger.debug('清理知识库服务实例', 'main', { kbId })
    }
    this.instances.clear()
    logger.info('所有知识库服务实例已清理', 'main')
  }

  /**
   * 获取指定知识库的活跃状态
   * @param kbId 知识库 ID
   */
  getActiveStatus(kbId: string): KnowledgeBaseIndexingStatus | null {
    const instance = this.instances.get(kbId)
    if (!instance) {
      return null
    }

    const indexingFiles = instance.getIndexingFiles().map((f) => f.fileId)
    // 获取每个文件的进度信息
    const fileProgress = new Map<string, FileProcessingProgress>()
    for (const fileId of indexingFiles) {
      const progress = instance.getFileProgress(`${kbId}:${fileId}`)
      if (progress) {
        fileProgress.set(fileId, progress)
      }
    }

    return {
      isIndexing: instance.isIndexing(),
      indexingFiles,
      fileProgress
    }
  }

  /**
   * 获取所有知识库的活跃状态
   */
  getAllActiveStatus(): Map<string, KnowledgeBaseIndexingStatus> {
    const statusMap = new Map<string, KnowledgeBaseIndexingStatus>()

    for (const [kbId, instance] of this.instances) {
      const indexingFiles = instance.getIndexingFiles().map((f) => f.fileId)
      // 获取每个文件的进度信息
      const fileProgress = new Map<string, FileProcessingProgress>()
      for (const fileId of indexingFiles) {
        const progress = instance.getFileProgress(`${kbId}:${fileId}`)
        if (progress) {
          fileProgress.set(fileId, progress)
        }
      }
      statusMap.set(kbId, {
        isIndexing: instance.isIndexing(),
        indexingFiles,
        fileProgress
      })
    }

    return statusMap
  }

  /**
   * 检查指定知识库是否有活跃操作
   * @param kbId 知识库 ID
   */
  hasActiveOperation(kbId: string): boolean {
    const instance = this.instances.get(kbId)
    return instance ? instance.isIndexing() : false
  }

  /**
   * 获取服务实例数量
   */
  getInstanceCount(): number {
    return this.instances.size
  }

  /**
   * 获取所有服务实例 ID
   */
  getInstanceIds(): string[] {
    return Array.from(this.instances.keys())
  }

  // ==================== 并发控制 ====================

  /**
   * 执行索引任务（带并发控制）
   * 同一时间只有一个知识库可以执行索引操作
   * 其他知识库的索引任务会进入队列等待
   * @param kbId 知识库 ID
   * @param task 索引任务函数
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

  // 处理索引任务队列
  // 按顺序执行队列中的任务，确保同一时间只有一个任务在执行
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
   * 获取当前正在索引的知识库 ID
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
   * @param kbId 知识库 ID
   */
  hasPendingIndexingTask(kbId: string): boolean {
    return this.indexingQueue.some((task) => task.kbId === kbId)
  }
}

// 知识库服务管理器单例实例
let knowledgeServiceManagerInstance: KnowledgeServiceManager | null = null

// 获取知识库服务管理器单例
export function getKnowledgeServiceManager(): KnowledgeServiceManager {
  if (!knowledgeServiceManagerInstance) {
    knowledgeServiceManagerInstance = new KnowledgeServiceManager()
    logger.info('知识库服务管理器已初始化', 'main')
  }
  return knowledgeServiceManagerInstance
}
