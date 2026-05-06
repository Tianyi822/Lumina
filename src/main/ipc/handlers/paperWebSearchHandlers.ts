import { ipcMain } from 'electron'
import { paperWebSearchService } from '@main/services/paper-web-search'
import type { PaperWebSearchEnvironmentInfo } from '@shared/types/paper-web-search'

export function registerPaperWebSearchHandlers(): void {
  ipcMain.handle(
    'paper-web-search:checkEnvironment',
    (): Promise<PaperWebSearchEnvironmentInfo> => {
      return paperWebSearchService.checkEnvironment()
    }
  )
}
