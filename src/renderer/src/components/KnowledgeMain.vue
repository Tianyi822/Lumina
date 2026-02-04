<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useFileManager } from '@renderer/composables/knowledge/useFileManager'
import type { KnowledgeBase, FileItem } from '@renderer/types'

type FileProcessingProgress = {
  fileId: string
  fileName: string
  status: 'processing' | 'completed' | 'failed'
  progress?: number
  error?: string
}

type FileProgressEvent = {
  kbId: string
  progress: FileProcessingProgress
}

const props = defineProps<{
  knowledgeBase?: KnowledgeBase
}>()

const emit = defineEmits<{
  (e: 'add-files', kbId: string): void
  (e: 'file-unlinked', kbId: string, fileId: string): void
  (e: 'description-updated', kbId: string, description: string): void
}>()

// 文件管理
const { getFilesByKBId, unlinkFileFromKB, formatFileSize, formatDate, uploadFile, linkFileToKB } =
  useFileManager()

// 关联的文件列表
const linkedFiles = ref<FileItem[]>([])
const loadingFiles = ref(false)
const unlinkingFileId = ref<string | null>(null)

// 搜索测试
const searchQuery = ref('')
const searchResults = ref<
  Array<{
    chunkId: number
    fileId: string
    fileName: string
    content: string
    chunkIndex: number
    totalChunks: number
    similarity: number
  }>
>([])
const searching = ref(false)
const searchPerformed = ref(false)

// 重新索引
const reindexing = ref(false)
const reindexProgress = ref({ current: 0, total: 0, currentFile: '' })

// 文件索引状态跟踪 - 按 kbId:fileId 格式存储，确保知识库间隔离
const indexingFiles = ref<Record<string, FileProcessingProgress>>({})
const progressCleanup = ref<(() => void) | null>(null)

// 定期刷新状态定时器
const statusRefreshInterval = ref<ReturnType<typeof setInterval> | null>(null)

// 拖拽状态
const isDragging = ref(false)
const dragCounter = ref(0)

// 知识库统计
const stats = ref({ fileCount: 0, chunkCount: 0, dbSize: 0 })
const loadingStats = ref(false)

const currentKB = computed(() => props.knowledgeBase)

// 计算当前知识库的索引状态（只影响当前知识库的操作）
const indexingStatus = computed(() => {
  if (!currentKB.value) return false
  const prefix = `${currentKB.value.id}:`
  return Object.keys(indexingFiles.value).some((key) => key.startsWith(prefix))
})

// 当前知识库的索引进度（计算属性，自动响应变化）
const kbIndexingFiles = computed<Record<string, FileProcessingProgress>>(() => {
  if (!currentKB.value) return {}
  const prefix = `${currentKB.value.id}:`
  const result: Record<string, FileProcessingProgress> = {}

  for (const [key, progress] of Object.entries(indexingFiles.value)) {
    if (key.startsWith(prefix)) {
      const fileId = key.substring(prefix.length)
      result[fileId] = progress
    }
  }

  return result
})

/**
 * 加载知识库关联的文件列表
 */
async function loadLinkedFiles(): Promise<void> {
  if (!currentKB.value) return

  loadingFiles.value = true
  try {
    const files = await getFilesByKBId(currentKB.value.id)
    linkedFiles.value = files
  } finally {
    loadingFiles.value = false
  }
}

/**
 * 加载知识库统计信息
 */
async function loadStats(): Promise<void> {
  if (!currentKB.value) return

  loadingStats.value = true
  try {
    const result = await window.api.knowledge.getStats(currentKB.value.id)
    if (result.success && result.data) {
      stats.value = result.data
    }
  } catch (error) {
    console.error('加载统计信息失败:', error)
  } finally {
    loadingStats.value = false
  }
}

/**
 * 取消文件关联
 */
async function handleUnlinkFile(fileId: string): Promise<void> {
  if (!currentKB.value) return

  if (!confirm('确定要从知识库中移除此文档吗？移除后索引将与文档不匹配，需要手动重新索引。')) {
    return
  }

  unlinkingFileId.value = fileId
  const result = await unlinkFileFromKB(fileId, currentKB.value.id)
  unlinkingFileId.value = null

  if (result.success) {
    linkedFiles.value = linkedFiles.value.filter((f) => f.id !== fileId)
    await window.api.knowledge.removeFileIndex(currentKB.value.id, fileId)
    await loadStats()
    emit('file-unlinked', currentKB.value.id, fileId)

    if (linkedFiles.value.length > 0) {
      if (confirm('文档删除，需要重新索引，不然索引与原文不匹配。\n\n是否立即重新索引？')) {
        await handleReindex()
      }
    }
  } else {
    alert('取消关联失败: ' + (result.error || '未知错误'))
  }
}

/**
 * 添加文件
 */
function handleAddFiles(): void {
  if (!currentKB.value) return
  emit('add-files', currentKB.value.id)
}

/**
 * 索引单个文件
 */
