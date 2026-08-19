/**
 * 会话快照同步子模块对外入口。
 * @public 懒加载单例 + 应用启动初始化。
 */
import { getMainWindow } from '@main/core/window'
import { sessionService } from '@main/services/session'
import { getSyncService } from '../index'
import { SessionSyncService } from './SessionSyncService'
import { SessionSyncTracker } from './sessionSyncTracker'

let instance: SessionSyncService | null = null

/** 获取会话同步引擎懒加载单例 */
export function getSessionSyncService(): SessionSyncService {
  if (!instance) {
    instance = new SessionSyncService({
      syncService: getSyncService(),
      storage: sessionService.getStorage(),
      tracker: new SessionSyncTracker(),
      broadcast: (state) => {
        getMainWindow()?.webContents.send('sync:sessionSyncState', state)
      }
    })
  }
  return instance
}

/**
 * 应用启动时初始化：已连接（身份恢复 + 续期成功）则启动定时同步并立即跑一轮。
 * 在 initializeSyncService() 之后调用。
 */
export function initializeSessionSyncService(): void {
  getSessionSyncService().start()
}
