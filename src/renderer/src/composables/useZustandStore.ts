import { reactive, onScopeDispose } from 'vue'

/**
 * Vue composable 桥接 Zustand store，使 store 状态在 Vue 中响应式。
 *
 * 用法：
 * ```ts
 * const uiState = useZustandStore(useUIStateStore)
 * // uiState.currentView — 响应式（state 属性）
 * // uiState.isPaperView() — getter 函数需要显式调用
 * // uiState.switchToKnowledgeView() — action 可直接调用
 * ```
 *
 * @param store Zustand store (create() 的返回值)
 */
export function useZustandStore<T extends object>(store: StoreLike<T>): T {
  const state = reactive(store.getState()) as T

  const unsub = store.subscribe((nextState) => {
    const target = state as Record<string, unknown>
    const source = nextState as Record<string, unknown>
    for (const key of Object.keys(source)) {
      if (target[key] !== source[key]) {
        target[key] = source[key]
      }
    }
  })

  onScopeDispose(unsub)
  return state
}

/** 结构类型 — 匹配任何 Zustand store（含 middleware 包装） */
interface StoreLike<T> {
  getState: () => T
  subscribe: (listener: (state: T, prevState: T) => void) => () => void
}
