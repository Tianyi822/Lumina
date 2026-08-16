/**
 * 同步服务对外入口。
 * @public 同步子系统对外公共 API（稳定导出表面）
 */
import { SyncService } from './SyncService'
import { logger } from '@main/services/logger'

let instance: SyncService | null = null

/** 获取同步服务懒加载单例 */
export function getSyncService(): SyncService {
  if (!instance) {
    instance = new SyncService()
  }
  return instance
}

/**
 * 应用启动时初始化同步服务：恢复本地身份并后台尝试会话续期。
 * 失败不阻止应用启动。
 */
export async function initializeSyncService(): Promise<void> {
  const service = getSyncService()
  service.restore()
  if (!service.getStatus().connected) {
    return
  }
  try {
    const result = await service.renewSession()
    if (!result.success) {
      logger.warn('同步会话续期失败', 'main', { code: result.code, error: result.error })
    }
  } catch (error) {
    logger.warn('同步会话续期异常', 'main', {
      error: error instanceof Error ? error.message : String(error)
    })
  }
}
