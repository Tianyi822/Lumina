import { ipcMain } from 'electron'
import { paperWebSearchService } from '@main/services/paper-web-search'
import type { PaperWebSearchEnvironmentInfo } from '@shared/types/paper-web-search'

/**
 * 注册论文网页搜索相关的 IPC 处理程序
 * 处理 'paper-web-search:checkEnvironment' 通道，用于检查论文网页搜索的运行环境
 */
export function registerPaperWebSearchHandlers(): void {
  ipcMain.handle(
    'paper-web-search:checkEnvironment',
    (): Promise<PaperWebSearchEnvironmentInfo> => {
      return paperWebSearchService.checkEnvironment()
    }
  )
}
