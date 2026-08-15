/**
 * 会话同步的 session-files key 判别（纯函数）。
 *
 * session-files 命名空间由多领域共用（knowledge-/paper-/writer- 前缀 key 同存），
 * 会话同步只处理"真会话 ID"的 key；否则会把其他领域密文当会话快照解密，
 * 因 AAD 域隔离永久失败（曾造成每轮 77 个"解密失败"误报）。
 * 注意：领域前缀排除是显式防线——即使未来 isValidSessionId 放宽（如对齐
 * 服务端宽松 key 正则），领域 key 也不会被误收为会话 key。
 */
import { isValidSessionId } from '@main/services/session/sessionPaths'
import { isKnowledgeKey } from '../knowledge/knowledgeSyncKeys'
import { isPaperKey } from '../paper/paperSyncKeys'
import { isWriterKey } from '../writer/writerSyncKeys'

/** 判断 key 是否属于会话同步：合法会话 ID 且不属于 knowledge/paper/writer 任一领域 */
export function isSessionSyncKey(key: string): boolean {
  if (!isValidSessionId(key)) return false
  if (isKnowledgeKey(key) || isPaperKey(key) || isWriterKey(key)) return false
  return true
}
