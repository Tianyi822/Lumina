/**
 * writing 同步子模块对外入口。
 * @public 懒加载单例 + 应用启动初始化。
 */
import { getMainWindow } from '@main/core/window'
import { getSyncService } from '@main/services/sync'
import { getWritingRootPath, writerAssetService, writerStorageService } from '@main/services/writer'
import { WriterSyncService } from './WriterSyncService'
import { WriterSyncTracker } from './writerSyncTracker'

let instance: WriterSyncService | null = null

/** 获取 writing 同步引擎懒加载单例 */
export function getWriterSyncService(): WriterSyncService {
  if (!instance) {
    instance = new WriterSyncService({
      syncService: getSyncService(),
      // 复用 writerService 的底层存储/资源单例，共享同一写队列
      storage: writerStorageService,
      assetService: writerAssetService,
      tracker: new WriterSyncTracker(),
      broadcast: (state) => {
        getMainWindow()?.webContents.send('sync:writerSyncState', state)
      },
      writingRootProvider: getWritingRootPath
    })
  }
  return instance
}

/**
 * 应用启动时初始化：已连接则启动定时同步并立即跑一轮。
 * 在 initializeConfigSyncService() 之后调用。
 */
export function initializeWriterSyncService(): void {
  getWriterSyncService().start()
}
