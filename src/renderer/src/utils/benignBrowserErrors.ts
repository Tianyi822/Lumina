/** 浏览器在 ResizeObserver 同帧内触发布局时常抛出的良性告警，不应导致应用崩溃 */
export function isBenignResizeObserverError(message: string): boolean {
  return (
    message === 'ResizeObserver loop completed with undelivered notifications.' ||
    message === 'ResizeObserver loop limit exceeded'
  )
}

export function shouldIgnoreGlobalErrorMessage(message: string): boolean {
  return isBenignResizeObserverError(message)
}
