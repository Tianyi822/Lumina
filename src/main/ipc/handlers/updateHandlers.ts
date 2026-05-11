import { ipcMain } from 'electron'
import { updateService, releaseNotesService } from '../../services/update'

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
    updateService.quitAndInstall()
  })

  ipcMain.handle('update:get-releases', async () => {
    return releaseNotesService.getReleases()
  })
}
