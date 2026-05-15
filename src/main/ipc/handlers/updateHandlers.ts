import { ipcMain } from 'electron'
import { updateService, releaseNotesService } from '../../services/update'
import { logger } from '../../services/logger'

/**
 * 注册自动更新相关 IPC 处理程序
 */
export function registerUpdateHandlers(): void {
  ipcMain.handle('update:check', async () => {
    return updateService.checkForUpdate()
  })

  ipcMain.handle('update:download', async () => {
    return updateService.downloadUpdate()
  })

  ipcMain.on('update:install', () => {
    try {
      updateService.quitAndInstall()
    } catch (error) {
      logger.error('重启安装失败', 'main', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  })

  ipcMain.handle('update:get-releases', async () => {
    return releaseNotesService.getReleases()
  })
}
