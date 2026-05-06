import { ipcRenderer } from 'electron'
import type { PaperWebSearchEnvironmentInfo } from '@shared/types/paper-web-search'

export const paperWebSearchApi = {
  checkEnvironment(): Promise<PaperWebSearchEnvironmentInfo> {
    return ipcRenderer.invoke('paper-web-search:checkEnvironment')
  }
}
