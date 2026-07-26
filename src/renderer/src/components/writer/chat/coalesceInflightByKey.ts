/**
 * 将同一 key 的并发异步操作合并为同一 Promise。
 * settled 后清理，后续调用重新执行。
 */
export interface InflightByKeyState<T> {
  key: string | null
  promise: Promise<T> | null
}

export function createInflightByKeyState<T>(): InflightByKeyState<T> {
  return { key: null, promise: null }
}

export function coalesceInflightByKey<T>(
  state: InflightByKeyState<T>,
  key: string,
  run: () => Promise<T>
): Promise<T> {
  if (state.promise && state.key === key) {
    return state.promise
  }

  state.key = key
  const promise = run().finally(() => {
    if (state.key === key && state.promise === promise) {
      state.key = null
      state.promise = null
    }
  })
  state.promise = promise
  return promise
}
