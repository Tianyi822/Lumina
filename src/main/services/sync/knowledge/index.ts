/**
 * knowledge 同步子模块对外入口。
 * @public 懒加载单例 + 应用启动初始化。
 */
import { getMainWindow } from '@main/core/window'
import { getSyncService } from '@main/services/sync'
import { getKnowledgeServiceManager } from '@main/services/knowledge'
import { getFileService } from '@main/services/file/FileService'
import { getVectorDBService } from '@main/services/vector/VectorDBService'
import { getKnowledgeDirPath } from '@main/services/config/configPaths'
import { logger } from '@main/services/logger'
import { KnowledgeSyncService } from './KnowledgeSyncService'
import { KnowledgeSyncTracker } from './knowledgeSyncTracker'

let instance: KnowledgeSyncService | null = null

/** 获取 knowledge 同步引擎懒加载单例 */
export function getKnowledgeSyncService(): KnowledgeSyncService {
  if (!instance) {
    const knowledgeManager = getKnowledgeServiceManager()
    const vectorDB = getVectorDBService()
    instance = new KnowledgeSyncService({
      syncService: getSyncService(),
      knowledgeStorage: {
        readKnowledgeBasesForSync: () => knowledgeManager.readKnowledgeBasesForSync(),
        applySyncedKnowledgeBases: (merged) => knowledgeManager.applySyncedKnowledgeBases(merged)
      },
      fileStorage: getFileService(),
      // KnowledgeServiceManager 无直接 reindex 方法：reindex 在 per-KB 的 KnowledgeService 实例上。
      // 此处按旁观者原则封装"全量重建索引"：读取 KB → 取实例 → 走并发队列全量索引 linkedFileIds。
      knowledgeManager: {
        reindexKnowledgeBase: async (kbId) => {
          try {
            const kb = await knowledgeManager.getKnowledgeBaseById(kbId)
            if (!kb) {
              logger.warn('知识库重建索引跳过：知识库不存在', 'main', { kbId })
              return
            }
            const service = knowledgeManager.getOrCreateInstance(kbId, kb)
            const fileIds = kb.linkedFileIds || []
            await knowledgeManager.executeIndexingTask(kbId, () =>
              service.reindexKnowledgeBase(kbId, fileIds)
            )
          } catch (error) {
            logger.error('知识库重建索引失败', 'main', {
              kbId,
              error: error instanceof Error ? error.message : String(error)
            })
          }
        },
        vectorDBExists: (kbId) => vectorDB.exists(kbId)
      },
      tracker: new KnowledgeSyncTracker(),
      broadcast: (state) => {
        getMainWindow()?.webContents.send('sync:knowledgeSyncState', state)
      },
      knowledgeDirProvider: getKnowledgeDirPath
    })
  }
  return instance
}

/**
 * 应用启动时初始化：已连接则启动定时同步并立即跑一轮。
 * 在 initializeWriterSyncService() 之后调用。
 */
export function initializeKnowledgeSyncService(): void {
  getKnowledgeSyncService().start()
}