async function indexSingleFile(file: FileItem): Promise<void> {
  if (!currentKB.value) return

  // 设置初始索引状态 - 使用新对象触发响应式更新
  const progressKey = getProgressKey(currentKB.value.id, file.id)
  indexingFiles.value = {
    ...indexingFiles.value,
    [progressKey]: {
      fileId: file.id,
      fileName: file.name,
      status: 'processing',
      progress: 0
    }
  }

  // 启动状态刷新
  startStatusRefresh()

  console.log('开始索引文件:', file.name)
  const result = await window.api.knowledge.indexFile(
    currentKB.value.id,
    file.id,
    file.absolutePath,
    file.name
  )

  if (!result.success) {
    console.error('索引文件失败:', file.name, result.error)
    indexingFiles.value = {
      ...indexingFiles.value,
      [progressKey]: {
        fileId: file.id,
        fileName: file.name,
        status: 'failed',
        error: result.error
      }
    }
  } else {
    console.log('文件索引成功:', file.name)
    await loadStats()
  }
}

/**
 * 处理新关联的文件（自动索引）
 */
async function handleFilesLinked(files: FileItem[]): Promise<void> {
  if (!currentKB.value) return

  const filesToIndex: FileItem[] = []

  for (const file of files) {
    if (!linkedFiles.value.find((f) => f.id === file.id)) {
      linkedFiles.value.push(file)
      filesToIndex.push(file)
    }
  }

  await loadStats()

  for (const file of filesToIndex) {
    await indexSingleFile(file)
  }
}

/**
 * 处理拖拽进入
 */
function handleDragEnter(event: DragEvent): void {
  event.preventDefault()
  dragCounter.value++
  if (dragCounter.value === 1) {
    isDragging.value = true
  }
}

/**
 * 处理拖拽离开
 */
function handleDragLeave(event: DragEvent): void {
  event.preventDefault()
  dragCounter.value--
  if (dragCounter.value === 0) {
    isDragging.value = false
  }
}

/**
 * 处理拖拽悬停
 */
function handleDragOver(event: DragEvent): void {
  event.preventDefault()
}

/**
 * 处理文件拖放
 */
async function handleDrop(event: DragEvent): Promise<void> {
  event.preventDefault()
  dragCounter.value = 0
  isDragging.value = false

  if (!currentKB.value) {
    alert('请先选择知识库')
    return
  }

  const files = event.dataTransfer?.files
  if (!files || files.length === 0) return

  // 上传并关联文件
  await uploadAndLinkFiles(Array.from(files))
}

/**
 * 上传并关联文件到知识库
 */
async function uploadAndLinkFiles(files: File[]): Promise<void> {
  if (!currentKB.value) return

  const uploadedFiles: FileItem[] = []
  const errors: string[] = []

  for (const file of files) {
    try {
      // 检查文件类型
      const supportedTypes = ['.txt', '.md', '.json', '.js', '.ts', '.vue', '.py', '.pdf']
      const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase()
      if (!supportedTypes.includes(ext)) {
        errors.push(`${file.name}: 不支持的文件类型`)
        continue
      }

      // 上传文件
      const result = await uploadFile(file)
      if (result.success && result.file) {
        uploadedFiles.push(result.file)
      } else {
        errors.push(`${file.name}: ${result.error || '上传失败'}`)
      }
    } catch (error) {
      errors.push(`${file.name}: ${error instanceof Error ? error.message : '上传失败'}`)
    }
  }

  // 关联到知识库并索引
  if (uploadedFiles.length > 0) {
    // 关联文件到知识库
    for (const file of uploadedFiles) {
      await linkFileToKB(file.id, currentKB.value.id)
    }

    // 更新文件列表并索引
    await handleFilesLinked(uploadedFiles)

    // 更新知识库列表中的文件数
    emit('file-unlinked', currentKB.value.id, '') // 触发父组件刷新
  }

  // 显示结果
  if (errors.length > 0) {
    alert(`上传完成\n成功: ${uploadedFiles.length} 个\n失败: ${errors.join('\n')}`)
  } else if (uploadedFiles.length > 0) {
    alert(`成功上传 ${uploadedFiles.length} 个文件`)
  }
}

/**
 * 重新索引整个知识库
 */
