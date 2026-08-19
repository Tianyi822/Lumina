import type { PaperWebSearchEnvironmentInfo } from '@shared/types/paper-web-search'

export type { PaperWebSearchEnvironmentInfo }

/**
 * 论文网页搜索相关的 API
 */
export interface PaperWebSearchApi {
  /** 检查论文网页搜索的运行环境 */
  checkEnvironment: () => Promise<PaperWebSearchEnvironmentInfo>
}
