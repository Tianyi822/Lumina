/**
 * Relay 错误码归一。服务端错误响应格式：
 *   { "error": { "code": "snake_case", "message": "...", "requestId"?: "..." } }
 * 客户端只依据 code 分支，不解析 message。
 */
import type { RelayErrorCode } from '@shared/types/sync'

/** 服务端稳定错误码集合（§12.2） */
const SERVER_ERROR_CODES = new Set<string>([
  'invalid_credentials',
  'invalid_device_proof',
  'device_revoked',
  'invalid_sync_code',
  'account_became_existing',
  'already_joined',
  'stale_manifest',
  'stale_session_file',
  'session_id_conflict',
  'group_changed',
  'block_busy',
  'bad_request',
  'block_hash_mismatch',
  'invalid_session_id',
  'block_not_found',
  'manifest_not_found',
  'session_file_not_found',
  'body_too_large',
  'quota_exceeded',
  'rate_limited',
  'internal_error',
  'relay_not_initialized'
])

/** 把服务端返回的原始 code 归一为 RelayErrorCode，未知值回落 unknown_error */
export function toRelayErrorCode(raw: unknown): RelayErrorCode {
  if (typeof raw === 'string' && SERVER_ERROR_CODES.has(raw)) {
    return raw as RelayErrorCode
  }
  return 'unknown_error'
}
