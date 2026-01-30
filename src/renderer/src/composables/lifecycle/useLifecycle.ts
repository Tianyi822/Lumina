import { onMounted, onUnmounted } from 'vue'

/**
 * 生命周期管理 Composable
 * 封装应用初始化和清理逻辑
 *
 * 所有回调都是可选的,因为不同的页面组件会处理自己的初始化
 */
export function useLifecycle(options: {
  loadConfigStatus?: () => void
  setupStreamListener?: (cache: Map<string, any>) => void
  cleanupStreamListener?: () => void
  loadSessionList?: () => Promise<void>
  loadKnowledgeBases?: () => Promise<void>
}) {
  const {
    loadConfigStatus,
    setupStreamListener,
    cleanupStreamListener,
    loadSessionList,
    loadKnowledgeBases
  } = options

  /**
   * 组件挂载时执行
   */
  onMounted(async () => {
    if (loadConfigStatus) {
      loadConfigStatus()
    }
    if (setupStreamListener) {
      setupStreamListener(new Map())
    }
    if (loadSessionList) {
      await loadSessionList()
    }
    if (loadKnowledgeBases) {
      await loadKnowledgeBases()
    }
  })

  /**
   * 组件卸载时执行
   */
  onUnmounted(() => {
    // 清理流式监听器
    if (cleanupStreamListener) {
      cleanupStreamListener()
    }
  })
}
