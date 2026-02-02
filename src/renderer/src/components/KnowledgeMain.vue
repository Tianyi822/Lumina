<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useFileManager } from '@renderer/composables/knowledge/useFileManager'
import type { KnowledgeBase, Document, FileItem } from '@renderer/types'

const props = defineProps<{
  knowledgeBase?: KnowledgeBase
}>()

const emit = defineEmits<{
  (e: 'add-files', kbId: string): void
  (e: 'file-unlinked', kbId: string, fileId: string): void
}>()

// 文件管理
const { getFilesByKBId, unlinkFileFromKB, formatFileSize, formatDate } = useFileManager()

// 文档数据（从后端获取，目前为空）
const documents = ref<Document[]>([])

// 关联的文件列表
const linkedFiles = ref<FileItem[]>([])
const loadingFiles = ref(false)
const unlinkingFileId = ref<string | null>(null)

const currentKB = computed(() => props.knowledgeBase)

async function loadDocuments(): Promise<void> {
  if (!currentKB.value) return
  // TODO: 从后端加载文档列表
}

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
 * 取消文件关联
 */
async function handleUnlinkFile(fileId: string): Promise<void> {
  if (!currentKB.value) return

  unlinkingFileId.value = fileId
  const result = await unlinkFileFromKB(fileId, currentKB.value.id)
  unlinkingFileId.value = null

  if (result.success) {
    linkedFiles.value = linkedFiles.value.filter((f) => f.id !== fileId)
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
 * 处理新关联的文件
 */
function handleFilesLinked(files: FileItem[]): void {
  for (const file of files) {
    if (!linkedFiles.value.find((f) => f.id === file.id)) {
      linkedFiles.value.push(file)
    }
  }
}

// 监听知识库变化，自动加载文档和文件
watch(
  () => currentKB.value?.id,
  () => {
    if (currentKB.value) {
      loadDocuments()
      loadLinkedFiles()
    } else {
      documents.value = []
      linkedFiles.value = []
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
            <button class="btn-primary add-files-btn" @click="handleAddFiles">+ 添加文档</button>
          </div>
        </div>
        <p v-if="currentKB.description" class="kb-description">
          {{ currentKB.description }}
        </p>
      </header>

      <!-- 文档列表区域 -->
      <div class="documents-section">
        <div v-if="loadingFiles" class="loading-state">
          <div class="spinner-small"></div>
          <span>加载中...</span>
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
  margin: 0;
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

/* 文档列表 */
.documents-section {
  flex: 1;
  overflow-y: auto;
  padding: 24px;
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
.documents-section::-webkit-scrollbar {
  width: 6px;
}

.documents-section::-webkit-scrollbar-track {
  background: transparent;
}

.documents-section::-webkit-scrollbar-thumb {
  background-color: var(--theme-border);
  border-radius: 3px;
}
</style>
