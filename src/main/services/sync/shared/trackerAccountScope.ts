/**
 * 领域 tracker 的账号归属约定（五个领域的 XxxSyncTracker 通用）。
 *
 * 背景：disconnect 只清身份不清领域 tracker（~/.lumina/sync/*-sync.json）。
 * 换账号重连后，stale tracker 会把"新账号远端为空"误判为"对端已删除"，
 * 触发批量删除本地数据（曾误删 24 个本地会话）。tracker 记录 ownerAccountId 后，
 * 每轮同步前发现明确属于其他账号即整体重置——空 tracker 不会删任何本地数据，
 * 只会重新上传/下载；未绑定（旧格式文件缺字段）时静默认领当前账号，不重置。
 */
import { logger } from '@main/services/logger'

/** 所有领域 tracker 数据需携带的账号归属字段（可选：旧格式文件缺省视为未绑定） */
export interface AccountScopedTrackerData {
  ownerAccountId?: string | null
}

/** 判断是否需要因账号变更重置：任一侧未知（null/缺省）都不重置 */
export function trackerNeedsResetForAccount(
  ownerAccountId: string | null,
  currentAccountId: string | null
): boolean {
  if (ownerAccountId === null || currentAccountId === null) return false
  return ownerAccountId !== currentAccountId
}

/**
 * 通用重置/认领实现：各 tracker 的 resetIfOwnerChanged 委托此函数。
 * 返回新数据（重置时是新对象，认领/不动作时是原对象）与是否发生了重置。
 */
export function resetTrackerDataIfOwnerChanged<T extends AccountScopedTrackerData>(
  current: T,
  accountId: string | null,
  makeEmpty: () => T
): { data: T; reset: boolean } {
  const owner = current.ownerAccountId ?? null
  if (!trackerNeedsResetForAccount(owner, accountId)) {
    // 未绑定时认领当前账号（不动数据）；accountId 未知则完全不动作
    if (accountId !== null && owner === null) current.ownerAccountId = accountId
    return { data: current, reset: false }
  }
  const fresh = makeEmpty()
  fresh.ownerAccountId = accountId
  return { data: fresh, reset: true }
}

/** 各领域 runSync 开头调用：账号变更则重置 tracker 并打 WARN 便于排查 */
export function resetTrackerIfAccountChanged(
  domainLabel: string,
  tracker: { resetIfOwnerChanged(accountId: string | null): boolean },
  accountId: string | null
): void {
  if (tracker.resetIfOwnerChanged(accountId)) {
    logger.warn(`同步账号已变更，重置${domainLabel}同步 tracker`, 'main', { accountId })
  }
}
