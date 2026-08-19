/**
 * paper 同步子模块对外入口。
 * @public 懒加载单例 + 应用启动初始化。
 */
import { getMainWindow } from '@main/core/window'
import { getSyncService } from '@main/services/sync'
import { paperStorageService, getPaperService } from '@main/services/paper'
import { getPapersDirPath } from '@main/services/paper/paperPaths'
import { PaperSyncService } from './PaperSyncService'
import { PaperSyncTracker } from './paperSyncTracker'

let instance: PaperSyncService | null = null

/** 获取 paper 同步引擎懒加载单例 */
export function getPaperSyncService(): PaperSyncService {
  if (!instance) {
    instance = new PaperSyncService({
      syncService: getSyncService(),
      paperStorage: paperStorageService,
      paperService: getPaperService(),
      tracker: new PaperSyncTracker(),
      broadcast: (state) => {
        getMainWindow()?.webContents.send('sync:paperSyncState', state)
      },
      papersDirProvider: getPapersDirPath
    })
  }
  return instance
}

/**
 * 应用启动时初始化：已连接则启动定时同步并立即跑一轮。
 * 在 initializeKnowledgeSyncService() 之后调用。
 */
export function initializePaperSyncService(): void {
  getPaperSyncService().start()
}
