<script setup lang="ts">
import { ref, computed } from 'vue'
import type { KnowledgeBase, Document } from '@renderer/types'

const props = defineProps<{
  knowledgeBase?: KnowledgeBase
}>()

const emit = defineEmits<{
  (e: 'upload-documents'): void
}>()

// 模拟文档数据（实际应从后端获取）
const mockDocuments = ref<Document[]>([
  {
    id: 'doc-1',
    kbId: 'kb-1',
    name: '产品介绍.md',
    fileType: 'md',
    fileSize: 2048,
    chunkCount: 12,
    status: 'completed',
    createdAt: '2024-01-15T10:30:00Z',
    updatedAt: '2024-01-15T10:30:00Z'
  },
  {
    id: 'doc-2',
    kbId: 'kb-1',
    name: 'API 文档.txt',
    fileType: 'txt',
    fileSize: 4096,
    chunkCount: 24,
    status: 'completed',
    createdAt: '2024-01-15T11:00:00Z',
    updatedAt: '2024-01-15T11:00:00Z'
  }
])

const currentKB = computed(() => props.knowledgeBase)

function handleUpload(): void {
  emit('upload-documents')
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return '今天'
  if (diffDays === 1) return '昨天'
  if (diffDays < 7) return `${diffDays} 天前`
  return date.toLocaleDateString('zh-CN')
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
            <button class="btn-primary upload-btn" @click="handleUpload">
              上传文档
            </button>
          </div>
        </div>
        <p v-if="currentKB.description" class="kb-description">
          {{ currentKB.description }}
        </p>
      </header>

      <!-- 文档列表 -->
      <div class="documents-section">
        <div class="documents-list">
          <div v-for="doc in mockDocuments" :key="doc.id" class="document-item">
            <div class="doc-icon">
              {{ doc.fileType === 'md' ? '📝' : '📄' }}
            </div>
            <div class="doc-info">
              <div class="doc-name">{{ doc.name }}</div>
              <div class="doc-meta">
                {{ formatFileSize(doc.fileSize) }} · {{ doc.chunkCount }} 个分块 ·
                {{ formatDate(doc.createdAt) }}
              </div>
            </div>
            <div :class="['doc-status', doc.status]">
              {{ doc.status === 'completed' ? '✓ 已完成' : '处理中' }}
            </div>
          </div>

          <!-- 空状态 -->
          <div v-if="mockDocuments.length === 0" class="empty-state">
            <div class="empty-icon">📭</div>
            <h3>暂无文档</h3>
            <p>点击上方"上传文档"按钮添加文档到知识库</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 空状态（未选择知识库） -->
    <div v-else class="empty-kb">
      <div class="empty-icon">📚</div>
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

.upload-btn {
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

.documents-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.document-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  background-color: var(--theme-bg-secondary);
  border: 1px solid var(--theme-border);
  border-radius: 8px;
  transition: all 0.15s ease;
}

.document-item:hover {
  border-color: var(--theme-text-secondary);
}

.doc-icon {
  font-size: 24px;
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  background-color: var(--theme-bg-hover);
  border-radius: 8px;
  flex-shrink: 0;
}

.doc-info {
  flex: 1;
  min-width: 0;
}

.doc-name {
  font-size: 14px;
  font-weight: 500;
  color: var(--theme-text);
  margin-bottom: 4px;
}

.doc-meta {
  font-size: 12px;
  color: var(--theme-text-secondary);
}

.doc-status {
  font-size: 12px;
  padding: 4px 8px;
  border-radius: 4px;
  flex-shrink: 0;
}

.doc-status.completed {
  background-color: rgba(63, 185, 80, 0.1);
  color: var(--theme-success);
}

.doc-status.processing,
.doc-status.pending {
  background-color: rgba(210, 153, 34, 0.1);
  color: var(--theme-warning);
}

.doc-status.failed {
  background-color: rgba(248, 81, 73, 0.1);
  color: var(--theme-danger);
}

/* 空状态 */
.empty-state,
.empty-kb {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 60px 20px;
}

.empty-kb {
  flex: 1;
}

.empty-icon {
  font-size: 64px;
  margin-bottom: 16px;
  opacity: 0.5;
}

.empty-state h3,
.empty-kb h2 {
  font-size: 18px;
  font-weight: 600;
  color: var(--theme-text);
  margin: 0 0 8px 0;
}

.empty-state p,
.empty-kb p {
  font-size: 14px;
  color: var(--theme-text-secondary);
  margin: 0;
}
</style>
