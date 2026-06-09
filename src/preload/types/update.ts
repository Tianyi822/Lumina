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
  /** 检查新版本 */
  checkForUpdate: () => Promise<CheckUpdateResult>
  /** 下载新版本更新包 */
  downloadUpdate: () => Promise<{ success: boolean; error?: string }>
  /** 退出当前应用并安装更新 */
  quitAndInstall: () => void
  /** 获取版本发布历史列表 */
  getReleases: () => Promise<{ success: boolean; data?: ReleaseInfo[]; error?: string }>
  /** 监听更新状态变更事件 */
  onStatus: (callback: (event: UpdateStatusEvent) => void) => () => void
  /** 监听更新下载进度事件 */
  onProgress: (callback: (progress: DownloadProgress) => void) => () => void
}
