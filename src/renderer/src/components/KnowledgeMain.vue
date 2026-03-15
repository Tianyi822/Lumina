<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useFileStore } from '@renderer/stores'
import { useKnowledgeIndexStore } from '@renderer/stores'
import type { KnowledgeBase, FileItem, EmbeddingConfig } from '@renderer/types'
import SvgIcon from '@renderer/components/icons/SvgIcon.vue'

const props = defineProps<{
  knowledgeBase?: KnowledgeBase
}>()

const emit = defineEmits<{
  (e: 'add-files', kbId: string): void
  (e: 'file-unlinked', kbId: string, fileId: string): void
  (e: 'description-updated', kbId: string, description: string): void
}>()

const fileStore = useFileStore()

// 文件管理
const { getFilesByKBId, unlinkFileFromKB, formatFileSize, formatDate, uploadFile, linkFileToKB } =
  fileStore

// 索引状态 Store
const indexStore = useKnowledgeIndexStore()

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

// 重新索引进度
const reindexProgress = ref({ current: 0, total: 0, currentFile: '' })

// 重建索引状态（从 Store 获取，按知识库隔离）
const reindexing = computed(() => {
  if (!currentKB.value) return false
  return indexStore.isKBReindexing(currentKB.value.id)
})

// 拖拽状态
const isDragging = ref(false)
const dragCounter = ref(0)

// 知识库统计
const stats = ref({ fileCount: 0, chunkCount: 0, dbSize: 0 })
const loadingStats = ref(false)

const currentKB = computed(() => props.knowledgeBase)

// 嵌入模型配置
const embeddingModels = ref<Record<string, EmbeddingConfig>>({})
const loadingEmbeddingModels = ref(false)

/**
 * 加载所有嵌入模型配置
 */
async function loadEmbeddingModels(): Promise<void> {
  loadingEmbeddingModels.value = true
  try {
    const result = await window.api.embeddingModels.getAll()
    if (result.success && result.data) {
      embeddingModels.value = result.data
    }
  } catch (error) {
    console.error('加载嵌入模型配置失败:', error)
  } finally {
    loadingEmbeddingModels.value = false
  }
}

/**
 * 获取当前知识库嵌入模型的显示名称
 */
const embeddingModelDisplayName = computed(() => {
  const kb = currentKB.value
  if (!kb) return ''

  if (kb.embeddingConfig.displayName?.trim()) {
    return kb.embeddingConfig.displayName
  }

  const modelConfigs = Object.values(embeddingModels.value)
  const exactMatchedConfig = modelConfigs.find((modelConfig) => {
    return (
      modelConfig.baseUrl === kb.embeddingConfig.baseUrl &&
      modelConfig.model === kb.embeddingConfig.model &&
      modelConfig.dimensions === kb.embeddingConfig.dimensions &&
      (modelConfig.apiKey || '') === (kb.embeddingConfig.apiKey || '')
    )
  })

  if (exactMatchedConfig) {
    return exactMatchedConfig.displayName || exactMatchedConfig.model
  }

  const sameConfigMatched = modelConfigs.find((modelConfig) => {
    return (
      modelConfig.baseUrl === kb.embeddingConfig.baseUrl &&
      modelConfig.model === kb.embeddingConfig.model &&
      modelConfig.dimensions === kb.embeddingConfig.dimensions
    )
  })

  if (sameConfigMatched) {
    return sameConfigMatched.displayName || sameConfigMatched.model
  }

  const sameModelMatched = modelConfigs.find((modelConfig) => {
    return modelConfig.model === kb.embeddingConfig.model
  })

  if (sameModelMatched) {
    return sameModelMatched.displayName || sameModelMatched.model
  }

  return kb.embeddingConfig.model
})

// 计算当前知识库的索引状态（只影响当前知识库的操作）
const indexingStatus = computed(() => {
  if (!currentKB.value) return false
  return indexStore.isKBIndexing(currentKB.value.id)
})

