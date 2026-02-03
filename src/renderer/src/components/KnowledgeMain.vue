<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFileManager } from '@renderer/composables/knowledge/useFileManager'
import type { KnowledgeBase, FileItem } from '@renderer/types'

const props = defineProps<{
  knowledgeBase?: KnowledgeBase
}>()

const emit = defineEmits<{
  (e: 'add-files', kbId: string): void
  (e: 'file-unlinked', kbId: string, fileId: string): void
}>()

// 文件管理
const { getFilesByKBId, unlinkFileFromKB, formatFileSize, formatDate } = useFileManager()

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

// 知识库统计
const stats = ref({ fileCount: 0, chunkCount: 0, dbSize: 0 })
const loadingStats = ref(false)

const currentKB = computed(() => props.knowledgeBase)

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

  unlinkingFileId.value = fileId
  const result = await unlinkFileFromKB(fileId, currentKB.value.id)
  unlinkingFileId.value = null

  if (result.success) {
    linkedFiles.value = linkedFiles.value.filter((f) => f.id !== fileId)
    // 同时删除文件的向量索引
    await window.api.knowledge.removeFileIndex(currentKB.value.id, fileId)
    // 刷新统计
    await loadStats()
    // 通知父组件文件已取消关联
    emit('file-unlinked', currentKB.value.id, fileId)
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
 * 处理新关联的文件（同时索引文件）
 */
async function handleFilesLinked(files: FileItem[]): Promise<void> {
  if (!currentKB.value) return

  for (const file of files) {
    if (!linkedFiles.value.find((f) => f.id === file.id)) {
      linkedFiles.value.push(file)
      // 立即索引文件
      await indexFile(file)
    }
  }
  // 刷新统计
  await loadStats()
}

/**
 * 索引单个文件
 */
async function indexFile(file: FileItem): Promise<void> {
  if (!currentKB.value) return

  console.log('开始索引文件:', file.name)
  const result = await window.api.knowledge.indexFile(
    currentKB.value.id,
    file.id,
    file.absolutePath,
    file.name
  )

  if (!result.success) {
    console.error('索引文件失败:', file.name, result.error)
  } else {
    console.log('文件索引成功:', file.name)
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

// 监听知识库变化，自动加载文档和文件
watch(
  () => currentKB.value?.id,
  () => {
    if (currentKB.value) {
      loadLinkedFiles()
      loadStats()
      // 重置搜索
      searchQuery.value = ''
      searchResults.value = []
      searchPerformed.value = false
    } else {
      linkedFiles.value = []
      stats.value = { fileCount: 0, chunkCount: 0, dbSize: 0 }
    }
  },
  { immediate: true }
)

// 暴露方法给父组件
defineExpose({
  handleFilesLinked
})

function getFileIconBgClass(fileType: string): string {
  switch (fileType.toLowerCase()) {
    case 'pdf':
      return 'file-icon-bg-pdf'
    case 'txt':
      return 'file-icon-bg-txt'
    case 'md':
      return 'file-icon-bg-md'
    default:
      return 'file-icon-bg-default'
  }
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
              :disabled="reindexing || linkedFiles.length === 0"
              @click="handleReindex"
            >
              <span v-if="reindexing" class="spinner-tiny"></span>
              {{ reindexing ? '索引中...' : '重新索引' }}
            </button>
            <button class="btn-primary add-files-btn" @click="handleAddFiles">+ 添加文档</button>
          </div>
        </div>
        <p v-if="currentKB.description" class="kb-description">
          {{ currentKB.description }}
        </p>

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
      <div class="documents-section">
        <div class="section-header">
          <h3>文档列表</h3>
          <span v-if="linkedFiles.length > 0" class="document-count"
            >{{ linkedFiles.length }} 个文件</span
          >
        </div>

        <div v-if="loadingFiles" class="loading-state">
          <div class="spinner-small"></div>
          <span>加载中...</span>
        </div>

        <div v-else-if="linkedFiles.length === 0" class="empty-files">
          <p>暂无关联文档</p>
          <button class="btn-link" @click="handleAddFiles">添加文档</button>
        </div>

        <div v-else class="documents-grid">
          <!-- 已关联的文件卡片 -->
          <div
            v-for="file in linkedFiles"
            :key="file.id"
            :class="['document-card', { unlinking: unlinkingFileId === file.id }]"
          >
            <div class="document-card-header">
              <div :class="['document-icon', getFileIconBgClass(file.fileType)]">
                <span class="file-type-label">{{ file.fileType.toUpperCase() }}</span>
              </div>
              <button
                class="document-remove-btn"
                :disabled="unlinkingFileId === file.id"
                title="取消关联"
                @click.stop="handleUnlinkFile(file.id)"
              >
                <span v-if="unlinkingFileId === file.id" class="spinner-tiny"></span>
                <span v-else>✕</span>
              </button>
            </div>
            <div class="document-info">
              <div class="document-name" :title="file.name">{{ file.name }}</div>
              <div class="document-meta">
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

.kb-description {
  font-size: 13px;
  color: var(--theme-text-secondary);
  margin: 0 0 12px 0;
  line-height: 1.5;
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
}

.document-card:hover {
  border-color: var(--theme-accent);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.document-card.unlinking {
  opacity: 0.7;
  pointer-events: none;
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
  font-size: 11px;
  font-weight: 700;
}

.file-icon-bg-pdf {
  background-color: rgba(248, 81, 73, 0.15);
  color: #f85149;
}

.file-icon-bg-txt {
  background-color: rgba(88, 166, 255, 0.15);
  color: #58a6ff;
}

.file-icon-bg-md {
  background-color: rgba(63, 185, 80, 0.15);
  color: #3fb950;
}

.file-icon-bg-default {
  background-color: var(--theme-bg-hover);
  color: var(--theme-text-secondary);
}

.file-type-label {
  font-size: 10px;
  font-weight: 700;
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
  min-width: 0;
}

.document-name {
  font-size: 13px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 4px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.document-meta {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 11px;
  color: var(--theme-text-secondary);
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
</style>
