// 知识库索引状态 Store
// 管理知识库文件索引的进度状态，实现按知识库隔离

import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type {
  KnowledgeFileProcessingProgress,
  KnowledgeFileProgressEvent
} from '@shared/types/knowledge'

export type FileProcessingProgress = KnowledgeFileProcessingProgress
type FileProgressEvent = KnowledgeFileProgressEvent

export const useKnowledgeIndexStore = defineStore('knowledgeIndex', () => {
  // ==================== State ====================

  // 按知识库隔离的文件进度
  // 结构: kbId -> fileId -> FileProcessingProgress
  const kbFileProgress = ref<Record<string, Record<string, FileProcessingProgress>>>({})

  // 当前正在索引的知识库 ID（从后端同步）
  const activeIndexingKbId = ref<string | null>(null)

  // 正在重建索引的知识库 ID 集合
  const reindexingKbIds = ref<Set<string>>(new Set())

  // 定时刷新定时器 ID
  const refreshTimerId = ref<number | null>(null)

  // 正在进行 IPC 调用的文件集合（防止轮询清理掉排队中的文件）
  // 格式: "kbId:fileId"
  const activeIndexCalls = ref<Set<string>>(new Set())

  // IPC 事件监听器清理函数
  let progressCleanup: (() => void) | null = null

  // ==================== Getters ====================

  // 判断指定知识库是否正在索引
  function isKBIndexing(kbId: string): boolean {
    const files = kbFileProgress.value[kbId]
    if (!files) return false
    return Object.values(files).some((f) => f.status === 'processing')
  }

  // 判断指定知识库是否正在重建索引
  function isKBReindexing(kbId: string): boolean {
    return reindexingKbIds.value.has(kbId)
  }

  // 获取指定知识库的索引文件列表
  function getKBIndexingFiles(kbId: string): FileProcessingProgress[] {
    const files = kbFileProgress.value[kbId]
    if (!files) return []
    return Object.values(files)
  }

  // 获取指定知识库的索引文件映射（兼容原有组件接口）
  function getKBIndexingFilesMap(kbId: string): Record<string, FileProcessingProgress> {
    return kbFileProgress.value[kbId] || {}
  }

  // 获取指定文件的进度
  function getFileProgress(kbId: string, fileId: string): FileProcessingProgress | undefined {
    return kbFileProgress.value[kbId]?.[fileId]
  }

  // 是否有任何知识库正在索引
  const hasActiveIndexing = computed(() => {
    return Object.values(kbFileProgress.value).some((files) =>
      Object.values(files).some((f) => f.status === 'processing')
    )
  })

  // ==================== Actions ====================

  // 设置知识库正在重建索引
  function setKBReindexing(kbId: string, isReindexing: boolean): void {
    if (isReindexing) {
      reindexingKbIds.value.add(kbId)
    } else {
      reindexingKbIds.value.delete(kbId)
    }
    // 触发响应式更新
    reindexingKbIds.value = new Set(reindexingKbIds.value)
  }

  // 更新单个文件进度（IPC 事件调用）
  function updateFileProgress(kbId: string, progress: FileProcessingProgress): void {
    // 确保知识库的文件映射存在
    if (!kbFileProgress.value[kbId]) {
      kbFileProgress.value[kbId] = {}
    }

    const existing = kbFileProgress.value[kbId][progress.fileId]

    // 使用 Math.max 确保进度只增不减
    const newProgress: FileProcessingProgress = {
      ...progress,
      progress: Math.max(existing?.progress ?? 0, progress.progress ?? 0)
    }

    // 触发响应式更新
    kbFileProgress.value = {
      ...kbFileProgress.value,
      [kbId]: {
        ...kbFileProgress.value[kbId],
        [progress.fileId]: newProgress
      }
    }

    // 完成或失败后延迟清理
    if (progress.status === 'completed' || progress.status === 'failed') {
      setTimeout(() => {
        clearFileProgress(kbId, progress.fileId)
      }, 1000)
    }
  }

  // 设置文件开始索引（不设置 progress，等待后端事件）
  function setFileIndexing(kbId: string, fileId: string, fileName: string): void {
    if (!kbFileProgress.value[kbId]) {
      kbFileProgress.value[kbId] = {}
    }

    kbFileProgress.value = {
      ...kbFileProgress.value,
      [kbId]: {
        ...kbFileProgress.value[kbId],
        [fileId]: {
          fileId,
          fileName,
          status: 'processing'
          // 不设置 progress，等待后端事件
        }
      }
    }
  }

  // 批量设置文件开始索引
  function setFilesIndexing(
    kbId: string,
    files: Array<{ fileId: string; fileName: string }>
  ): void {
    if (!kbFileProgress.value[kbId]) {
      kbFileProgress.value[kbId] = {}
    }

    const newFiles: Record<string, FileProcessingProgress> = {}
    for (const file of files) {
      newFiles[file.fileId] = {
        fileId: file.fileId,
        fileName: file.fileName,
        status: 'processing'
      }
    }

    kbFileProgress.value = {
      ...kbFileProgress.value,
      [kbId]: {
        ...kbFileProgress.value[kbId],
        ...newFiles
      }
    }
  }

  // 设置文件索引失败
  function setFileFailed(kbId: string, fileId: string, error: string): void {
    if (!kbFileProgress.value[kbId]?.[fileId]) return

    kbFileProgress.value = {
      ...kbFileProgress.value,
      [kbId]: {
        ...kbFileProgress.value[kbId],
        [fileId]: {
          ...kbFileProgress.value[kbId][fileId],
          status: 'failed',
          error
        }
      }
    }

    // 延迟清理
    setTimeout(() => {
      clearFileProgress(kbId, fileId)
    }, 1000)
  }

  // 标记文件索引 IPC 调用开始
  function markIndexCallStarted(kbId: string, fileId: string): void {
    activeIndexCalls.value.add(`${kbId}:${fileId}`)
    activeIndexCalls.value = new Set(activeIndexCalls.value)
  }

  // 标记文件索引 IPC 调用结束
  function markIndexCallFinished(kbId: string, fileId: string): void {
    activeIndexCalls.value.delete(`${kbId}:${fileId}`)
    activeIndexCalls.value = new Set(activeIndexCalls.value)
  }

  // 清除单个文件的进度状态
  function clearFileProgress(kbId: string, fileId: string): void {
    if (!kbFileProgress.value[kbId]?.[fileId]) return

    const newFiles = { ...kbFileProgress.value[kbId] }
    delete newFiles[fileId]

    kbFileProgress.value = {
      ...kbFileProgress.value,
      [kbId]: newFiles
    }

    // 如果该知识库没有文件了，检查是否需要停止刷新
    if (Object.keys(newFiles).length === 0 && !hasActiveIndexing.value) {
      stopRefresh()
    }
  }

  // 清除指定知识库的所有进度状态
  function clearKBProgress(kbId: string): void {
    if (!kbFileProgress.value[kbId]) return

    const newProgress = { ...kbFileProgress.value }
    delete newProgress[kbId]
    kbFileProgress.value = newProgress
  }

  // 从后端刷新索引状态
  async function refreshFromBackend(): Promise<void> {
    try {
      const result = await window.api.knowledge.getIndexingStatus()
      if (!result.success || !result.data) return

      const { indexingFiles, activeIndexingKbId: activeKbId } = result.data
      activeIndexingKbId.value = activeKbId

      // 按知识库分组
      const groupedByKb: Record<string, FileProcessingProgress[]> = {}
      for (const file of indexingFiles) {
        if (!groupedByKb[file.kbId]) {
          groupedByKb[file.kbId] = []
        }
        groupedByKb[file.kbId].push({
          fileId: file.fileId,
          fileName: file.fileName || file.fileId,
          status: (file.status as FileProcessingProgress['status']) || 'processing',
          progress: file.progress
        })
      }

      // 更新每个知识库的状态
      for (const [kbId, files] of Object.entries(groupedByKb)) {
        if (!kbFileProgress.value[kbId]) {
          kbFileProgress.value[kbId] = {}
        }

        for (const file of files) {
          const existing = kbFileProgress.value[kbId][file.fileId]
          // 使用 Math.max 避免进度回退
          kbFileProgress.value[kbId][file.fileId] = {
            ...file,
            progress: Math.max(existing?.progress ?? 0, file.progress ?? 0)
          }
        }
      }

      // 清理已完成的文件（后端报告已完成但前端仍显示处理中）
      for (const [kbId, files] of Object.entries(kbFileProgress.value)) {
        const activeFileIds = new Set(groupedByKb[kbId]?.map((f) => f.fileId) || [])
        for (const [fileId, progress] of Object.entries(files)) {
          if (
            !activeFileIds.has(fileId) &&
            progress.status === 'processing' &&
            !activeIndexCalls.value.has(`${kbId}:${fileId}`)
          ) {
            // 标记为完成
            kbFileProgress.value[kbId][fileId] = {
              ...progress,
              status: 'completed',
              progress: 100
            }
            // 延迟清理
            setTimeout(() => {
              clearFileProgress(kbId, fileId)
            }, 1000)
          }
        }
      }

      // 触发响应式更新
      kbFileProgress.value = { ...kbFileProgress.value }
    } catch (error) {
      window.api.logger.error('[KnowledgeIndexStore] 刷新索引状态失败', {
        error: error instanceof Error ? error.message : String(error)
      })
    }
  }

  // 恢复指定知识库的索引状态（切换知识库时调用）
  async function restoreStatus(kbId: string): Promise<void> {
    await refreshFromBackend()

    // 如果该知识库有正在索引的文件，启动刷新
    if (isKBIndexing(kbId)) {
      startRefresh()
    }
  }

  // 启动定时刷新
  function startRefresh(): void {
    if (refreshTimerId.value !== null) {
      clearInterval(refreshTimerId.value)
    }

    refreshTimerId.value = window.setInterval(async () => {
      if (hasActiveIndexing.value) {
        await refreshFromBackend()
      } else {
        stopRefresh()
      }
    }, 2000)
  }

  // 停止定时刷新
  function stopRefresh(): void {
    if (refreshTimerId.value !== null) {
      clearInterval(refreshTimerId.value)
      refreshTimerId.value = null
    }
  }

  // 处理文件进度事件
  function handleFileProgressEvent(data: FileProgressEvent): void {
    updateFileProgress(data.kbId, data.progress)
  }

  // 设置 IPC 事件监听器
  function setupIpcListeners(): void {
    if (progressCleanup) return // 已经设置过了

    progressCleanup = window.api.onFileProgress(handleFileProgressEvent)
  }

  // 清理 IPC 事件监听器
  function cleanupIpcListeners(): void {
    if (progressCleanup) {
      progressCleanup()
      progressCleanup = null
    }
    stopRefresh()
  }

  // 自动设置监听器
  setupIpcListeners()

  return {
    // State
    kbFileProgress,
    activeIndexingKbId,
    reindexingKbIds,
    hasActiveIndexing,

    // Getters
    isKBIndexing,
    isKBReindexing,
    getKBIndexingFiles,
    getKBIndexingFilesMap,
    getFileProgress,

    // Actions
    setKBReindexing,
    updateFileProgress,
    setFileIndexing,
    setFilesIndexing,
    setFileFailed,
    clearFileProgress,
    clearKBProgress,
    markIndexCallStarted,
    markIndexCallFinished,
    refreshFromBackend,
    restoreStatus,
    startRefresh,
    stopRefresh,
    setupIpcListeners,
    cleanupIpcListeners
  }
})
