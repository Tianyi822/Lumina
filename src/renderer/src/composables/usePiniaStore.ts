/**
 * Pinia → React 桥接 hook
 *
 * 使 Pinia Setup Store 可在 React 组件中使用。
 * 利用 useSyncExternalStore + $subscribe 实现 React 对 Pinia 状态变化的订阅。
 *
 * 用法：
 *   const store = usePiniaStore(useLabStore)
 *   // 访问 state: store.currentLab
 *   // 调用 action: store.loadLabList()
 */

import { useRef, useSyncExternalStore } from 'react'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function usePiniaStore<T extends Record<string, any>>(useStoreFn: () => T): T {
  const storeRef = useRef<T | null>(null)
  const versionRef = useRef(0)
  const snapshotRef = useRef({ version: 0 })

  if (!storeRef.current) {
    storeRef.current = useStoreFn()
  }

  const store = storeRef.current

  useSyncExternalStore(
    (callback: () => void) => {
      const unsubscribe = store.$subscribe(() => {
        versionRef.current += 1
        snapshotRef.current = { version: versionRef.current }
        callback()
      })
      return unsubscribe
    },
    () => snapshotRef.current,
    () => snapshotRef.current
  )

  return store
}