async function handleReindex(): Promise<void> {
  if (!currentKB.value) return

  if (linkedFiles.value.length === 0) {
    alert('没有文件需要索引')
    return
  }

  if (!confirm('确定要重新索引整个知识库吗？这将删除现有索引并重新构建。')) {
    return
  }

  reindexing.value = true
  reindexProgress.value = { current: 0, total: linkedFiles.value.length, currentFile: '' }

  // 为所有文件设置初始索引状态 - 使用新对象触发响应式更新
  const newIndexingFiles = { ...indexingFiles.value }
  for (const file of linkedFiles.value) {
    const progressKey = getProgressKey(currentKB.value.id, file.id)
    newIndexingFiles[progressKey] = {
      fileId: file.id,
      fileName: file.name,
      status: 'processing',
      progress: 0
    }
  }
  indexingFiles.value = newIndexingFiles

  // 启动状态刷新
  startStatusRefresh()

  try {
    const files = linkedFiles.value.map((f) => ({
      fileId: f.id,
      filePath: f.absolutePath,
      fileName: f.name
    }))

    const result = await window.api.knowledge.reindex(currentKB.value.id, files)

    if (result.success) {
      alert(`重新索引完成！成功索引 ${result.data?.indexedCount || 0} 个文件`)
    } else {
      const failedCount = result.data?.failedFiles?.length || 0
      if (failedCount > 0) {
        const errorDetails =
          result.data?.failedErrors?.join('\n') || result.data?.failedFiles.join('\n')
        alert(`重新索引完成，但有 ${failedCount} 个文件失败：\n${errorDetails}`)
      } else {
        alert('重新索引失败: ' + (result.error || '未知错误'))
      }
    }
  } catch (error) {
    alert('重新索引失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    reindexing.value = false
    reindexProgress.value = { current: 0, total: 0, currentFile: '' }
    await loadStats()
  }
}

/**
 * 执行搜索测试
 */
async function handleSearch(): Promise<void> {
  if (!currentKB.value || !searchQuery.value.trim()) return

  searching.value = true
  searchPerformed.value = false

  try {
    const result = await window.api.knowledge.search(
      currentKB.value.id,
      searchQuery.value.trim(),
      5
    )

    searchPerformed.value = true
    if (result.success && result.data?.results) {
      searchResults.value = result.data.results
    } else {
      searchResults.value = []
      if (result.error) {
        console.error('搜索失败:', result.error)
      }
    }
  } catch (error) {
    console.error('搜索失败:', error)
    searchResults.value = []
  } finally {
    searching.value = false
  }
}

/**
 * 生成索引进度的键
 */
function getProgressKey(kbId: string, fileId: string): string {
  return `${kbId}:${fileId}`
}

/**
 * 监听文件索引进度
 */
function handleFileProgress(data: FileProgressEvent): void {
  console.log('收到文件进度事件:', data)
  if (!currentKB.value || data.kbId !== currentKB.value.id) {
    console.log('跳过进度事件，知识库ID不匹配:', {
      eventKbId: data.kbId,
      currentKbId: currentKB.value?.id
    })
    return
  }

  const { fileId, status } = data.progress
  const progressKey = getProgressKey(data.kbId, fileId)

  // 使用新对象触发响应式更新
  indexingFiles.value = {
    ...indexingFiles.value,
    [progressKey]: data.progress
  }

  console.log('更新索引进度:', {
    kbId: data.kbId,
    fileId,
    status,
    progress: data.progress.progress,
    progressKey
  })

  if (status === 'completed' || status === 'failed') {
    setTimeout(() => {
      const newFiles = { ...indexingFiles.value }
      delete newFiles[progressKey]
      indexingFiles.value = newFiles
      // 检查是否还有正在索引的文件
      if (!indexingStatus.value) {
        stopStatusRefresh()
      }
    }, 1000)

    if (status === 'completed') {
      console.log('文件索引完成，更新统计信息')
      void loadStats()
    }
  }
}

/**
 * 格式化数据库大小
 */
function formatDBSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * 高亮文本中的搜索关键词
 */
function highlightText(text: string, query: string): string {
  if (!query.trim()) return escapeHtml(text)

  // 转义特殊字符，防止正则表达式错误
  const escapedQuery = escapeRegex(query.trim())
  // 使用不区分大小写的全局匹配
  const regex = new RegExp(`(${escapedQuery})`, 'gi')
  // 替换为高亮包裹的文本
  return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>')
}

/**
 * 转义 HTML 特殊字符
 */
function escapeHtml(text: string): string {
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * 刷新索引状态 - 从后端获取最新状态
 */
async function refreshIndexingStatus(): Promise<void> {
  if (!currentKB.value) return

  try {
    const result = await window.api.knowledge.getIndexingStatus()
    if (result.success && result.data) {
      const { indexingFiles: activeIndexingFiles } = result.data

      // 筛选出当前知识库的索引文件
      const currentKbFiles = activeIndexingFiles.filter((f) => f.kbId === currentKB.value!.id)

      // 构建新的索引状态对象
      const newIndexingFiles = { ...indexingFiles.value }

      // 更新索引状态 - 使用后端返回的进度
      for (const file of currentKbFiles) {
        const progressKey = getProgressKey(file.kbId, file.fileId)
        // 只更新正在处理的文件，不覆盖已有进度的文件（取最大值）
        const existingProgress = newIndexingFiles[progressKey]
        if (!existingProgress || existingProgress.status === 'processing') {
          newIndexingFiles[progressKey] = {
            fileId: file.fileId,
            fileName: file.fileName || file.fileId,
            status: (file.status as FileProcessingProgress['status']) || 'processing',
            // 使用后端返回的进度，或者已有的进度，或者0
            progress: Math.max(file.progress ?? 0, existingProgress?.progress ?? 0)
          }
        }
      }

      // 清理已完成的文件状态（如果后端报告已完成但前端仍显示处理中）
      const activeFileIds = new Set(currentKbFiles.map((f) => f.fileId))
      const prefix = `${currentKB.value.id}:`
      for (const key of Object.keys(newIndexingFiles)) {
        if (key.startsWith(prefix)) {
          const fileId = key.substring(prefix.length)
          if (!activeFileIds.has(fileId) && newIndexingFiles[key].status === 'processing') {
            // 后端报告已完成，更新为完成状态
            newIndexingFiles[key] = {
              ...newIndexingFiles[key],
              status: 'completed',
              progress: 100
            }
            // 延迟移除
            setTimeout(() => {
              const finalFiles = { ...indexingFiles.value }
              delete finalFiles[key]
              indexingFiles.value = finalFiles
            }, 1000)
          }
        }
      }

      // 触发响应式更新
      indexingFiles.value = newIndexingFiles
    }
  } catch (error) {
    console.error('刷新索引状态失败:', error)
  }
}

/**
 * 恢复索引状态（页面切换后重新挂载时调用）
 */
async function restoreIndexingStatus(): Promise<void> {
  console.log('尝试恢复索引状态, currentKB:', currentKB.value?.id)

  if (!currentKB.value) {
    console.log('currentKB 为空，跳过恢复')
    return
  }

  try {
    const result = await window.api.knowledge.getIndexingStatus()
    console.log('获取索引状态结果:', result)

    if (result.success && result.data) {
      const { indexingFiles: activeIndexingFiles } = result.data

      // 筛选出当前知识库的索引文件
      const currentKbFiles = activeIndexingFiles.filter((f) => f.kbId === currentKB.value!.id)
      console.log('当前知识库正在索引的文件:', currentKbFiles)

      // 恢复索引状态 - 使用新对象触发响应式更新，使用后端返回的进度
      const newIndexingFiles = { ...indexingFiles.value }
      for (const file of currentKbFiles) {
        const progressKey = getProgressKey(file.kbId, file.fileId)
        newIndexingFiles[progressKey] = {
          fileId: file.fileId,
          fileName: file.fileName || file.fileId,
          status: (file.status as FileProcessingProgress['status']) || 'processing',
          progress: file.progress ?? newIndexingFiles[progressKey]?.progress ?? 0
        }
      }
      indexingFiles.value = newIndexingFiles

      if (currentKbFiles.length > 0) {
        console.log('恢复索引状态成功:', {
          kbId: currentKB.value.id,
          files: currentKbFiles.map((f) => f.fileName || f.fileId)
        })

        // 如果有正在索引的文件，启动定期刷新
        startStatusRefresh()
      } else {
        console.log('当前知识库没有正在索引的文件')
      }
    }
  } catch (error) {
    console.error('恢复索引状态失败:', error)
  }
}

/**
 * 启动定期刷新状态
 */
function startStatusRefresh(): void {
  // 清除已有的定时器
  if (statusRefreshInterval.value) {
    clearInterval(statusRefreshInterval.value)
  }

  // 每 2 秒刷新一次状态
  statusRefreshInterval.value = setInterval(() => {
    const hasActiveIndexing = indexingStatus.value
    if (hasActiveIndexing) {
      void refreshIndexingStatus()
    } else {
      // 没有正在索引的文件，停止定时器
      stopStatusRefresh()
    }
  }, 2000)
}

/**
 * 停止定期刷新状态
 */
function stopStatusRefresh(): void {
  if (statusRefreshInterval.value) {
    clearInterval(statusRefreshInterval.value)
    statusRefreshInterval.value = null
  }
}

// 页面可见性变化时恢复状态（处理页面切换）
function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible') {
    console.log('页面变为可见，恢复索引状态')
    void restoreIndexingStatus()
  }
}

