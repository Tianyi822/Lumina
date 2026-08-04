/**
 * config 同步子模块对外入口。
 * @public 懒加载单例 + 应用启动初始化。
 */
import { getMainWindow } from '@main/core/window'
import { configManager } from '@main/services/config'
import { getConfigFilePath } from '@main/services/config/configPaths'
import { getSyncService } from '../index'
import { ConfigSyncService } from './ConfigSyncService'
import { ConfigSyncTracker } from './configSyncTracker'

let instance: ConfigSyncService | null = null

/** 获取 config 同步引擎懒加载单例 */
export function getConfigSyncService(): ConfigSyncService {
  if (!instance) {
    instance = new ConfigSyncService({
      syncService: getSyncService(),
      configManager,
      tracker: new ConfigSyncTracker(),
      broadcast: (state) => {
        getMainWindow()?.webContents.send('sync:configSyncState', state)
      },
      configPathProvider: getConfigFilePath
    })
  }
  return instance
}

/**
 * 应用启动时初始化：已连接则启动定时同步并立即跑一轮。
 * 在 initializeSessionSyncService() 之后调用。
 */
export function initializeConfigSyncService(): void {
  getConfigSyncService().start()
}
