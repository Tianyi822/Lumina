/**
 * 通用 PUT + CAS（乐观并发）重试骨架。
 *
 * 五个领域同步引擎的上传循环结构一致：put → 收到 stale → 拉最新 rebase → 重试。
 * 差异只在「冲突时如何 merge 与落盘」——由调用方通过 onConflict 回调提供。
 * 本 helper 只收敛重试循环、stale 分支判定、非 stale 错误透传、重试耗尽记 error，
 * 不关心加密/解密/合并/落盘等领域细节。
 *
 * 适用：session-files 通道（session/writer/knowledge/paper-meta-annotations）。
 * 不适用：config manifest 链（每设备一条行，冲突只重推不 merge）、paper pack manifest
 * （内容指纹 CAS，无字段级 merge）——这两者保持各自内联的冲突处理。
 */
import type { RelayErrorCode, SyncResult } from '@shared/types/sync'
import { t } from '@main/services/i18n'

/** 默认 CAS 重试上限（与各引擎原 CAS_RETRY_LIMIT 一致） */
const DEFAULT_CAS_RETRY_LIMIT = 2

/** PUT 单次请求的抽象：传入待上传字节与 base 版本，返回 Result */
export type CasPutFn = (bytes: Uint8Array, base: number) => Promise<SyncResult<{ version: number }>>

/**
 * 冲突回调：收到 stale 后调用，负责拉最新远端内容、按领域语义 merge、落盘、重读。
 * 返回三种状态之一：
 *
 * - rebased：合并/落盘成功，bytes 为重读后的最新本地字节，nextBase 为重试 base（通常来自 GET 响应 header）。
 *   helper 会用这组 bytes+base 再次 PUT。
 * - resolved：冲突已在回调内自行解决（如远端 revision 胜出 → 转下行落盘 → 对齐 tracker），
 *   无需继续上行。helper 直接以 resolvedVersion 成功结束。
 * - failed：合并/落盘失败（如解密失败、merge 失败、落盘失败），附带 error 信息。
 *
 * 调用方可在回调内累加领域计数（如 result.merged++ / result.downloaded++）。
 */
export type CasOnConflict = (
  baseVersion: number
) => Promise<
  | { resolved: 'rebased'; bytes: Uint8Array; nextBase: number }
  | { resolved: 'resolved'; resolvedVersion: number }
  | { resolved: 'failed'; error: string }
>

/** 上传成功的结果 */
export interface CasPutOk {
  ok: true
  version: number
  /** 成功来源：put=PUT 成功；resolved=onConflict 回调内已自行解决（如转下行落盘），未实际上行 */
  via: 'put' | 'resolved'
}

/** 上传失败的结果 */
export interface CasPutFailed {
  ok: false
  /** 错误码（stale 重试耗尽为 unknown_error；其他透传 putFn 的 code） */
  code: RelayErrorCode
  error: string
}

/**
 * 执行 PUT + CAS 重试循环。
 *
 * 流程：
 * 1. 用 initialBytes + initialBase 尝试 putFn
 * 2. 成功 → 返回 {ok:true, version}
 * 3. stale_session_file/stale_manifest → 调 onConflict → 按回调结果：
 *    - rebased：用新 bytes+base 再次 PUT
 *    - resolved：以 resolvedVersion 直接成功结束（回调已自行落盘对齐）
 *    - failed：记 error 返回
 * 4. 其他错误 → 透传 {ok:false, code, error}
 * 5. 重试次数耗尽 → {ok:false, code:'unknown_error', error:'版本冲突重试耗尽'}
 *
 * stale 码判定宽松：同时认 stale_session_file 与 stale_manifest，避免调用方误用。
 */
export async function casPutWithMerge(params: {
  initialBytes: Uint8Array
  initialBase: number
  putFn: CasPutFn
  onConflict: CasOnConflict
  retryLimit?: number
}): Promise<CasPutOk | CasPutFailed> {
  const retryLimit = params.retryLimit ?? DEFAULT_CAS_RETRY_LIMIT
  let bytes = params.initialBytes
  let base = params.initialBase

  for (let attempt = 0; attempt <= retryLimit; attempt++) {
    const put = await params.putFn(bytes, base)
    if (put.success && put.data) {
      return { ok: true, version: put.data.version, via: 'put' }
    }
    // 非 stale 错误：透传调用方处理
    if (put.code !== 'stale_session_file' && put.code !== 'stale_manifest') {
      return {
        ok: false,
        code: put.code ?? 'unknown_error',
        error: put.error ?? t('notifications.sync.uploadFailed')
      }
    }
    // stale：最后一次循环不再 rebase，直接耗尽
    if (attempt >= retryLimit) break
    const conflict = await params.onConflict(base)
    if (conflict.resolved === 'failed') {
      return { ok: false, code: 'unknown_error', error: conflict.error }
    }
    if (conflict.resolved === 'resolved') {
      return { ok: true, version: conflict.resolvedVersion, via: 'resolved' }
    }
    bytes = conflict.bytes
    base = conflict.nextBase
  }
  return { ok: false, code: 'unknown_error', error: t('notifications.sync.casRetryExhausted') }
}