// 当前知识库的索引进度（计算属性，自动响应变化）
const kbIndexingFiles = computed(() => {
  if (!currentKB.value) return {}
  return indexStore.getKBIndexingFilesMap(currentKB.value.id)
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

  // 使用 Store 设置索引状态（不设置 progress，等待后端事件）
  indexStore.setFileIndexing(currentKB.value.id, file.id, file.name)

  // 启动状态刷新
  indexStore.startRefresh()

  window.api.logger.info('[KnowledgeMain] 开始索引文件', { fileName: file.name })
  const result = await window.api.knowledge.indexFile(
    currentKB.value.id,
    file.id,
    file.absolutePath,
    file.name
  )

  if (!result.success) {
    console.error('索引文件失败:', file.name, result.error)
    indexStore.setFileFailed(currentKB.value.id, file.id, result.error || '索引失败')
  } else {
    window.api.logger.info('[KnowledgeMain] 文件索引成功', { fileName: file.name })
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
      const supportedTypes = ['.txt', '.md', '.pdf', '.doc', '.docx', '.csv']
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

  const kbId = currentKB.value.id
  indexStore.setKBReindexing(kbId, true)
  reindexProgress.value = { current: 0, total: linkedFiles.value.length, currentFile: '' }

  // 使用 Store 批量设置索引状态
  indexStore.setFilesIndexing(
    kbId,
    linkedFiles.value.map((f) => ({ fileId: f.id, fileName: f.name }))
  )

  // 启动状态刷新
  indexStore.startRefresh()

  try {
    const files = linkedFiles.value.map((f) => ({
      fileId: f.id,
      filePath: f.absolutePath,
      fileName: f.name
    }))

    const result = await window.api.knowledge.reindex(kbId, files)

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
    indexStore.setKBReindexing(kbId, false)
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

// 页面可见性变化时恢复状态（处理页面切换）
function handleVisibilityChange(): void {
  if (document.visibilityState === 'visible' && currentKB.value) {
    window.api.logger.debug('[KnowledgeMain] 页面变为可见，恢复索引状态')
    void indexStore.restoreStatus(currentKB.value.id)
  }
}

// 监听知识库变化，自动加载文档和文件
watch(
  () => currentKB.value?.id,
  async (newId) => {
    if (currentKB.value && newId) {
      await loadLinkedFiles()
      await loadStats()
      searchQuery.value = ''
      searchResults.value = []
      searchPerformed.value = false
      // 知识库切换时恢复索引状态
      await indexStore.restoreStatus(newId)
    } else {
      linkedFiles.value = []
      stats.value = { fileCount: 0, chunkCount: 0, dbSize: 0 }
    }
  },
  { immediate: true }
)

onMounted(async () => {
  // 监听页面可见性变化
  document.addEventListener('visibilitychange', handleVisibilityChange)

  // 加载嵌入模型配置
  await loadEmbeddingModels()

  // 恢复当前知识库正在进行的索引状态（延迟执行确保 currentKB 已就绪）
  if (currentKB.value) {
    setTimeout(() => {
      void indexStore.restoreStatus(currentKB.value!.id)
    }, 100)
  }
})

onUnmounted(() => {
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
    case 'doc':
      return 'file-icon-doc'
    case 'csv':
      return 'file-icon-csv'
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
            <span class="stat-label">显示名称:</span>
            <span class="stat-value">{{
              embeddingModelDisplayName || (loadingEmbeddingModels ? '...' : '')
            }}</span>
          </div>
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
                <SvgIcon v-if="file.fileType === 'pdf'" name="file-pdf" class="file-icon-svg" />
                <SvgIcon
                  v-else-if="file.fileType === 'txt'"
                  name="file-txt"
                  class="file-icon-svg"
                />
                <SvgIcon v-else-if="file.fileType === 'md'" name="file-md" class="file-icon-svg" />
                <SvgIcon v-else name="file" class="file-icon-svg" />
              </div>
              <button
                class="document-remove-btn"
                :disabled="unlinkingFileId === file.id || indexingStatus"
                title="取消关联"
                @click.stop="handleUnlinkFile(file.id)"
              >
                <span v-if="unlinkingFileId === file.id" class="spinner-tiny"></span>
                <SvgIcon v-else name="close" :size="12" />
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
  background: #46aa8f;
  border-color: rgba(70, 170, 143, 0.4);
}

.add-files-btn:hover {
  background: #3d9980;
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

.file-icon-doc {
  background-color: rgba(43, 87, 154, 0.15);
  color: #2b579a;
}

.file-icon-csv {
  background-color: rgba(16, 185, 129, 0.15);
  color: #10b981;
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
