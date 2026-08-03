/**
 * 同步子系统的本地路径解析。
 *
 * 同步元数据存放于 ~/.lumina/sync/ 独立目录，与被同步内容集完全隔离，
 * 不参与任何同步。此处从 configPaths 深路径导入 getConfigDirPath，
 * 以复用 Windows 注册表/主目录解析逻辑。
 */
import { join } from 'node:path'
import { getConfigDirPath } from '@main/services/config/configPaths'

const SYNC_DIR_NAME = 'sync'
const STATE_FILE_NAME = 'state.json'
const SECRETS_FILE_NAME = 'secrets.enc'
const SESSION_SYNC_FILE_NAME = 'session-sync.json'

/** 同步元数据目录 ~/.lumina/sync/ */
export function getSyncDirPath(): string {
  return join(getConfigDirPath(), SYNC_DIR_NAME)
}

/** 非机密状态文件 ~/.lumina/sync/state.json */
export function getSyncStateFilePath(): string {
  return join(getSyncDirPath(), STATE_FILE_NAME)
}

/** safeStorage 加密的机密文件 ~/.lumina/sync/secrets.enc */
export function getSyncSecretsFilePath(): string {
  return join(getSyncDirPath(), SECRETS_FILE_NAME)
}

/** 会话同步 tracker 文件 ~/.lumina/sync/session-sync.json */
export function getSessionSyncTrackerFilePath(): string {
  return join(getSyncDirPath(), SESSION_SYNC_FILE_NAME)
}
