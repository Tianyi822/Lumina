import { onMounted, onUnmounted } from 'vue'

/**
 * 生命周期管理 Composable
 * 封装应用初始化和清理逻辑
 */
export function useLifecycle(options: {
  loadConfigStatus: () => void
  setupStreamListener: (cache: Map<string, any>) => void
  cleanupStreamListener: () => void
  loadSessionList: () => Promise<void>
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
    loadConfigStatus()
    setupStreamListener(new Map())
    await loadSessionList()

    // 加载知识库列表（如果提供了该方法）
    if (loadKnowledgeBases) {
      await loadKnowledgeBases()
    }
  })

  /**
   * 组件卸载时执行
   */
  onUnmounted(() => {
    // 清理流式监听器
    cleanupStreamListener()
  })
}