// 监听知识库变化，自动加载文档和文件
watch(
  () => currentKB.value?.id,
  async () => {
    if (currentKB.value) {
      await loadLinkedFiles()
      await loadStats()
      searchQuery.value = ''
      searchResults.value = []
      searchPerformed.value = false
      // 知识库切换时恢复索引状态
      await restoreIndexingStatus()
    } else {
      linkedFiles.value = []
      stats.value = { fileCount: 0, chunkCount: 0, dbSize: 0 }
      // 不清空 indexingFiles，保持其他知识库的进度
    }
  },
  { immediate: true }
)

onMounted(async () => {
  progressCleanup.value = window.api.onFileProgress(handleFileProgress)

  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // 恢复当前知识库正在进行的索引状态（延迟执行确保 currentKB 已就绪）
  setTimeout(() => {
    void restoreIndexingStatus()
  }, 100)
})

onUnmounted(() => {
  progressCleanup.value?.()
  stopStatusRefresh()
  document.removeEventListener('visibilitychange', handleVisibilityChange)
})

// 暴露方法给父组件
defineExpose({
  handleFilesLinked
})

/**
 * 关闭搜索结果
 */
function closeSearchResults(): void {
  searchQuery.value = ''
  searchResults.value = []
  searchPerformed.value = false
}

// ==================== 知识库简介编辑 ====================
const isEditingDescription = ref(false)
const editingDescription = ref('')
const descriptionTextareaRef = ref<HTMLTextAreaElement | null>(null)

/**
 * 开始编辑简介
 */
function startEditDescription(): void {
  if (!currentKB.value) return
  editingDescription.value = currentKB.value.description || ''
  isEditingDescription.value = true
  // 下一帧聚焦到 textarea
  setTimeout(() => {
    descriptionTextareaRef.value?.focus()
  }, 0)
}

/**
 * 保存简介
 */
async function saveDescription(): Promise<void> {
  if (!currentKB.value) return

  const trimmedDescription = editingDescription.value.trim()

  // 如果描述没有变化，直接退出编辑模式
  if (trimmedDescription === (currentKB.value.description || '')) {
    isEditingDescription.value = false
    return
  }

  try {
    const result = await window.api.knowledge.update(currentKB.value.id, {
      description: trimmedDescription
    })

    if (result.success) {
      // 更新本地数据
      if (currentKB.value) {
        currentKB.value.description = trimmedDescription
      }
      // 通知父组件更新
      emit('description-updated', currentKB.value.id, trimmedDescription)
    } else {
      console.error('保存简介失败:', result.error)
      alert('保存简介失败: ' + (result.error || '未知错误'))
    }
  } catch (error) {
    console.error('保存简介失败:', error)
    alert('保存简介失败: ' + (error instanceof Error ? error.message : String(error)))
  } finally {
    isEditingDescription.value = false
  }
}

