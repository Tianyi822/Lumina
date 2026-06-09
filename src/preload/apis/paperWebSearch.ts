import { ipcRenderer } from 'electron'
import type { PaperWebSearchEnvironmentInfo } from '@shared/types/paper-web-search'

/**
 * 论文网页搜索相关的 API
 */
export const paperWebSearchApi = {
  /**
   * 检查论文网页搜索的运行环境
   * 包括检查 Playwright 等依赖是否已安装
   */
  checkEnvironment(): Promise<PaperWebSearchEnvironmentInfo> {
    return ipcRenderer.invoke('paper-web-search:checkEnvironment')
  }
}
