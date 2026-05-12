import type {
  CheckUpdateResult,
  DownloadProgress,
  ReleaseInfo,
  UpdateStatusEvent
} from '@shared/types/update'

/**
 * 自动更新 API 类型定义
 */
export interface UpdateApi {
  /** 检查更新 */
  checkForUpdate: () => Promise<CheckUpdateResult>
  /** 下载更新 */
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
  /** 退出并安装更新 */
  quitAndInstall: () => void
  /** 获取版本历史列表 */
  getReleases: () => Promise<{ success: boolean; data?: ReleaseInfo[]; error?: string }>
  /** 监听更新状态变更 */
  onStatus: (callback: (event: UpdateStatusEvent) => void) => () => void
  /** 监听下载进度 */
  onProgress: (callback: (progress: DownloadProgress) => void) => () => void
}