/**
 * 取消编辑简介
 */
function cancelEditDescription(): void {
  isEditingDescription.value = false
  editingDescription.value = ''
}

/**
 * 处理简介编辑的键盘事件
 */
function handleDescriptionKeydown(event: KeyboardEvent): void {
  if (event.key === 'Escape') {
    cancelEditDescription()
  } else if (event.key === 'Enter' && event.metaKey) {
    // Cmd/Ctrl + Enter 保存
    void saveDescription()
  }
}

function getFileIconClass(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'file-icon-pdf'
    case 'txt':
      return 'file-icon-txt'
    case 'md':
      return 'file-icon-md'
    default:
      return 'file-icon-default'
  }
}

/**
 * 获取不带扩展名的文件名
 */
function getFileNameWithoutExtension(fileName: string): string {
  const lastDotIndex = fileName.lastIndexOf('.')
  if (lastDotIndex > 0) {
    return fileName.substring(0, lastDotIndex)
  }
  return fileName
}
</script>

<template>
  <main class="kb-main">
    <div v-if="currentKB" class="kb-content">
      <!-- 顶部信息栏 -->
      <header class="kb-header">
        <div class="kb-title-row">
          <h1 class="kb-title">{{ currentKB.name }}</h1>
          <div class="kb-actions">
            <button
              class="btn-secondary reindex-btn"
              :disabled="indexingStatus || reindexing || linkedFiles.length === 0"
              @click="handleReindex"
            >
              <span v-if="reindexing" class="spinner-tiny"></span>
              {{ reindexing ? '索引中...' : '重新索引' }}
            </button>
            <button class="btn-primary add-files-btn" @click="handleAddFiles">+ 添加文档</button>
          </div>
        </div>
        <div class="kb-description-container">
          <textarea
            v-if="isEditingDescription"
            ref="descriptionTextareaRef"
            v-model="editingDescription"
            class="kb-description-input"
            rows="2"
            placeholder="输入知识库简介..."
            @blur="saveDescription"
            @keydown="handleDescriptionKeydown"
          ></textarea>
          <p
            v-else
            class="kb-description"
            :class="{ 'kb-description-empty': !currentKB.description }"
            @dblclick="startEditDescription"
          >
            {{ currentKB.description || '双击添加简介...' }}
          </p>
          <span v-if="!isEditingDescription" class="edit-hint" @click="startEditDescription"
            >编辑</span
          >
        </div>

        <!-- 统计信息 -->
        <div class="kb-stats">
          <div class="stat-item">
            <span class="stat-label">向量维度:</span>
            <span class="stat-value">{{ currentKB.embeddingDimension }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">分块大小:</span>
            <span class="stat-value">{{ currentKB.chunkSize }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">已索引文件:</span>
            <span class="stat-value">{{ loadingStats ? '...' : stats.fileCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">文档块:</span>
            <span class="stat-value">{{ loadingStats ? '...' : stats.chunkCount }}</span>
          </div>
          <div class="stat-item">
            <span class="stat-label">数据库大小:</span>
            <span class="stat-value">{{ loadingStats ? '...' : formatDBSize(stats.dbSize) }}</span>
          </div>
        </div>
      </header>

      <!-- 搜索测试组件 -->
      <div class="search-section">
        <div class="search-header">
          <h3>搜索测试</h3>
          <span class="search-hint">验证知识库的检索效果</span>
        </div>
        <div class="search-input-row">
          <input
            v-model="searchQuery"
            type="text"
            class="input search-input"
            placeholder="输入测试查询..."
            @keyup.enter="handleSearch"
            @keyup.esc="closeSearchResults"
          />
          <button
            class="btn-primary search-btn"
            :disabled="searching || !searchQuery.trim()"
            @click="handleSearch"
          >
            <span v-if="searching" class="spinner-tiny"></span>
            <span v-else>搜索</span>
          </button>
        </div>

        <!-- 搜索结果 -->
        <div v-if="searchPerformed" class="search-results">
          <div v-if="searchResults.length === 0" class="search-empty">未找到相关结果</div>
          <div v-else class="search-results-list">
            <div v-for="result in searchResults" :key="result.chunkId" class="search-result-item">
              <div class="result-header">
                <span class="result-file">{{ result.fileName }}</span>
                <span class="result-similarity"
                  >相似度: {{ (result.similarity * 100).toFixed(1) }}%</span
                >
              </div>
              <!-- eslint-disable-next-line vue/no-v-html -->
              <div class="result-content" v-html="highlightText(result.content, searchQuery)"></div>
              <div class="result-meta">块 {{ result.chunkIndex }} / {{ result.totalChunks }}</div>
            </div>
          </div>
        </div>
      </div>

      <!-- 文档列表区域 -->
      <div
        class="documents-section"
        :class="{ 'drag-over': isDragging }"
        @dragenter="handleDragEnter"
        @dragleave="handleDragLeave"
        @dragover="handleDragOver"
        @drop="handleDrop"
      >
        <div class="section-header">
          <h3>文档列表</h3>
          <span v-if="linkedFiles.length > 0" class="document-count"
            >{{ linkedFiles.length }} 个文件</span
          >
        </div>

        <!-- 拖拽提示遮罩 -->
        <div v-if="isDragging" class="drag-overlay">
          <div class="drag-content">
            <div class="drag-icon">+</div>
            <div class="drag-text">释放文件以上传</div>
          </div>
        </div>

        <div v-if="loadingFiles" class="loading-state">
          <div class="spinner-small"></div>
          <span>加载中...</span>
        </div>

        <div v-else-if="linkedFiles.length === 0" class="documents-grid">
          <!-- 添加文件卡片（空状态时显示） -->
          <div class="add-file-card" @click="handleAddFiles">
            <div class="add-file-icon">+</div>
            <div class="add-file-text">添加文件</div>
          </div>
        </div>

        <div v-else class="documents-grid">
          <!-- 已关联的文件卡片 -->
          <div
            v-for="file in linkedFiles"
            :key="file.id"
            :class="[
              'document-card',
              {
                unlinking: unlinkingFileId === file.id,
                'indexing-disabled': indexingStatus
              }
            ]"
          >
            <div class="document-card-header">
              <div :class="['document-icon', getFileIconClass(file.fileType)]">
                <!-- PDF Icon -->
                <svg
                  v-if="file.fileType === 'pdf'"
                  class="file-icon-svg"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M204.8 0h477.866667l273.066666 273.066667v614.4c0 75.093333-61.44 136.533333-136.533333 136.533333H204.8c-75.093333 0-136.533333-61.44-136.533333-136.533333V136.533333C68.266667 61.44 129.706667 0 204.8 0z m477.866667 730.453333c20.48 0 68.266667 0 68.266666-47.786666 0-20.48-6.826667-47.786667-68.266666-47.786667-27.306667 0-54.613333 6.826667-81.92 6.826667-34.133333-27.306667-68.266667-61.44-88.746667-102.4 20.48-75.093333 20.48-122.88 6.826667-150.186667-6.826667-6.826667-20.48-13.653333-34.133334-13.653333-20.48 0-34.133333 6.826667-40.96 20.48-20.48 40.96 13.653333 116.053333 27.306667 150.186666-20.48 54.613333-40.96 109.226667-68.266667 163.84C273.066667 764.586667 273.066667 798.72 273.066667 812.373333c0 13.653333 6.826667 27.306667 20.48 34.133334 6.826667 6.826667 13.653333 6.826666 34.133333 0 68.266667-34.133333 116.053333-109.226666 54.613333-20.48 102.4-40.96 157.013333-47.786667 27.306667 20.48 61.44 34.133333 95.573334 34.133333z"
                    fill="currentColor"
                  />
                </svg>

                <!-- TXT Icon -->
                <svg
                  v-else-if="file.fileType === 'txt'"
                  class="file-icon-svg"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M899.072 403.968h-14.336V275.456c0-8.192-3.072-16.384-9.216-22.016L624.128 11.776c-6.144-5.632-13.312-8.704-21.504-8.704h-465.92C89.088 3.072 50.688 41.472 50.688 89.088v845.824c0 47.616 38.4 86.016 86.016 86.016h662.528c22.528 0 45.056-9.216 60.928-25.6 16.384-16.384 25.088-37.888 24.576-60.416v-60.416h14.848c22.528 0 43.52-8.704 59.392-25.088 15.872-15.872 24.576-36.864 24.064-58.88V487.936c0-46.08-37.888-83.968-83.968z m-292.864-324.096l185.856 178.176-185.856-4.608V79.872z"
                    fill="currentColor"
                  />
                </svg>

                <!-- MD Icon -->
                <svg
                  v-else-if="file.fileType === 'md'"
                  class="file-icon-svg"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M903.542857 256.8c6.857143 6.857143 10.742857 16.114286 10.742857 25.828571V987.428571c0 20.228571-16.342857 36.571429-36.571428 36.571429H146.285714c-20.228571 0-36.571429-16.342857-36.571429-36.571429V36.571429c0-20.228571 16.342857-36.571429 36.571428-36.571429h485.371429c9.714286 0 19.085714 3.885714 25.942857 10.742857l245.942857 246.057143zM829.942857 299.428571L614.857143 84.342857V299.428571h215.085714zM413.862857 613.634286l67.554286 151.965714a18.285714 18.285714 0 0 0 16.708571 10.857143h27.497143a18.285714 18.285714 0 0 0 16.72-10.868572l67.542857-152.4V793.142857a18.285714 18.285714 0 0 0 18.297143 18.285714H659.428571a18.285714 18.285714 0 0 0 18.285715-18.285714V482.285714a18.285714 18.285714 0 0 0-18.285715-18.285714h-39.714285a18.285714 18.285714 0 0 0-16.765715 10.994286L512.114286 683.657143l-90.834286-208.674286a18.285714 18.285714 0 0 0-16.765714-10.982857H364.571429a18.285714 18.285714 0 0 0-18.285715 18.285714v310.857143a18.285714 18.285714 0 0 0 18.285715 18.285714h31.005714a18.285714 18.285714 0 0 0 18.285714-18.285714V613.634286z"
                    fill="currentColor"
                  />
                </svg>

                <!-- Default Icon -->
                <svg
                  v-else
                  class="file-icon-svg"
                  viewBox="0 0 1024 1024"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    d="M853.333333 256H640V42.666667h42.666667v170.666666h170.666666V256zM298.666667 896h426.666666V469.333333H298.666667v426.666667z m0-512h426.666666V298.666667H298.666667v85.333333zM256 128h298.666667v85.333333H256V128z"
                    fill="currentColor"
                  />
                </svg>
              </div>
              <button
                class="document-remove-btn"
                :disabled="unlinkingFileId === file.id || indexingStatus"
                title="取消关联"
                @click.stop="handleUnlinkFile(file.id)"
              >
                <span v-if="unlinkingFileId === file.id" class="spinner-tiny"></span>
                <span v-else>✕</span>
              </button>
            </div>
            <div class="document-info">
              <div class="document-name" :title="file.name">
                {{ getFileNameWithoutExtension(file.name) }}
              </div>
              <div v-if="kbIndexingFiles[file.id]" class="bottom-group">
                <div class="file-progress">
                  <div class="progress-bar">
                    <div
                      class="progress-fill"
                      :style="{ width: `${kbIndexingFiles[file.id].progress || 0}%` }"
                    ></div>
                  </div>
                </div>
                <div class="document-meta">
                  <span class="document-type">{{ file.fileType.toUpperCase() }}</span>
                  <span>{{ formatFileSize(file.size) }}</span>
                  <span>{{ formatDate(file.uploadedAt) }}</span>
                </div>
              </div>
              <div v-else class="document-meta">
                <span class="document-type">{{ file.fileType.toUpperCase() }}</span>
                <span>{{ formatFileSize(file.size) }}</span>
                <span>{{ formatDate(file.uploadedAt) }}</span>
              </div>
            </div>
          </div>

          <!-- 添加文件卡片 -->
          <div class="add-file-card" @click="handleAddFiles">
            <div class="add-file-icon">+</div>
            <div class="add-file-text">添加文件</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态（未选择知识库） -->
    <div v-else class="empty-kb">
      <h2>选择或创建知识库</h2>
      <p>从左侧选择一个知识库，或创建新的知识库开始使用</p>
    </div>
  </main>
</template>

<style scoped>
.kb-main {
  flex: 1;
  display: flex;
  flex-direction: column;
  background-color: var(--theme-bg);
  overflow: hidden;
}

.kb-content {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 顶部信息栏 */
.kb-header {
  padding: 20px 24px 16px;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.kb-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 8px;
}

.kb-title {
  font-size: 28px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
  line-height: 28px;
}

.kb-description-container {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 12px;
}

.kb-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
  line-height: 1.5;
  cursor: pointer;
  flex: 1;
  padding: 4px 8px;
  border-radius: 6px;
  transition: all 0.15s ease;
}

.kb-description:hover {
  background-color: var(--theme-bg-secondary);
}

.kb-description-empty {
  color: var(--theme-text-muted);
  font-style: italic;
}

.kb-description-input {
  flex: 1;
  font-size: 13px;
  line-height: 1.5;
  padding: 4px 8px;
  border: 1px solid var(--theme-accent);
  border-radius: 6px;
  background-color: var(--theme-bg);
  color: var(--theme-text);
  resize: vertical;
  min-height: 40px;
  font-family: inherit;
}

.kb-description-input:focus {
  outline: none;
  box-shadow: 0 0 0 2px rgba(63, 185, 80, 0.2);
}

.edit-hint {
  font-size: 11px;
  color: var(--theme-text-muted);
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
  opacity: 0;
}

.kb-description-container:hover .edit-hint {
  opacity: 1;
}

.edit-hint:hover {
  color: var(--theme-accent);
  background-color: var(--theme-bg-secondary);
}

.kb-actions {
  display: flex;
  gap: 8px;
  flex-shrink: 0;
}

.add-files-btn {
  padding: 0 14px;
  font-size: 13px;
  height: 28px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
}

.reindex-btn {
  padding: 0 12px;
  font-size: 13px;
  height: 28px;
  white-space: nowrap;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  color: var(--theme-text);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.reindex-btn:hover:not(:disabled) {
  background-color: var(--theme-bg-hover);
  border-color: var(--theme-accent);
}

.reindex-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

/* 统计信息 */
.kb-stats {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--theme-border);
}

.stat-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
}

.stat-label {
  color: var(--theme-text-secondary);
}

.stat-value {
  color: var(--theme-text);
  font-weight: 500;
  font-family: var(--font-mono);
}

/* 搜索测试区域 */
.search-section {
  padding: 16px 24px;
  border-bottom: 1px solid var(--theme-border);
  flex-shrink: 0;
}

.search-header {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;
}

.search-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.search-hint {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.search-input-row {
  display: flex;
  gap: 8px;
}

.search-input {
  flex: 1;
}

.search-btn {
  padding: 0 16px;
  height: 32px;
  display: flex;
  align-items: center;
  gap: 6px;
}

/* 搜索结果 */
.search-results {
  margin-top: 12px;
  max-height: 250px;
  overflow-y: auto;
}

.search-empty {
  padding: 20px;
  text-align: center;
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.search-results-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.search-result-item {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  padding: 12px;
}

.result-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.result-file {
  font-size: 12px;
  font-weight: 500;
  color: var(--theme-accent);
}

.result-similarity {
  font-size: 11px;
  color: var(--theme-text-secondary);
  font-family: var(--font-mono);
}

.result-content {
  font-size: 13px;
  color: var(--theme-text);
  line-height: 1.5;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
  margin-bottom: 6px;
}

/* 搜索关键词高亮样式 */
.search-highlight {
  background-color: rgba(255, 193, 7, 0.4);
  color: var(--theme-text);
  padding: 1px 2px;
  border-radius: 3px;
  font-weight: 600;
}

.result-meta {
  font-size: 11px;
  color: var(--theme-text-secondary);
}

/* 文档列表 */
.documents-section {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.section-header h3 {
  font-size: 14px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0;
}

.document-count {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.loading-state {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 16px;
  color: var(--theme-text-secondary);
  font-size: 13px;
}

.empty-files {
  text-align: center;
  padding: 60px 20px;
  color: var(--theme-text-secondary);
}

.empty-files p {
  margin: 0 0 12px 0;
  font-size: 13px;
}

.btn-link {
  background: transparent;
  border: none;
  color: var(--theme-accent);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
  transition: all 0.15s ease;
}

.btn-link:hover {
  background-color: rgba(63, 185, 80, 0.1);
}

.documents-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

/* 文档卡片 */
.document-card {
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 12px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
  transition: all 0.2s ease;
  cursor: default;
  min-height: 160px;
}

.document-card:hover {
  border-color: var(--theme-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.document-card.unlinking {
  opacity: 0.7;
  pointer-events: none;
}

.document-card.indexing-disabled {
  opacity: 0.7;
  pointer-events: none;
}

/* 文件进度条 */
.file-progress {
}

.progress-bar {
  height: 3px;
  background-color: var(--theme-bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--theme-accent);
  transition: width 0.3s ease;
}

.document-card-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.document-icon {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  flex-shrink: 0;
}

.file-icon-pdf {
  background-color: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.file-icon-txt {
  background-color: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.file-icon-md {
  background-color: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.file-icon-default {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.file-icon-svg {
  width: 24px;
  height: 24px;
}

.document-remove-btn {
  width: 24px;
  height: 24px;
  border: none;
  background: transparent;
  color: var(--theme-text-secondary);
  font-size: 12px;
  cursor: pointer;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.15s ease;
  flex-shrink: 0;
}

.document-remove-btn:hover {
  background-color: var(--theme-bg-hover);
  color: var(--theme-danger);
}

.document-remove-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.document-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

.document-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.file-progress {
}

.progress-bar {
  height: 3px;
  background-color: var(--theme-bg-hover);
  border-radius: 2px;
  overflow: hidden;
}

.progress-fill {
  height: 100%;
  background-color: var(--theme-accent);
  transition: width 0.3s ease;
}

.document-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.bottom-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: auto;
}

.document-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
  margin-bottom: 8px;
}

.file-progress {
  margin-bottom: 4px;
}

.document-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 11px;
  color: var(--theme-text-secondary);
  margin-top: 0;
}

.file-progress:last-child + .document-meta {
  margin-top: 0;
}

.document-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}

.document-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: auto;
  font-size: 11px;
  color: var(--theme-text-secondary);
}

.document-type {
  font-size: 11px;
  color: var(--theme-accent);
  font-weight: 500;
}

/* Spinner */
.spinner-small {
  width: 14px;
  height: 14px;
  border: 2px solid var(--theme-border);
  border-top-color: var(--theme-accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

.spinner-tiny {
  width: 12px;
  height: 12px;
  border: 2px solid var(--theme-border);
  border-top-color: currentColor;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
  display: inline-block;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

/* 添加文件卡片 */
.add-file-card {
  background-color: var(--theme-bg-secondary);
  border: 2px dashed var(--theme-border);
  border-radius: 12px;
  padding: 24px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
  min-height: 160px;
}

.add-file-card:hover {
  border-color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.add-file-icon {
  width: 48px;
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px dashed var(--theme-border);
  border-radius: 50%;
  font-size: 24px;
  color: var(--theme-text-secondary);
  transition: all 0.2s ease;
}

.add-file-card:hover .add-file-icon {
  border-color: var(--theme-accent);
  color: var(--theme-accent);
}

.add-file-text {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text-secondary);
}

/* 空状态 */
.empty-kb {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
}

.empty-kb h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.empty-kb p {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0;
}

/* 滚动条 */
.documents-section::-webkit-scrollbar,
.search-results::-webkit-scrollbar {
  width: 6px;
}

.documents-section::-webkit-scrollbar-track,
.search-results::-webkit-scrollbar-track {
  background: transparent;
}

.documents-section::-webkit-scrollbar-thumb,
.search-results::-webkit-scrollbar-thumb {
  background-color: var(--theme-border);
  border-radius: 3px;
}

/* 拖拽相关样式 */
.documents-section {
  position: relative;
}

.documents-section.drag-over {
  border: 2px dashed var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.05);
}

.drag-overlay {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(63, 185, 80, 0.1);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  border: 2px dashed var(--theme-accent);
  border-radius: 12px;
}

.drag-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 16px;
  padding: 40px;
  background-color: var(--theme-bg);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
}

.drag-icon {
  width: 60px;
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 32px;
  font-weight: 300;
  color: var(--theme-accent);
  background-color: rgba(63, 185, 80, 0.1);
  border-radius: 50%;
}

.drag-text {
  font-size: 16px;
  font-weight: 500;
  color: var(--theme-text);
}
</style>
